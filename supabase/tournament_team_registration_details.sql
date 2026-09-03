-- ================================================================
-- TEAM REGISTRATION DETAILS — client requirement: capture a fuller
-- team profile at registration, plus an optional per-player jersey
-- number.
--
-- New on tournament_teams (all filled in at registration, required
-- except logo — self-registration via register_team() enforces this;
-- admin-created walk-in teams via create_walkin_team() leave them
-- optional, since a walk-in team is often created informally at the
-- desk without full club paperwork on hand):
--   logo_url              — team crest/photo, optional
--   club_name             — required
--   club_address          — required
--   contact_person_name   — required (the club's point of contact —
--                            distinct from the team manager/coach below)
--   contact_phone         — required
--   contact_email         — required
--   (manager_name / manager_phone already existed, added optionally by
--   tournament_manager_registration.sql — "official details" per the
--   client is exactly this: the team manager/coach's name + number.
--   register_team() now REQUIRES both instead of allowing them blank.)
--
-- New on tournament_team_players:
--   jersey_number int, optional. A partial unique index blocks two
--   players on the same team sharing a number (nulls excluded, so
--   leaving it blank is unlimited).
--
-- New RPCs:
--   update_team_details() — edit all of the above after registration.
--     Same requiredness as register_team (except logo). Callable by the
--     team's own captain or an organizer/venue-manager/super_admin.
--   set_team_player_jersey_number() — set/clear one player's jersey
--     number, works for both a guest row and a linked-account row
--     (update_team_player_guest only ever handled guest rows). Same
--     caller check as the roster-edit RPCs.
--
-- Extended RPCs (new trailing optional/required params, so callers that
-- don't pass them keep working):
--   register_team(), create_walkin_team() — the six team-profile fields.
--   add_team_guest_player(), add_walkin_team_player(),
--   update_team_player_guest() — p_jersey_number.
--   create_walkin_team()'s per-member jsonb also accepts a
--   "jersey_number" key per member.
--
-- Run AFTER: tournaments.sql, tournament_owner_access.sql (is_tournament_
-- organizer, has_venue_access, is_super_admin), tournament_manager_
-- registration.sql (the register_team this replaces), tournament_
-- walkin_phone_optional.sql (create_walkin_team, add_walkin_team_player,
-- update_team_player_guest this replaces), tournament_captain_guest_
-- players.sql (add_team_guest_player this replaces).
-- Idempotent. Not destructive — existing teams/rows just have the new
-- columns null until edited.
-- ================================================================

-- ── 1. Columns ───────────────────────────────────────────────────────
alter table public.tournament_teams add column if not exists logo_url            text;
alter table public.tournament_teams add column if not exists club_name           text;
alter table public.tournament_teams add column if not exists club_address        text;
alter table public.tournament_teams add column if not exists contact_person_name text;
alter table public.tournament_teams add column if not exists contact_phone       text;
alter table public.tournament_teams add column if not exists contact_email       text;

alter table public.tournament_team_players add column if not exists jersey_number int;

drop index if exists idx_ttp_team_jersey_unique;
create unique index idx_ttp_team_jersey_unique
  on public.tournament_team_players (team_id, jersey_number)
  where jersey_number is not null;

-- ── 2. Storage bucket for the team logo ─────────────────────────────
-- Same shape as tournament-qr: public read, uploader-scoped insert
-- keyed by auth.uid() (the team row may not exist yet while the
-- registration form is being filled in).
insert into storage.buckets (id, name, public)
  values ('team-logos', 'team-logos', true)
  on conflict (id) do nothing;

drop policy if exists team_logos_read on storage.objects;
drop policy if exists team_logos_owner_insert on storage.objects;

create policy team_logos_read on storage.objects for select
  using (bucket_id = 'team-logos');

create policy team_logos_owner_insert on storage.objects for insert
  with check (bucket_id = 'team-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 3. register_team: require the full team profile ─────────────────
-- Explicit drops first: this function has grown in arity several times
-- across files (3-arg baseline in tournaments.sql, 5-arg in
-- tournament_team_manager.sql, 6-arg in tournament_manager_
-- registration.sql), and it's unclear which of those is actually live
-- on any given database. Appending new trailing-default params via
-- CREATE OR REPLACE only replaces a function whose existing arg list
-- matches exactly — if a shorter arity is what's live, this would
-- otherwise create a second, ambiguous overload instead of replacing it.
drop function if exists public.register_team(uuid,text,boolean);
drop function if exists public.register_team(uuid,text,boolean,text,text);
drop function if exists public.register_team(uuid,text,boolean,text,text,boolean);

create or replace function public.register_team(
  p_tournament_id       uuid,
  p_name                text,
  p_ack_terms           boolean,
  p_manager_name        text default null,
  p_manager_phone       text default null,
  p_manager_plays       boolean default false,
  p_club_name           text default null,
  p_club_address        text default null,
  p_contact_person_name text default null,
  p_contact_phone       text default null,
  p_contact_email       text default null,
  p_logo_url            text default null
)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_count int;
  v_name text := trim(p_name);
  v_manager_name text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_club_name text := nullif(trim(coalesce(p_club_name, '')), '');
  v_club_address text := nullif(trim(coalesce(p_club_address, '')), '');
  v_contact_person_name text := nullif(trim(coalesce(p_contact_person_name, '')), '');
  v_contact_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
  v_contact_email text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_logo_url text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_row public.tournament_teams;
begin
  if p_ack_terms is not true then raise exception 'TERMS_NOT_ACKNOWLEDGED'; end if;
  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;
  if v_manager_name is null then raise exception 'MANAGER_NAME_REQUIRED'; end if;
  if v_manager_phone is null then raise exception 'MANAGER_PHONE_REQUIRED'; end if;
  if v_club_name is null then raise exception 'CLUB_NAME_REQUIRED'; end if;
  if v_club_address is null then raise exception 'CLUB_ADDRESS_REQUIRED'; end if;
  if v_contact_person_name is null then raise exception 'CONTACT_PERSON_NAME_REQUIRED'; end if;
  if v_contact_phone is null then raise exception 'CONTACT_PHONE_REQUIRED'; end if;
  if v_contact_email is null then raise exception 'CONTACT_EMAIL_REQUIRED'; end if;

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

  insert into public.tournament_teams (
    tournament_id, name, captain_id, ack_terms, status, manager_name, manager_phone,
    club_name, club_address, contact_person_name, contact_phone, contact_email, logo_url
  )
  values (
    p_tournament_id, v_name, auth.uid(), true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    v_manager_name, v_manager_phone,
    v_club_name, v_club_address, v_contact_person_name, v_contact_phone, v_contact_email, v_logo_url
  )
  on conflict (tournament_id, captain_id) do update
    set name = excluded.name, ack_terms = true,
        manager_name = excluded.manager_name, manager_phone = excluded.manager_phone,
        club_name = excluded.club_name, club_address = excluded.club_address,
        contact_person_name = excluded.contact_person_name, contact_phone = excluded.contact_phone,
        contact_email = excluded.contact_email, logo_url = excluded.logo_url,
        status = case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end
    where public.tournament_teams.status in ('rejected','withdrawn')
  returning * into v_row;

  if v_row.id is null then raise exception 'ALREADY_REGISTERED'; end if;

  if p_manager_plays then
    insert into public.tournament_team_players (team_id, user_id, role)
    values (v_row.id, auth.uid(), 'player')
    on conflict (team_id, user_id) do nothing;
  end if;

  return v_row;
end;
$$;
grant execute on function public.register_team(uuid,text,boolean,text,text,boolean,text,text,text,text,text,text) to authenticated;

-- ── 4. update_team_details: edit the profile after registration ─────
-- Same requiredness as register_team (except logo). Captain of the
-- team, or organizer/venue-manager/super_admin, any time.
create or replace function public.update_team_details(
  p_team_id             uuid,
  p_club_name           text,
  p_club_address        text,
  p_contact_person_name text,
  p_contact_phone       text,
  p_contact_email       text,
  p_manager_name        text,
  p_manager_phone       text,
  p_logo_url            text default null
)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_is_admin boolean;
  v_club_name text := nullif(trim(coalesce(p_club_name, '')), '');
  v_club_address text := nullif(trim(coalesce(p_club_address, '')), '');
  v_contact_person_name text := nullif(trim(coalesce(p_contact_person_name, '')), '');
  v_contact_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
  v_contact_email text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_manager_name text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_logo_url text := nullif(trim(coalesce(p_logo_url, '')), '');
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t)
                or public.has_venue_access(v_t.venue_id, 'manager')
                or public.is_super_admin();
  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;

  if v_club_name is null then raise exception 'CLUB_NAME_REQUIRED'; end if;
  if v_club_address is null then raise exception 'CLUB_ADDRESS_REQUIRED'; end if;
  if v_contact_person_name is null then raise exception 'CONTACT_PERSON_NAME_REQUIRED'; end if;
  if v_contact_phone is null then raise exception 'CONTACT_PHONE_REQUIRED'; end if;
  if v_contact_email is null then raise exception 'CONTACT_EMAIL_REQUIRED'; end if;
  if v_manager_name is null then raise exception 'MANAGER_NAME_REQUIRED'; end if;
  if v_manager_phone is null then raise exception 'MANAGER_PHONE_REQUIRED'; end if;

  update public.tournament_teams set
      club_name = v_club_name, club_address = v_club_address,
      contact_person_name = v_contact_person_name, contact_phone = v_contact_phone, contact_email = v_contact_email,
      manager_name = v_manager_name, manager_phone = v_manager_phone,
      logo_url = coalesce(v_logo_url, logo_url)
    where id = p_team_id
    returning * into v_team;

  return v_team;
end;
$$;
grant execute on function public.update_team_details(uuid,text,text,text,text,text,text,text,text) to authenticated;

-- ── 5. create_walkin_team: same six fields, all optional ────────────
-- Per-member jsonb now also accepts a "jersey_number" key. Explicit
-- drops first, same reasoning as register_team above — a legacy 3-arg
-- overload is known to have existed (see tournament_walkin_phone_
-- optional.sql's header comment) alongside the 5-arg one.
drop function if exists public.create_walkin_team(uuid,text,jsonb);
drop function if exists public.create_walkin_team(uuid,text,jsonb,text,text);

create or replace function public.create_walkin_team(
  p_tournament_id       uuid,
  p_team_name           text,
  p_members             jsonb,
  p_manager_name        text default null,
  p_manager_phone       text default null,
  p_club_name           text default null,
  p_club_address        text default null,
  p_contact_person_name text default null,
  p_contact_phone       text default null,
  p_contact_email       text default null,
  p_logo_url            text default null
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
    if v_member_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_jersey is not null and exists (
      select 1 from jsonb_array_elements(p_members) with ordinality as m(val, ord)
      where ord - 1 <> i and nullif(m.val->>'jersey_number', '')::int = v_jersey
    ) then
      raise exception 'JERSEY_NUMBER_TAKEN';
    end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number)
    values (v_team.id, v_member_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end, v_jersey);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb,text,text,text,text,text,text,text,text) to authenticated;

-- ── 6. Jersey numbers on the add/edit player RPCs ────────────────────
-- Explicit drops first, same reasoning as above.
drop function if exists public.add_team_guest_player(uuid,text,text,text,text);
drop function if exists public.add_walkin_team_player(uuid,text,text,text,text);
drop function if exists public.update_team_player_guest(uuid,text,text,text);

create or replace function public.add_team_guest_player(
  p_team_id uuid,
  p_name    text,
  p_phone   text default null,
  p_email   text default null,
  p_role    text default 'player',
  p_jersey_number int default null
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

  insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number)
  values (p_team_id, v_name, v_phone, v_email, coalesce(p_role, 'player'), p_jersey_number)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_team_guest_player(uuid,text,text,text,text,int) to authenticated;

create or replace function public.add_walkin_team_player(
  p_team_id uuid, p_name text, p_phone text, p_email text default null, p_role text default 'player',
  p_jersey_number int default null
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

  insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role, jersey_number)
  values (p_team_id, v_name, v_phone, v_email, coalesce(p_role, 'player'), p_jersey_number)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_walkin_team_player(uuid,text,text,text,text,int) to authenticated;

create or replace function public.update_team_player_guest(
  p_team_player_id uuid, p_name text, p_phone text, p_email text default null, p_jersey_number int default null
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
  if p_jersey_number is not null and exists (
    select 1 from public.tournament_team_players
    where team_id = v_row.team_id and jersey_number = p_jersey_number and id <> p_team_player_id
  ) then
    raise exception 'JERSEY_NUMBER_TAKEN';
  end if;

  update public.tournament_team_players
    set guest_name = v_name, guest_phone = v_phone, guest_email = v_email, jersey_number = p_jersey_number
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_team_player_guest(uuid,text,text,text,int) to authenticated;

-- ── 7. set_team_player_jersey_number: works for guest AND linked rows ─
create or replace function public.set_team_player_jersey_number(p_team_player_id uuid, p_jersey_number int default null)
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tournament_team_players;
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_is_admin boolean;
begin
  select * into v_row from public.tournament_team_players where id = p_team_player_id for update;
  if not found then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

  select * into v_team from public.tournament_teams where id = v_row.team_id;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  v_is_admin := public.is_tournament_organizer(v_t)
                or public.has_venue_access(v_t.venue_id, 'manager')
                or public.is_super_admin();
  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;

  if p_jersey_number is not null and exists (
    select 1 from public.tournament_team_players
    where team_id = v_row.team_id and jersey_number = p_jersey_number and id <> p_team_player_id
  ) then
    raise exception 'JERSEY_NUMBER_TAKEN';
  end if;

  update public.tournament_team_players
    set jersey_number = p_jersey_number
    where id = p_team_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.set_team_player_jersey_number(uuid,int) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
