-- ================================================================
-- TOURNAMENT ROSTER: add a free-text "position" field per player
--
-- What it does: adds an optional position (e.g. "Goalkeeper",
-- "Point Guard" — free text, not a fixed enum, since tournaments span
-- multiple sports) to tournament_team_players, settable everywhere
-- jersey_number already is: at add-time (guest/walk-in add), when
-- editing a walk-in's details, via its own standalone setter (mirrors
-- set_team_player_jersey_number — works for ANY player row, registered
-- or guest), and per-member when bulk-creating a walk-in team.
--
-- Run AFTER: tournaments.sql, tournament_admin_roster.sql,
-- tournament_captain_guest_players.sql, tournament_team_manager.sql
-- (the functions this redeclares).
-- Idempotent. Not destructive — existing rows just get position = null.
-- ================================================================

-- ── 1. Column ──
alter table public.tournament_team_players add column if not exists position text;

-- ── 2. add_team_guest_player: captain (or admin) adds a guest by name ──
create or replace function public.add_team_guest_player(
  p_team_id uuid, p_name text, p_phone text default null, p_email text default null,
  p_role text default 'player', p_jersey_number integer default null, p_position text default null
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_is_admin boolean;
  v_players int;
  v_subs    int;
  v_name  text := trim(coalesce(p_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_position text := nullif(trim(coalesce(p_position, '')), '');
  v_row  public.tournament_team_players;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t)
                or public.has_venue_access(v_t.venue_id, 'manager')
                or public.is_super_admin();

  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;
  if v_team.status in ('rejected','withdrawn') then raise exception 'TEAM_NOT_CONFIRMED'; end if;
  if not v_is_admin and v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  if v_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
  if p_jersey_number is not null and exists (
    select 1 from public.tournament_team_players where team_id = p_team_id and jersey_number = p_jersey_number
  ) then
    raise exception 'JERSEY_NUMBER_TAKEN';
  end if;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number, position)
  values (p_team_id, v_name, v_phone, v_email, coalesce(p_role, 'player'), p_jersey_number, v_position)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 3. add_walkin_team_player: admin/organizer adds a walk-in ──
create or replace function public.add_walkin_team_player(
  p_team_id uuid, p_name text, p_phone text, p_email text default null,
  p_role text default 'player', p_jersey_number integer default null, p_position text default null
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_players int;
  v_subs    int;
  v_name  text := trim(coalesce(p_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_position text := nullif(trim(coalesce(p_position, '')), '');
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
  if p_jersey_number is not null and exists (
    select 1 from public.tournament_team_players where team_id = p_team_id and jersey_number = p_jersey_number
  ) then
    raise exception 'JERSEY_NUMBER_TAKEN';
  end if;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number, position)
  values (p_team_id, v_name, v_phone, v_email, coalesce(p_role, 'player'), p_jersey_number, v_position)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 4. update_team_player_guest: edit a walk-in's own details ──
create or replace function public.update_team_player_guest(
  p_team_player_id uuid, p_name text, p_phone text, p_email text default null,
  p_jersey_number integer default null, p_position text default null
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tournament_team_players;
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_name  text := trim(coalesce(p_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_position text := nullif(trim(coalesce(p_position, '')), '');
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
  if p_jersey_number is not null and exists (
    select 1 from public.tournament_team_players
    where team_id = v_row.team_id and jersey_number = p_jersey_number and id <> p_team_player_id
  ) then
    raise exception 'JERSEY_NUMBER_TAKEN';
  end if;

  update public.tournament_team_players
    set guest_name = v_name, guest_phone = v_phone, guest_email = v_email,
        jersey_number = p_jersey_number, position = v_position
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;

-- ── 5. set_team_player_position: standalone inline setter — mirrors
--      set_team_player_jersey_number, works for ANY player row
--      (registered or guest), not just walk-ins ──
create or replace function public.set_team_player_position(
  p_team_player_id uuid, p_position text default null
)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tournament_team_players;
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_is_admin boolean;
  v_position text := nullif(trim(coalesce(p_position, '')), '');
begin
  select * into v_row from public.tournament_team_players where id = p_team_player_id for update;
  if not found then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

  select * into v_team from public.tournament_teams where id = v_row.team_id;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t)
                or public.has_venue_access(v_t.venue_id, 'manager')
                or public.is_super_admin();
  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;

  update public.tournament_team_players
    set position = v_position
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.set_team_player_position(uuid, text) to authenticated;

-- ── 6. create_walkin_team: position per bulk-added member ──
create or replace function public.create_walkin_team(
  p_tournament_id uuid,
  p_team_name     text,
  p_members       jsonb,
  p_manager_name  text default null,
  p_manager_phone text default null,
  p_club_name text default null,
  p_club_address text default null,
  p_contact_person_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_logo_url text default null
) returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.tournaments;
  v_team    public.tournament_teams;
  v_name    text := trim(p_team_name);
  v_manager_name  text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_club_name text := nullif(trim(coalesce(p_club_name, '')), '');
  v_club_address text := nullif(trim(coalesce(p_club_address, '')), '');
  v_contact_person_name text := nullif(trim(coalesce(p_contact_person_name, '')), '');
  v_contact_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
  v_contact_email text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_logo_url text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_member  jsonb;
  v_member_name text;
  v_phone   text;
  v_email   text;
  v_jersey  int;
  v_position text;
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

  insert into public.tournament_teams (
    tournament_id, name, captain_id, ack_terms, status, is_walkin, created_by, manager_name, manager_phone,
    club_name, club_address, contact_person_name, contact_phone, contact_email, logo_url
  )
  values (
    p_tournament_id, v_name, null, true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    true, auth.uid(), v_manager_name, v_manager_phone,
    v_club_name, v_club_address, v_contact_person_name, v_contact_phone, v_contact_email, v_logo_url
  ) returning * into v_team;

  for i in 0 .. v_count - 1 loop
    v_member := p_members -> i;
    v_member_name := trim(coalesce(v_member->>'name', ''));
    v_phone := nullif(trim(coalesce(v_member->>'phone', '')), '');
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    v_jersey := nullif(v_member->>'jersey_number', '')::int;
    v_position := nullif(trim(coalesce(v_member->>'position', '')), '');
    if v_member_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_jersey is not null and exists (
      select 1 from jsonb_array_elements(p_members) with ordinality as m(val, ord)
      where ord - 1 <> i and nullif(m.val->>'jersey_number', '')::int = v_jersey
    ) then
      raise exception 'JERSEY_NUMBER_TAKEN';
    end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number, position)
    values (v_team.id, v_member_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end, v_jersey, v_position);
  end loop;

  return v_team;
end;
$$;

-- ── DONE ────────────────────────────────────────────────────────────
