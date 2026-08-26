-- ================================================================
-- Fix: a captain could only add teammates while their team was still
-- 'pending'/'payment_pending' — but a free tournament (fee = 0)
-- confirms a team immediately on registration (see register_team()),
-- so a solo captain in a free tournament had no window at all to add
-- anyone. The right boundary is the TOURNAMENT's registration window,
-- not the team's own payment/verification state — a captain should be
-- able to manage their roster any time registration is still open,
-- confirmed or not, and lose that ability once it closes (rosters need
-- to be stable before seeding/fixtures). remove_team_player had no
-- window check at all before this — added the same one for consistency
-- (a roster shouldn't be editable after registration closes either way).
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.add_team_player(p_team_id uuid, p_user_id uuid, p_role text default 'player')
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_players int;
  v_subs    int;
  v_row  public.tournament_team_players;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_team.status in ('rejected','withdrawn') then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, user_id, role)
  values (p_team_id, p_user_id, coalesce(p_role, 'player'))
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_team_player(uuid,uuid,text) to authenticated;

create or replace function public.remove_team_player(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if p_user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  delete from public.tournament_team_players where team_id = p_team_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_team_player(uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
