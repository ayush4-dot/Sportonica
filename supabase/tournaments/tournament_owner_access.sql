-- ================================================================
-- TOURNAMENT OWNER ACCESS — super-admin tournament-creation parity
-- with an Organizer, plus per-tournament delegated access ("tournament
-- manager"). Run AFTER tournaments.sql (needs is_tournament_organizer,
-- reset_downstream_from, has_venue_access, is_super_admin already
-- defined) and organizer_partnerships.sql / organizer_approval_and_
-- own_venue.sql (needs is_organizer). Safe to re-run — every statement
-- below is idempotent and independent of tournaments.sql's own historical
-- replay, so this can run whether or not tournaments.sql itself is
-- fully caught up.
-- ================================================================

-- ================================================================
-- ── super admin: same tournament-creation access as an Organizer ──
--
-- The own-venue path already worked for a super admin (is_organizer()
-- returns true for super admins too — see organizer_partnerships.sql),
-- but picking any *listed* Sportonica venue from /platform/tournaments/new
-- required an active partnership row between the caller and that
-- venue's owner — a real gap, since a Platform-run tournament has no
-- Organizer↔Vendor relationship to check. Super admin now bypasses that
-- partnership requirement outright.
-- ================================================================
create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := nullif(p->>'venue_id', '')::uuid;
  v_own_venue_name text := nullif(trim(p->>'own_venue_name'), '');
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  if v_venue_id is not null then
    select owner_id into v_vendor_id from public.venues where id = v_venue_id;
    if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;
    if not (
      public.is_super_admin()
      or (
        public.is_organizer()
        and exists (
          select 1 from public.partnerships
          where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
        )
      )
    ) then
      raise exception 'FORBIDDEN';
    end if;
  elsif v_own_venue_name is not null then
    if not public.is_organizer() then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.tournaments (
    venue_id, own_venue_name, own_venue_address, own_venue_map_url, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules, yellow_card_fine, red_card_fine
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
    nullif(trim(p->>'own_venue_map_url'), ''),
    (p->>'own_venue_lat')::double precision, (p->>'own_venue_lng')::double precision,
    case when v_venue_id is null then 'confirmed' else 'pending' end,
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
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules',
    coalesce((p->>'yellow_card_fine')::numeric, 0), coalesce((p->>'red_card_fine')::numeric, 0)
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── permission-check fixes: three RPCs never checked
--    is_tournament_organizer(), only has_venue_access() — broke for
--    an own-venue tournament's organizer (no venue to have access to),
--    and would have quietly excluded the new tournament_managers grant
--    below from working on these three actions too.
-- ================================================================
create or replace function public.open_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
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
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;

-- ================================================================
-- ── Per-tournament delegated access ("tournament manager") ──
--
-- Distinct from the platform-wide Organizer role (profiles.role =
-- 'organizer' — self-serve, lets someone create tournaments anywhere,
-- see organizer_partnerships.sql). This is narrower and admin-granted:
-- a super admin hand-picks a specific person to run ONE tournament,
-- with the exact same capabilities that tournament's own owner/
-- organizer already has for it.
--
-- Implemented by teaching is_tournament_organizer() about this table,
-- rather than touching every RPC individually — every RPC in this
-- file already gates on is_tournament_organizer(v_row) (create_match,
-- record_match_result, set_match_time, publish_tournament,
-- generate_knockout_bracket, cancel_tournament, and everything else
-- above), so a granted manager picks up all of it at once.
-- ================================================================
create table if not exists public.tournament_managers (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  added_by      uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index if not exists idx_tournament_managers_tournament on public.tournament_managers(tournament_id);
create index if not exists idx_tournament_managers_user on public.tournament_managers(user_id);

alter table public.tournament_managers enable row level security;
drop policy if exists tournament_managers_read on public.tournament_managers;
create policy tournament_managers_read on public.tournament_managers for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t))
  );

