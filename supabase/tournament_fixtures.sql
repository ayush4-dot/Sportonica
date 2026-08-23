-- ================================================================
-- Sportonica — Tournaments Phase 2: fixtures, brackets, standings,
-- scheduling and announcements. Run AFTER tournaments.sql. Safe to
-- re-run.
--
-- Design notes:
--   * Seeding is manual (vendor sets tournament_teams.seed / .group_name
--     before generating fixtures) — no random draw.
--   * A fixture's court+time reuses the SAME conflict-checking pattern
--     as book_court() (admin_schema.sql / booking_phone.sql): lock the
--     court row, check overlap against court_bookings AND court_blocks,
--     raise SLOT_TAKEN / SLOT_BLOCKED. It reserves the slot via
--     court_blocks (tagged with tournament_match_id) rather than
--     court_bookings, because a tournament match has no payer/price —
--     it's the vendor blocking their own court, exactly what
--     court_blocks already models.
--   * Results are vendor-entered directly (record_match_result) — no
--     captain-submission/dispute flow.
--   * Standings use fixed points (win=3, draw=1, loss=0), derived on
--     read from tournament_matches — never stored.
-- ================================================================

-- ── FIXTURES ────────────────────────────────────────────────────────
alter table public.tournament_teams add column if not exists seed int;
alter table public.tournament_teams add column if not exists group_name text;

create table if not exists public.tournament_matches (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  stage           text not null check (stage in ('group','league','knockout')),
  group_name      text,
  round           int not null,
  round_label     text not null,
  team_a_id       uuid references public.tournament_teams(id),
  team_b_id       uuid references public.tournament_teams(id),
  next_match_id   uuid references public.tournament_matches(id),
  next_match_slot text check (next_match_slot in ('a','b')),
  court_id        uuid references public.courts(id),
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text not null default 'unscheduled' check (status in
                    ('unscheduled','scheduled','completed','walkover','cancelled')),
  score_a         int,
  score_b         int,
  winner_team_id  uuid references public.tournament_teams(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (team_a_id is null or team_b_id is null or team_a_id <> team_b_id)
);

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_next on public.tournament_matches(next_match_id);
create index if not exists idx_tournament_matches_court on public.tournament_matches(court_id);

drop trigger if exists tournament_matches_touch on public.tournament_matches;
create trigger tournament_matches_touch before update on public.tournament_matches
  for each row execute function public.set_updated_at();

alter table public.court_blocks add column if not exists tournament_match_id
  uuid references public.tournament_matches(id) on delete set null;
create index if not exists idx_court_blocks_tournament_match on public.court_blocks(tournament_match_id);

create table if not exists public.tournament_announcements (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  body          text,
  posted_by     uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_tournament_announcements_tournament on public.tournament_announcements(tournament_id);

-- ================================================================
-- RLS
-- ================================================================
alter table public.tournament_matches enable row level security;
alter table public.tournament_announcements enable row level security;

drop policy if exists tournament_matches_read_public on public.tournament_matches;
drop policy if exists tournament_matches_read_organizer on public.tournament_matches;
drop policy if exists tournament_matches_read_super on public.tournament_matches;
create policy tournament_matches_read_public on public.tournament_matches for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval')));
create policy tournament_matches_read_organizer on public.tournament_matches for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.has_venue_access(t.venue_id)));
create policy tournament_matches_read_super on public.tournament_matches for select
  using (public.is_super_admin());

drop policy if exists tournament_announcements_read_public on public.tournament_announcements;
drop policy if exists tournament_announcements_read_organizer on public.tournament_announcements;
drop policy if exists tournament_announcements_read_super on public.tournament_announcements;
create policy tournament_announcements_read_public on public.tournament_announcements for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval')));
create policy tournament_announcements_read_organizer on public.tournament_announcements for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.has_venue_access(t.venue_id)));
create policy tournament_announcements_read_super on public.tournament_announcements for select
  using (public.is_super_admin());

-- Teams were previously visible only to their own captain/roster, the
-- organizer, or a super_admin (tournaments.sql). Brackets/standings need
-- confirmed team names to be publicly visible once the tournament is —
-- same "not in draft/pending_approval" gate as everything else public.
drop policy if exists tournament_teams_read_public on public.tournament_teams;
create policy tournament_teams_read_public on public.tournament_teams for select
  using (
    status = 'confirmed'
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval'))
  );

