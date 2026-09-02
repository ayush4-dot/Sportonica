-- ================================================================
-- TOURNAMENT CAPTAIN SELF-EDIT — a team captain can fix their own
-- team's name and manager contact after registering (typo in the team
-- name, wrong manager phone), not just the organizer/admin.
--
-- Redefines update_team_name() and update_team_manager() from
-- tournament_team_edit.sql / tournament_team_manager.sql with the
-- authorization clause widened to also accept the team's own captain.
-- Every other guard (name required, name uniqueness, not
-- rejected/withdrawn) is unchanged. No signature change — the existing
-- server actions (updateTeamName / updateTeamManager) keep working.
--
-- Run AFTER tournament_team_edit.sql and tournament_team_manager.sql.
-- Idempotent — safe to re-run.
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
    v_team.captain_id = auth.uid()
    or public.is_tournament_organizer(v_t)
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

create or replace function public.update_team_manager(p_team_id uuid, p_manager_name text, p_manager_phone text)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_manager_name text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    v_team.captain_id = auth.uid()
    or public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.tournament_teams
    set manager_name = v_manager_name, manager_phone = v_manager_phone
    where id = p_team_id
    returning * into v_team;

  return v_team;
end;
$$;
grant execute on function public.update_team_manager(uuid,text,text) to authenticated;