create or replace function public.is_tournament_organizer(v_row public.tournaments)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      v_row.owner_id is not null
      and v_row.owner_id = auth.uid()
      and (
        v_row.venue_id is null
        or exists (
          select 1 from public.venues ve
          join public.partnerships p on p.vendor_id = ve.owner_id
          where ve.id = v_row.venue_id
            and p.organizer_id = auth.uid()
            and p.status = 'active'
        )
      )
    )
    or exists (
      select 1 from public.tournament_managers tm
      where tm.tournament_id = v_row.id and tm.user_id = auth.uid()
    );
$$;

-- Look up an existing account by email, so a super admin can grant
-- access without knowing a user's internal id.
create or replace function public.find_user_by_email(p_email text)
returns table(id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select u.id, p.full_name, u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
    limit 1;
end;
$$;
grant execute on function public.find_user_by_email(text) to authenticated;

create or replace function public.grant_tournament_manager(p_tournament_id uuid, p_user_id uuid)
returns public.tournament_managers
language plpgsql security definer set search_path = public as $$
declare v_row public.tournament_managers;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.tournament_managers (tournament_id, user_id, added_by)
  values (p_tournament_id, p_user_id, auth.uid())
  on conflict (tournament_id, user_id) do nothing;

  select * into v_row from public.tournament_managers
    where tournament_id = p_tournament_id and user_id = p_user_id;
  return v_row;
end;
$$;
grant execute on function public.grant_tournament_manager(uuid,uuid) to authenticated;

create or replace function public.revoke_tournament_manager(p_tournament_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  delete from public.tournament_managers where tournament_id = p_tournament_id and user_id = p_user_id;
end;
$$;
grant execute on function public.revoke_tournament_manager(uuid,uuid) to authenticated;

create or replace function public.list_tournament_managers(p_tournament_id uuid)
returns table(id uuid, user_id uuid, full_name text, email text, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    public.is_super_admin()
    or exists (select 1 from public.tournaments t where t.id = p_tournament_id and public.is_tournament_organizer(t))
  ) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select tm.id, tm.user_id, p.full_name, u.email::text, tm.created_at
    from public.tournament_managers tm
    join public.profiles p on p.id = tm.user_id
    join auth.users u on u.id = tm.user_id
    where tm.tournament_id = p_tournament_id
    order by tm.created_at asc;
end;
$$;
grant execute on function public.list_tournament_managers(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── RLS fix: reading a tournament never checked is_tournament_organizer() ──
--
-- tournaments_read_owner only checked has_venue_access(venue_id) —
-- which is false for an own-venue tournament (no venue row at all) and
-- for a granted tournament_managers entry (no venue staff role either).
-- Both would load the tournament's admin page and immediately get
-- nothing back from getTournament(), since RLS silently filters the
-- row out rather than erroring. Every RPC-based mutation already
-- worked (they run as SECURITY DEFINER, bypassing RLS) — only the
-- plain client .select() used to load the page was affected.
-- ================================================================
drop policy if exists tournaments_read_owner on public.tournaments;
create policy tournaments_read_owner on public.tournaments for select
  using (public.has_venue_access(venue_id) or public.is_tournament_organizer(tournaments));

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── RLS: same is_tournament_organizer() gap in three more read
--    policies — matches, announcements, and registration payments all
--    only checked has_venue_access(), same story as tournaments_read_
--    owner above. Added as supplemental policies (same pattern as the
--    existing tournament_teams_read_organizer2 /
--    tournament_team_players_read_organizer2), not replacements —
--    Postgres RLS policies for the same command OR together.
-- ================================================================
drop policy if exists tournament_matches_read_organizer2 on public.tournament_matches;
create policy tournament_matches_read_organizer2 on public.tournament_matches for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists tournament_announcements_read_organizer2 on public.tournament_announcements;
create policy tournament_announcements_read_organizer2 on public.tournament_announcements for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists pay_tournament_organizer_read on public.payments;
create policy pay_tournament_organizer_read on public.payments for select
  using (
    booking_type = 'tournament_registration'
    and exists (
      select 1 from public.tournament_teams tt
      join public.tournaments t on t.id = tt.tournament_id
      where tt.id = payments.tournament_registration_id and public.is_tournament_organizer(t)
    )
  );

-- ── DONE ─────────────────────────────────────────────────────────
