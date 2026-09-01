-- ================================================================
-- Sportonica — Organizer / Vendor role split + Venue Partnerships.
-- Run AFTER admin_schema.sql, tournaments.sql and tournament_fixtures.sql.
-- Safe to re-run.
--
-- Splits the old "vendor = venue owner who also runs tournaments" model
-- into two roles:
--   Vendor    = venue-only (profile, courts, availability) — unchanged,
--               still venue_staff/has_venue_access(), just no longer
--               grants tournament-management rights.
--   Organizer = tournament-only, never needs to own a venue. Connects to
--               a Vendor through a Partnership (invite/accept), and picks
--               a venue only from vendors they're actively partnered
--               with. Every tournament keeps a real, NOT NULL venue_id —
--               there's no free-text/untracked venue — so the existing
--               court-conflict scheduling (courts/court_hours/
--               court_blocks/court_bookings, used by schedule_match())
--               keeps working unchanged.
-- Super Admin's own tournaments go through the exact same
-- Organizer<->Vendor partnership flow as anyone else's — they just skip
-- pending_approval, not the partnership requirement.
-- ================================================================

-- ── PROFILES: add 'organizer' role, close a pre-existing privilege gap ──
-- profiles' own RLS ("update using (id = auth.uid())") only checks row
-- ownership, not which columns/values are allowed — so today any signed-in
-- user can already PATCH their own `role` straight to 'super_admin' via a
-- raw REST call. Widening this column to add self-serve 'organizer' makes
-- that gap worse unless it's closed at the same time.
create or replace function pg_temp.drop_check_constraints(p_table text, p_column text)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where nsp.nspname = 'public' and rel.relname = p_table
      and con.contype = 'c' and att.attname = p_column
  loop
    execute format('alter table public.%I drop constraint %I', p_table, r.conname);
  end loop;
end;
$$;

select pg_temp.drop_check_constraints('profiles', 'role');
alter table public.profiles add constraint profiles_role_check
  check (role in ('player','venue_owner','admin','super_admin','organizer'));

