-- ================================================================
-- TEAM MANAGER — an optional public point of contact for each team,
-- collectable at registration (both self-service and admin-created
-- walk-in teams). Distinct from the team's players, whose own phone/
-- email stay private (see get_team_roster_public()) — a manager's name
-- and phone, when given, are meant to be visible to everyone browsing
-- the tournament, so opposing teams/organizers/spectators have someone
-- to reach. Not required — a team can register without one.
-- Run AFTER tournaments.sql. Safe to re-run.
-- ================================================================

alter table public.tournament_teams add column if not exists manager_name text;
alter table public.tournament_teams add column if not exists manager_phone text;

-- ── register_team: manager name + phone are optional ─────────────
drop function if exists public.register_team(uuid,text,boolean,text,text);
create or replace function public.register_team(
  p_tournament_id uuid, p_name text, p_ack_terms boolean, p_manager_name text default null, p_manager_phone text default null
)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_count int;
  v_name text := trim(p_name);
  v_manager_name text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_row public.tournament_teams;
begin
  if p_ack_terms is not true then raise exception 'TERMS_NOT_ACKNOWLEDGED'; end if;
  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;
  if now() >= v_t.registration_closes_at then
    update public.tournaments set status = 'registration_closed' where id = p_tournament_id;
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status not in ('rejected', 'withdrawn')
      and lower(name) = lower(v_name) and captain_id is distinct from auth.uid()
  ) then
    raise exception 'TEAM_NAME_TAKEN';
  end if;

  select count(*) into v_count from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_count >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status, manager_name, manager_phone)
  values (
    p_tournament_id, v_name, auth.uid(), true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    v_manager_name, v_manager_phone
  )
  on conflict (tournament_id, captain_id) do update
    set name = excluded.name, ack_terms = true,
        manager_name = excluded.manager_name, manager_phone = excluded.manager_phone,
        status = case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end
    where public.tournament_teams.status in ('rejected','withdrawn')
  returning * into v_row;

  if v_row.id is null then raise exception 'ALREADY_REGISTERED'; end if;

  -- The captain is always on their own roster.
  insert into public.tournament_team_players (team_id, user_id, role)
  values (v_row.id, auth.uid(), 'captain')
  on conflict (team_id, user_id) do nothing;

  return v_row;
end;
$$;
grant execute on function public.register_team(uuid,text,boolean,text,text) to authenticated;

-- ── create_walkin_team: manager name + phone are optional ────────
drop function if exists public.create_walkin_team(uuid,text,jsonb,text,text);
create or replace function public.create_walkin_team(
  p_tournament_id uuid,
  p_team_name     text,
  p_members       jsonb,
  p_manager_name  text default null,
  p_manager_phone text default null
) returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.tournaments;
  v_team    public.tournament_teams;
  v_name    text := trim(p_team_name);
  v_manager_name  text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_member  jsonb;
  v_member_name text;
  v_phone   text;
  v_email   text;
  v_count   int;
  v_existing int;
  i         int;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;

  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status not in ('rejected', 'withdrawn')
      and lower(name) = lower(v_name)
  ) then
    raise exception 'TEAM_NAME_TAKEN';
  end if;

  v_count := coalesce(jsonb_array_length(p_members), 0);
  if v_count = 0 then raise exception 'AT_LEAST_ONE_MEMBER_REQUIRED'; end if;
  if v_count > v_t.max_players_per_team + v_t.substitute_limit then raise exception 'TOO_MANY_PLAYERS'; end if;

  select count(*) into v_existing from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_existing >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status, is_walkin, created_by, manager_name, manager_phone)
  values (
    p_tournament_id, v_name, null, true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    true, auth.uid(), v_manager_name, v_manager_phone
  ) returning * into v_team;

  for i in 0 .. v_count - 1 loop
    v_member := p_members -> i;
    v_member_name := trim(coalesce(v_member->>'name', ''));
    v_phone := trim(coalesce(v_member->>'phone', ''));
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    if v_member_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
    values (v_team.id, v_member_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb,text,text) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
