-- ================================================================
-- WALK-IN PLAYER: phone (and email) optional — name is the only
-- required field.
--
-- What it does: an organizer adding walk-in / no-account players (at the
-- desk) previously had to enter a phone number for every member. Now
-- only the name is required. Email or phone are still worth entering —
-- claim_guest_tournament_entries() links a walk-in roster spot to a real
-- account by matching EITHER the phone (last 10 digits) OR the email on
-- sign-in — so the UI nudges the organizer to capture at least an email
-- so the player can later see their own stats.
--
-- Run AFTER: tournaments.sql, tournament_admin_roster.sql,
-- tournament_team_edit.sql (the walk-in RPCs this replaces).
-- Idempotent. Not destructive — existing rows keep whatever phone they
-- have; only the "must not be blank" checks are dropped.
--
-- Re-declares add_walkin_team_player / update_team_player_guest (single
-- definitions, in tournament_admin_roster.sql) and the 5-arg
-- create_walkin_team (the one the web calls — with manager name/phone;
-- see tournament_team_manager.sql). An older 3-arg overload, if present
-- on your DB, is left as-is — nothing calls it.
-- ================================================================

-- ── 1. Relax the guest-row constraint: only guest_name is required ──
alter table public.tournament_team_players drop constraint if exists ttp_user_or_guest_check;
alter table public.tournament_team_players add constraint ttp_user_or_guest_check check (
  (user_id is not null and guest_name is null and guest_phone is null and guest_email is null)
  or (user_id is null and length(trim(coalesce(guest_name, ''))) > 0)
);

-- ── 2. add_walkin_team_player: name required, phone/email optional ──
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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
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

-- ── 3. update_team_player_guest: name required, phone/email optional ──
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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
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

  update public.tournament_team_players
    set guest_name = v_name, guest_phone = v_phone, guest_email = v_email
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_team_player_guest(uuid,text,text,text) to authenticated;

-- ── 4. create_walkin_team (5-arg): name required per member, phone/email optional ──
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
    v_phone := nullif(trim(coalesce(v_member->>'phone', '')), '');
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    if v_member_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
    values (v_team.id, v_member_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb,text,text) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
