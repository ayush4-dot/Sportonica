-- ================================================================
-- TOURNAMENT TEAM EDIT — two more "admin can fix this any time" gaps:
--   1. No RPC existed at all to rename a team after registration.
--   2. create_walkin_team() required status = 'registration_open',
--      so admin couldn't add a team once registration closed — even
--      though the function is already admin/organizer-only (no
--      captain self-service path to worry about relaxing).
-- Run AFTER tournaments.sql / tournament_team_manager.sql. Safe to
-- re-run.
-- ================================================================

create or replace function public.update_team_name(p_team_id uuid, p_name text)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_name text := trim(p_name);
begin
  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1 from public.tournament_teams
    where tournament_id = v_team.tournament_id and id <> p_team_id
      and status not in ('rejected', 'withdrawn')
      and lower(name) = lower(v_name)
  ) then
    raise exception 'TEAM_NAME_TAKEN';
  end if;

  update public.tournament_teams set name = v_name where id = p_team_id returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.update_team_name(uuid,text) to authenticated;

-- ── create_walkin_team: admin can add a team any time, not just while
--    registration is open. Capacity (TOURNAMENT_FULL) still applies. ──
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