-- ── Widen existing check constraints (court_blocks.reason, notifications.kind) ──
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

select pg_temp.drop_check_constraints('court_blocks', 'reason');
alter table public.court_blocks add constraint court_blocks_reason_check
  check (reason in ('manual','maintenance','walk_in','phone_booking','offline','tournament_match'));

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
                   'tournament_announcement','tournament_match_scheduled'));

drop function pg_temp.drop_check_constraints(text, text);

-- ================================================================
-- Internal helpers (no grants — only ever called from the security
-- definer RPCs below, running as the function owner).
-- ================================================================

create or replace function public.tournament_round_label(p_round int, p_rounds int)
returns text language sql immutable as $$
  select case
    when p_round = p_rounds then 'Final'
    when p_round = p_rounds - 1 then 'Semifinal'
    when p_round = p_rounds - 2 then 'Quarterfinal'
    else 'Round ' || p_round
  end;
$$;

-- Builds a single-elimination bracket from an ordered (seeded) list of
-- team ids. Byes go to the top `pow2 - n` seeds (standard convention) —
-- guaranteed to be fewer than the number of round-1 pairs, so no pair
-- ever gets two byes. Round-1 byes auto-complete and propagate
-- immediately since only one bye level is ever possible this way.
create or replace function public.build_knockout_bracket(p_tournament_id uuid, p_team_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_team_ids, 1), 0);
  v_pow int := 1;
  v_rounds int := 0;
  v_byes int;
  v_cur_ids uuid[] := '{}';
  v_next_ids uuid[];
  v_round int;
  v_matches_in_round int;
  v_i int;
  v_match_id uuid;
  v_left uuid;
  v_right uuid;
  v_label text;
  v_bye record;
begin
  if v_n < 2 then raise exception 'NOT_ENOUGH_TEAMS'; end if;

  while v_pow < v_n loop
    v_pow := v_pow * 2;
    v_rounds := v_rounds + 1;
  end loop;
  v_byes := v_pow - v_n;

  for v_i in 1..v_byes loop
    v_label := public.tournament_round_label(1, v_rounds);
    insert into public.tournament_matches (tournament_id, stage, round, round_label, team_a_id, status, winner_team_id)
    values (p_tournament_id, 'knockout', 1, v_label, p_team_ids[v_i], 'completed', p_team_ids[v_i])
    returning id into v_match_id;
    v_cur_ids := v_cur_ids || v_match_id;
  end loop;

  v_i := v_byes + 1;
  while v_i < v_n loop
    v_label := public.tournament_round_label(1, v_rounds);
    insert into public.tournament_matches (tournament_id, stage, round, round_label, team_a_id, team_b_id, status)
    values (p_tournament_id, 'knockout', 1, v_label, p_team_ids[v_i], p_team_ids[v_i + 1], 'unscheduled')
    returning id into v_match_id;
    v_cur_ids := v_cur_ids || v_match_id;
    v_i := v_i + 2;
  end loop;

  for v_round in 2..v_rounds loop
    v_matches_in_round := array_length(v_cur_ids, 1) / 2;
    v_next_ids := '{}';
    for v_i in 1..v_matches_in_round loop
      v_label := public.tournament_round_label(v_round, v_rounds);
      insert into public.tournament_matches (tournament_id, stage, round, round_label, status)
      values (p_tournament_id, 'knockout', v_round, v_label, 'unscheduled')
      returning id into v_match_id;
      v_next_ids := v_next_ids || v_match_id;

      v_left := v_cur_ids[(v_i - 1) * 2 + 1];
      v_right := v_cur_ids[(v_i - 1) * 2 + 2];
      update public.tournament_matches set next_match_id = v_match_id, next_match_slot = 'a' where id = v_left;
      update public.tournament_matches set next_match_id = v_match_id, next_match_slot = 'b' where id = v_right;
    end loop;
    v_cur_ids := v_next_ids;
  end loop;

  for v_bye in
    select id, team_a_id from public.tournament_matches
    where tournament_id = p_tournament_id and stage = 'knockout' and round = 1 and status = 'completed'
  loop
    perform public.propagate_match_winner(v_bye.id, v_bye.team_a_id);
  end loop;
