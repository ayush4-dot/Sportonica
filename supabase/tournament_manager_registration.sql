-- ================================================================
-- TEAM MANAGER REGISTRATION — the person who registers a team is its
-- manager / point of contact, not automatically a player.
--
-- Before: register_team() always inserted the registrant onto the roster
-- as 'captain'. Now the registrant is the team's manager (still tracked
-- via captain_id — that column is the "who owns this team" pointer used
-- by RLS and getMyTeamForTournament), and they're only added to the
-- roster if they say they're also playing (p_manager_plays). They then
-- build the rest of the roster with add_team_guest_player().
--
-- Run AFTER: tournaments.sql, tournament_team_manager.sql (the 5-arg
-- register_team this replaces), tournament_captain_guest_players.sql.
-- Idempotent. Not destructive — existing rosters are untouched.
-- ================================================================

drop function if exists public.register_team(uuid,text,boolean,text,text);
drop function if exists public.register_team(uuid,text,boolean,text,text,boolean);

create or replace function public.register_team(
  p_tournament_id uuid,
  p_name          text,
  p_ack_terms     boolean,
  p_manager_name  text default null,
  p_manager_phone text default null,
  p_manager_plays boolean default false
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

  -- The manager is on the roster ONLY if they said they're also playing.
  if p_manager_plays then
    insert into public.tournament_team_players (team_id, user_id, role)
    values (v_row.id, auth.uid(), 'player')
    on conflict (team_id, user_id) do nothing;
  end if;

  return v_row;
end;
$$;
grant execute on function public.register_team(uuid,text,boolean,text,text,boolean) to authenticated;

-- ── set_manager_plays: toggle the manager's own player row after
-- registration (the "I'm also playing" checkbox on the roster step). ──
create or replace function public.set_manager_plays(p_team_id uuid, p_plays boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  if p_plays then
    insert into public.tournament_team_players (team_id, user_id, role)
    values (p_team_id, auth.uid(), 'player')
    on conflict (team_id, user_id) do nothing;
  else
    delete from public.tournament_team_players where team_id = p_team_id and user_id = auth.uid();
  end if;
end;
$$;
grant execute on function public.set_manager_plays(uuid,boolean) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