-- Blocks any client-session self-update of `role` except the one self-serve
-- transition (player -> organizer). auth.uid() is null for a direct
-- Studio/service-role change, so manually granting super_admin the way
-- is_super_admin() itself was created (per its own comment: "created
-- directly in the Studio, never committed") still works untouched.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    if not (old.role = 'player' and new.role = 'organizer') then
      raise exception 'ROLE_CHANGE_NOT_ALLOWED';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_role_change_trg on public.profiles;
create trigger guard_profile_role_change_trg before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- is_super_admin() also satisfies is_organizer(): a super_admin still needs
-- a real partnership+confirmed booking to create a tournament (see
-- create_tournament below), but shouldn't need a *separate* role flag on
-- top of super_admin just to pass the "are they an organizer at all" gate.
create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer')
    or public.is_super_admin();
$$;

-- ================================================================
-- PARTNERSHIPS
-- ================================================================
create table if not exists public.partnerships (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id    uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending_invite' check (status in ('pending_invite','active','revoked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (organizer_id, vendor_id)
);
create index if not exists idx_partnerships_organizer on public.partnerships(organizer_id);
create index if not exists idx_partnerships_vendor on public.partnerships(vendor_id);

drop trigger if exists partnerships_touch on public.partnerships;
create trigger partnerships_touch before update on public.partnerships
  for each row execute function public.set_updated_at();

alter table public.partnerships enable row level security;

drop policy if exists partnerships_read on public.partnerships;
drop policy if exists partnerships_organizer_insert on public.partnerships;
drop policy if exists partnerships_update on public.partnerships;

create policy partnerships_read on public.partnerships for select
  using (organizer_id = auth.uid() or vendor_id = auth.uid() or public.is_super_admin());

-- Only an organizer sends invites, always as themselves.
create policy partnerships_organizer_insert on public.partnerships for insert
  with check (organizer_id = auth.uid() and public.is_organizer());

-- Either side updates their own row: vendor accepts/declines
-- (pending_invite -> active/revoked), organizer can revoke their own too.
create policy partnerships_update on public.partnerships for update
  using (organizer_id = auth.uid() or vendor_id = auth.uid() or public.is_super_admin())
  with check (organizer_id = auth.uid() or vendor_id = auth.uid() or public.is_super_admin());

-- ================================================================
-- TOURNAMENTS: venue booking status (Vendor confirms hosting THIS
-- tournament, on top of the standing Partnership).
-- ================================================================
alter table public.tournaments add column if not exists venue_booking_status
  text not null default 'pending' check (venue_booking_status in ('pending','confirmed','declined'));

-- True iff the caller is this tournament's real Organizer: they own it,
-- AND they have an active partnership with the venue's vendor. Centralizes
-- the one clause every lifecycle RPC below repeats, instead of hand-copying
-- the exists(...) check into all sixteen of them.
create or replace function public.is_tournament_organizer(v_row public.tournaments)
returns boolean language sql stable security definer set search_path = public as $$
  select
    v_row.owner_id is not null
    and v_row.owner_id = auth.uid()
    and exists (
      select 1 from public.venues ve
      join public.partnerships p on p.vendor_id = ve.owner_id
      where ve.id = v_row.venue_id
        and p.organizer_id = auth.uid()
        and p.status = 'active'
    );
$$;

-- Vendor confirms or declines hosting one specific tournament — required
-- before the Organizer can submit it for review (see publish_tournament).
create or replace function public.set_venue_booking_status(p_id uuid, p_status text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments; v_vendor_id uuid;
begin
  if p_status not in ('confirmed','declined') then raise exception 'INVALID_STATUS'; end if;
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select owner_id into v_vendor_id from public.venues where id = v_row.venue_id;
  if not (v_vendor_id = auth.uid() or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set venue_booking_status = p_status where id = p_id returning * into v_row;

  if v_row.owner_id is not null then
    insert into public.notifications (user_id, kind, title, body, tournament_id, actor_id)
    values (
      v_row.owner_id, 'tournament_venue_booking_updated',
      v_row.name || ': venue booking ' || p_status,
      case when p_status = 'confirmed' then 'The venue confirmed hosting this tournament — you can submit it for review.'
           else 'The venue declined to host this tournament — pick another venue.' end,
      v_row.id, auth.uid()
    );
  end if;

  return v_row;
end;
$$;
grant execute on function public.set_venue_booking_status(uuid,text) to authenticated;

select pg_temp.drop_check_constraints('notifications', 'kind');
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected',
                   'game_payment_required','game_payment_reminder',
                   'game_payment_submitted','game_payment_verified',
                   'game_payment_rejected','game_payment_expired',
                   'game_host_payment_submitted','game_host_payment_expired',
                   'game_payment_cash_selected',
                   'tournament_published','tournament_registration_submitted',
                   'tournament_payment_verified','tournament_payment_rejected',
                   'tournament_announcement','tournament_match_scheduled',
                   'tournament_venue_booking_updated'));

-- ================================================================
-- create_tournament: the one entry point that needs a real
-- organizer-with-active-partnership check (bringing a brand new
-- tournament into existence at a vendor's venue is the moment their
-- consent actually matters) — every other lifecycle RPC below reuses
-- is_tournament_organizer() on an EXISTING row instead, where
-- is_super_admin() keeps its usual override for support/moderation.
-- ================================================================
create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := (p->>'venue_id')::uuid;
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  select owner_id into v_vendor_id from public.venues where id = v_venue_id;
  if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;

  if not (
    public.is_organizer()
    and exists (
      select 1 from public.partnerships
      where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
    )
  ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.tournaments (
    venue_id, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules
  ) values (
    v_venue_id,
    auth.uid(),
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules'
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- ── update_tournament_draft: has_venue_access -> is_tournament_organizer ──
create or replace function public.update_tournament_draft(p_id uuid, p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'NOT_A_DRAFT'; end if;

  update public.tournaments set
    name = coalesce(p->>'name', name),
    sport = coalesce(p->>'sport', sport),
    banner_url = coalesce(p->>'banner_url', banner_url),
    description = coalesce(p->>'description', description),
    contact_phone = coalesce(p->>'contact_phone', contact_phone),
    starts_at = coalesce((p->>'starts_at')::timestamptz, starts_at),
    ends_at = coalesce((p->>'ends_at')::timestamptz, ends_at),
    registration_opens_at = coalesce((p->>'registration_opens_at')::timestamptz, registration_opens_at),
    registration_closes_at = coalesce((p->>'registration_closes_at')::timestamptz, registration_closes_at),
    match_duration_mins = coalesce((p->>'match_duration_mins')::int, match_duration_mins),
    format = coalesce(p->>'format', format),
    max_teams = coalesce((p->>'max_teams')::int, max_teams),
    min_players_per_team = coalesce((p->>'min_players_per_team')::int, min_players_per_team),
    max_players_per_team = coalesce((p->>'max_players_per_team')::int, max_players_per_team),
    substitute_limit = coalesce((p->>'substitute_limit')::int, substitute_limit),
    registration_mode = coalesce(p->>'registration_mode', registration_mode),
    gender_rule = coalesce(p->>'gender_rule', gender_rule),
    skill_category = coalesce(p->>'skill_category', skill_category),
    fee = coalesce((p->>'fee')::numeric, fee),
    payment_instructions = coalesce(p->>'payment_instructions', payment_instructions),
    refund_policy = coalesce(p->>'refund_policy', refund_policy),
    prize_winner = coalesce(p->>'prize_winner', prize_winner),
    prize_runner_up = coalesce(p->>'prize_runner_up', prize_runner_up),
    prize_mvp = coalesce(p->>'prize_mvp', prize_mvp),
    prize_other = coalesce(p->>'prize_other', prize_other),
    rules_text = coalesce(p->>'rules_text', rules_text),
    equipment_notes = coalesce(p->>'equipment_notes', equipment_notes),
    venue_rules = coalesce(p->>'venue_rules', venue_rules)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_tournament_draft(uuid,jsonb) to authenticated;

-- ── publish_tournament: has_venue_access -> is_tournament_organizer,
-- plus a new venue_booking_status gate ──
create or replace function public.publish_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  if v_row.venue_booking_status <> 'confirmed' then raise exception 'VENUE_NOT_CONFIRMED'; end if;

  if v_row.name is null or v_row.sport is null or v_row.venue_id is null
     or v_row.max_teams is null or v_row.min_players_per_team is null or v_row.max_players_per_team is null
  then
    raise exception 'INCOMPLETE_TOURNAMENT';
  end if;

  update public.tournaments
    set status = case when public.is_super_admin() then 'published' else 'pending_approval' end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.publish_tournament(uuid) to authenticated;

-- ── open/close registration, cancel: has_venue_access -> is_tournament_organizer ──
create or replace function public.open_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'published' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_open' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.open_tournament_registration(uuid) to authenticated;

create or replace function public.close_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'registration_open' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_closed' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.close_tournament_registration(uuid) to authenticated;

create or replace function public.cancel_tournament(p_id uuid, p_reason text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;

-- ── Fixtures/scoring RPCs: has_venue_access -> is_tournament_organizer ──
create or replace function public.set_team_seed(p_team_id uuid, p_seed int, p_group_name text default null)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if v_team.status <> 'confirmed' then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  update public.tournament_teams
    set seed = p_seed, group_name = coalesce(p_group_name, group_name)
    where id = p_team_id
    returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.set_team_seed(uuid,int,text) to authenticated;

create or replace function public.generate_knockout_bracket(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_knockout_bracket(p_tournament_id, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_knockout_bracket(uuid) to authenticated;

create or replace function public.generate_league_fixtures(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'league' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_round_robin(p_tournament_id, 'league', null, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_league_fixtures(uuid) to authenticated;

create or replace function public.generate_group_fixtures(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_group text;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'group_knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;
  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is null
  ) then
    raise exception 'TEAMS_NOT_GROUPED';
  end if;

  for v_group in
    select distinct group_name from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed'
    order by group_name
  loop
    select array_agg(id order by seed nulls last, created_at) into v_team_ids
      from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'confirmed' and group_name = v_group;
    perform public.build_round_robin(p_tournament_id, 'group', v_group, v_team_ids);
  end loop;

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_group_fixtures(uuid) to authenticated;

create or replace function public.generate_knockout_from_groups(p_tournament_id uuid, p_advance_per_group int default 2)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_group text;
  v_advancing uuid[] := '{}';
  v_group_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'group_knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'live' then raise exception 'INVALID_TRANSITION'; end if;
  if p_advance_per_group < 1 then raise exception 'INVALID_ADVANCE_COUNT'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id and stage = 'knockout') then
    raise exception 'ALREADY_GENERATED';
  end if;
  if exists (
    select 1 from public.tournament_matches
    where tournament_id = p_tournament_id and stage = 'group' and status not in ('completed','walkover','cancelled')
  ) then
    raise exception 'GROUP_STAGE_INCOMPLETE';
  end if;

  for v_group in
    select distinct group_name from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is not null
    order by group_name
  loop
    select array_agg(team_id) into v_group_ids from (
      select team_id from public.tournament_standings(p_tournament_id, v_group)
      order by points desc, won desc, team_name asc
      limit p_advance_per_group
    ) s;
    v_advancing := v_advancing || coalesce(v_group_ids, '{}'::uuid[]);
  end loop;

  perform public.build_knockout_bracket(p_tournament_id, v_advancing);

  return v_t;
end;
$$;
grant execute on function public.generate_knockout_from_groups(uuid,int) to authenticated;

create or replace function public.schedule_match(p_match_id uuid, p_court_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_court_venue uuid;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_TIME_RANGE'; end if;

  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status in ('completed','walkover','cancelled') then raise exception 'MATCH_ALREADY_DONE'; end if;

  select venue_id into v_court_venue from public.courts where id = p_court_id;
  if v_court_venue is null then raise exception 'COURT_NOT_FOUND'; end if;
  if v_court_venue <> v_t.venue_id then raise exception 'COURT_NOT_IN_VENUE'; end if;

  perform 1 from public.courts where id = p_court_id for update;

  if exists (
    select 1 from public.court_bookings
    where court_id = p_court_id
      and state not in ('dropped','no_show','refunded','cancelled')
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  if exists (
    select 1 from public.court_blocks
    where court_id = p_court_id
      and (tournament_match_id is null or tournament_match_id <> p_match_id)
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_BLOCKED';
  end if;

  delete from public.court_blocks where tournament_match_id = p_match_id;

  insert into public.court_blocks (court_id, starts_at, ends_at, reason, note, created_by, tournament_match_id)
  values (p_court_id, p_starts_at, p_ends_at, 'tournament_match', v_t.name || ' — ' || v_match.round_label, auth.uid(), p_match_id);

  update public.tournament_matches
    set court_id = p_court_id, starts_at = p_starts_at, ends_at = p_ends_at, status = 'scheduled'
    where id = p_match_id
    returning * into v_match;

  insert into public.notifications (user_id, kind, title, body, tournament_id, actor_id)
  select captain_id, 'tournament_match_scheduled', v_t.name || ' — match scheduled',
         v_match.round_label || ' is scheduled for ' || to_char(p_starts_at, 'DD Mon, HH24:MI'),
         v_t.id, auth.uid()
  from public.tournament_teams where id in (v_match.team_a_id, v_match.team_b_id);

  return v_match;
end;
$$;
grant execute on function public.schedule_match(uuid,uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.unschedule_match(p_match_id uuid)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status <> 'scheduled' then raise exception 'INVALID_TRANSITION'; end if;

  delete from public.court_blocks where tournament_match_id = p_match_id;

  update public.tournament_matches
    set court_id = null, starts_at = null, ends_at = null, status = 'unscheduled'
    where id = p_match_id
    returning * into v_match;
  return v_match;
end;
$$;
grant execute on function public.unschedule_match(uuid) to authenticated;

create or replace function public.record_match_result(p_match_id uuid, p_score_a int default null, p_score_b int default null, p_winner_team_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner, score_a = null, score_b = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;
    if p_score_a = p_score_b and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;
    v_winner := case when p_score_a > p_score_b then v_match.team_a_id
                      when p_score_b > p_score_a then v_match.team_b_id
                      else null end;
    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b, winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid) to authenticated;

create or replace function public.complete_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'live' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (
    select 1 from public.tournament_matches
    where tournament_id = p_id and status not in ('completed','walkover','cancelled')
  ) then
    raise exception 'INCOMPLETE_MATCHES';
  end if;

  update public.tournaments set status = 'completed' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.complete_tournament(uuid) to authenticated;

create or replace function public.post_tournament_announcement(p_tournament_id uuid, p_title text, p_body text default null)
returns public.tournament_announcements
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_row public.tournament_announcements;
begin
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_t) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.tournament_announcements (tournament_id, title, body, posted_by)
  values (p_tournament_id, trim(p_title), p_body, auth.uid())
  returning * into v_row;

  insert into public.notifications (user_id, kind, title, body, tournament_id, actor_id)
  select captain_id, 'tournament_announcement', v_t.name || ': ' || v_row.title, v_row.body, v_t.id, auth.uid()
  from public.tournament_teams
  where tournament_id = p_tournament_id and status = 'confirmed';

  return v_row;
end;
$$;
grant execute on function public.post_tournament_announcement(uuid,text,text) to authenticated;

-- ================================================================
-- RLS: Organizer read access. The existing *_read_organizer policies on
-- tournament_teams/tournament_matches/tournament_announcements/payments,
-- plus tournaments_read_owner on the main table, all key off
-- has_venue_access() — which only venue_staff satisfies. An Organizer
-- (owner_id on the tournament, not a venue_staff row) couldn't otherwise
-- see their own draft/pending_approval tournament, its roster, matches,
-- announcements or payments at all. Vendor's existing read access is
-- untouched — has_venue_access() still works exactly as before for their
-- own venue's tournaments regardless of who organizes them (this is what
-- powers the Vendor's read-only Bookings list).
-- ================================================================
drop policy if exists tournaments_read_organizer_own on public.tournaments;
create policy tournaments_read_organizer_own on public.tournaments for select
  using (owner_id = auth.uid());

drop policy if exists tournament_teams_read_organizer_own on public.tournament_teams;
create policy tournament_teams_read_organizer_own on public.tournament_teams for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

drop policy if exists tournament_team_players_read_organizer_own on public.tournament_team_players;
create policy tournament_team_players_read_organizer_own on public.tournament_team_players for select
  using (exists (
    select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
    where tt.id = team_id and t.owner_id = auth.uid()
  ));

drop policy if exists pay_organizer_tournament_read on public.payments;
create policy pay_organizer_tournament_read on public.payments for select
  using (
    booking_type = 'tournament_registration'
    and exists (
      select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
      where tt.id = tournament_registration_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists tournament_matches_read_organizer_own on public.tournament_matches;
create policy tournament_matches_read_organizer_own on public.tournament_matches for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

drop policy if exists tournament_announcements_read_organizer_own on public.tournament_announcements;
create policy tournament_announcements_read_organizer_own on public.tournament_announcements for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

-- ================================================================
-- MIGRATION: grandfather every existing venue owner/manager as an
-- Organizer, self-partnered with their own venue's vendor identity, and
-- confirm the venue booking on every tournament they already have. Nobody
-- loses access to anything they could already do before this ships.
-- ================================================================
insert into public.partnerships (organizer_id, vendor_id, status)
select distinct vs.user_id, ve.owner_id, 'active'
from public.venue_staff vs
join public.venues ve on ve.id = vs.venue_id
where vs.role in ('owner','manager')
on conflict (organizer_id, vendor_id) do nothing;

update public.profiles set role = 'organizer'
where role = 'player'
  and id in (select distinct user_id from public.venue_staff where role in ('owner','manager'));

update public.tournaments set venue_booking_status = 'confirmed'
where venue_booking_status <> 'confirmed';

-- ── DONE ─────────────────────────────────────────────────────────