end;
$$;

-- Round-robin over an ordered team list using the standard "circle
-- method" so no team plays twice in the same round. Used for both
-- league (p_group_name null) and each group of a group_knockout
-- tournament (called once per group).
create or replace function public.build_round_robin(p_tournament_id uuid, p_stage text, p_group_name text, p_team_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_team_ids, 1), 0);
  v_arr uuid[] := p_team_ids;
  v_rounds int;
  v_round int;
  v_i int;
  v_home uuid;
  v_away uuid;
  v_label text;
begin
  if v_n < 2 then raise exception 'NOT_ENOUGH_TEAMS'; end if;
  if v_n % 2 = 1 then
    v_arr := v_arr || null::uuid;
    v_n := v_n + 1;
  end if;
  v_rounds := v_n - 1;

  for v_round in 1..v_rounds loop
    v_label := coalesce(p_group_name || ' · ', '') || 'Round ' || v_round;
    for v_i in 1..(v_n / 2) loop
      v_home := v_arr[v_i];
      v_away := v_arr[v_n - v_i + 1];
      if v_home is not null and v_away is not null then
        insert into public.tournament_matches (tournament_id, stage, group_name, round, round_label, team_a_id, team_b_id, status)
        values (p_tournament_id, p_stage, p_group_name, v_round, v_label, v_home, v_away, 'unscheduled');
      end if;
    end loop;
    v_arr := array[v_arr[1]] || v_arr[v_n] || v_arr[2:v_n - 1];
  end loop;
end;
$$;

create or replace function public.propagate_match_winner(p_match_id uuid, p_winner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if not found or v_match.next_match_id is null then return; end if;

  if v_match.next_match_slot = 'a' then
    update public.tournament_matches set team_a_id = p_winner_id where id = v_match.next_match_id;
  else
    update public.tournament_matches set team_b_id = p_winner_id where id = v_match.next_match_id;
  end if;
end;
$$;

-- ================================================================
-- Standings — always derived, fixed points (win=3, draw=1, loss=0).
-- Defined before generate_knockout_from_groups(), which reads from it.
-- ================================================================
create or replace function public.tournament_standings(p_tournament_id uuid, p_group_name text default null)
returns table(team_id uuid, team_name text, played int, won int, drawn int, lost int, points int)
language sql stable as $$
  with relevant_matches as (
    select * from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and m.stage in ('league','group')
      and (p_group_name is null or m.group_name = p_group_name)
      and m.status in ('completed','walkover')
  )
  select
    t.id as team_id,
    t.name as team_name,
    count(rm.id)::int as played,
    count(rm.id) filter (where rm.winner_team_id = t.id)::int as won,
    count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b)::int as drawn,
    count(rm.id) filter (where rm.winner_team_id is not null and rm.winner_team_id <> t.id)::int as lost,
    (count(rm.id) filter (where rm.winner_team_id = t.id) * 3
     + count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b))::int as points
  from public.tournament_teams t
  left join relevant_matches rm on (rm.team_a_id = t.id or rm.team_b_id = t.id)
  where t.tournament_id = p_tournament_id and t.status = 'confirmed'
    and (p_group_name is null or t.group_name = p_group_name)
  group by t.id, t.name
  order by points desc, won desc, team_name asc;
$$;
grant execute on function public.tournament_standings(uuid,text) to anon, authenticated;

-- ================================================================
-- Seeding
-- ================================================================
create or replace function public.set_team_seed(p_team_id uuid, p_seed int, p_group_name text default null)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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

-- ================================================================
-- Fixture generation (registration_closed -> live)
-- ================================================================
create or replace function public.generate_knockout_bracket(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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

-- ================================================================
-- Scheduling — reuses book_court()'s lock-then-check pattern
-- (admin_schema.sql / booking_phone.sql) but reserves the slot via
-- court_blocks, not court_bookings (no payer/price on a tournament
-- match).
-- ================================================================
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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

-- ================================================================
-- Results — vendor-entered, trusted-organizer model.
-- ================================================================
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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

-- ================================================================
-- Lifecycle: live -> completed
-- ================================================================
create or replace function public.complete_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
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

-- ================================================================
-- Announcements
-- ================================================================
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
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
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

-- ── DONE ─────────────────────────────────────────────────────────
