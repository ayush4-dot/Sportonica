-- ================================================================
-- TOURNAMENT ADMIN ROSTER — let whoever manages a tournament (organizer/
-- venue manager/super admin/granted "Owner access") add or remove team
-- members directly, not just the team's own captain, and not just
-- while registration is open. A captain drops out mid-tournament, a
-- walk-in entry needs correcting, someone needs swapping in as a
-- substitute after the roster would otherwise be locked — none of
-- that could be fixed by anyone but the captain before, and only
-- during the registration window.
--
-- Capacity limits (ROSTER_FULL / SUBSTITUTE_LIMIT_REACHED) still apply
-- for everyone, admin included — those protect real constraints
-- (max_players_per_team / substitute_limit), not a timing window.
-- CANNOT_REMOVE_CAPTAIN also still applies to admin — reassigning a
-- captain is a bigger, separate feature.
--
-- Run AFTER tournaments.sql. Safe to re-run.
-- ================================================================

create or replace function public.add_team_player(p_team_id uuid, p_user_id uuid, p_role text default 'player')
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_is_admin boolean;
  v_players int;
  v_subs    int;
  v_row  public.tournament_team_players;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin();

  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;
  if v_team.status in ('rejected','withdrawn') then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  -- A captain can only manage their roster during registration; an
  -- admin/organizer can fix a roster any time.
  if not v_is_admin and v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

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
declare v_team public.tournament_teams; v_t public.tournaments; v_is_admin boolean;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin();

  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;
  if p_user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;

  if not v_is_admin and v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  delete from public.tournament_team_players where team_id = p_team_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_team_player(uuid,uuid) to authenticated;

-- Admin/organizer-only, removes by the roster row's own id rather than
-- user_id — the only way to target a walk-in/guest member (user_id is
-- null for those, so remove_team_player above can't identify one).
create or replace function public.remove_team_player_admin(p_team_player_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.tournament_team_players; v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_row from public.tournament_team_players where id = p_team_player_id for update;
  if not found then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

  select * into v_team from public.tournament_teams where id = v_row.team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;

  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.role = 'captain' or v_row.user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;

  delete from public.tournament_team_players where id = p_team_player_id;
end;
$$;
grant execute on function public.remove_team_player_admin(uuid) to authenticated;

-- Add a walk-in (no-account) member directly to an existing team.
-- Walk-in teams have no captain_id at all (create_walkin_team() inserts
-- null — see tournaments.sql) and their members have no user_id to log
-- in with, so this has to be admin-only; there's no self-service path
-- for a walk-in team the way a real captain has for a linked one.
create or replace function public.add_walkin_team_player(
  p_team_id uuid, p_name text, p_phone text, p_email text default null, p_role text default 'player'
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_players int;
  v_subs    int;
  v_name  text := trim(coalesce(p_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_row  public.tournament_team_players;
begin
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
  if v_team.status in ('rejected','withdrawn') then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  if v_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
  if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
  values (p_team_id, v_name, v_phone, v_email, coalesce(p_role, 'player'))
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_walkin_team_player(uuid,text,text,text,text) to authenticated;

-- Edit a walk-in member's own details (name/phone/email) — only for a
-- guest row (user_id is null). A linked account's contact info comes
-- from their own profile/auth account, not something to overwrite here.
create or replace function public.update_team_player_guest(
  p_team_player_id uuid, p_name text, p_phone text, p_email text default null
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tournament_team_players;
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_name  text := trim(coalesce(p_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
begin
  select * into v_row from public.tournament_team_players where id = p_team_player_id for update;
  if not found then raise exception 'PLAYER_NOT_IN_MATCH'; end if;
  if v_row.user_id is not null then raise exception 'NOT_A_WALKIN_TEAM'; end if;

  select * into v_team from public.tournament_teams where id = v_row.team_id;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
  if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

  update public.tournament_team_players
    set guest_name = v_name, guest_phone = v_phone, guest_email = v_email
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_team_player_guest(uuid,text,text,text) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
