-- ================================================================
-- TEAM COACH — split the single "team manager / coach" contact into
-- two distinct people: the team manager (already required at
-- registration) and, new here, an OPTIONAL coach (name + phone).
--
-- New on tournament_teams:
--   coach_name   text, optional
--   coach_phone  text, optional
--
-- Extended RPCs (new trailing optional params — callers that don't
-- pass them keep working, and coach stays nullable so nothing that
-- omits it breaks):
--   register_team()        — p_coach_name, p_coach_phone
--   update_team_details()  — p_coach_name, p_coach_phone
--   update_team_manager()  — p_coach_name, p_coach_phone
--
-- create_walkin_team() is deliberately left alone: the organiser
-- walk-in path doesn't collect a coach, and its body has churned
-- across several files (refixture hook, jersey, position) in ways
-- that make a safe in-place redeclare here not worth the risk.
--
-- Explicit `drop function` before each `create` because these have
-- grown in arity across several files and CREATE OR REPLACE only
-- replaces an exact-signature match — otherwise it adds an ambiguous
-- overload. Drops target the current live signature (and the one just
-- before it, for safety).
--
-- Run AFTER: tournaments.sql, tournament_owner_access.sql,
-- tournament_team_manager.sql (update_team_manager),
-- tournament_team_registration_details.sql (register_team,
-- update_team_details).
-- Idempotent. Not destructive — existing teams get coach_* = null.
-- ================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────
alter table public.tournament_teams add column if not exists coach_name  text;
alter table public.tournament_teams add column if not exists coach_phone text;

-- ── 2. register_team: optional coach alongside the required manager ──
drop function if exists public.register_team(uuid,text,boolean,text,text,boolean);
drop function if exists public.register_team(uuid,text,boolean,text,text,boolean,text,text,text,text,text,text);

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
  p_logo_url            text default null,
  p_coach_name          text default null,
  p_coach_phone         text default null
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
  v_coach_name text := nullif(trim(coalesce(p_coach_name, '')), '');
  v_coach_phone text := nullif(trim(coalesce(p_coach_phone, '')), '');
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
    club_name, club_address, contact_person_name, contact_phone, contact_email, logo_url,
    coach_name, coach_phone
  )
  values (
    p_tournament_id, v_name, auth.uid(), true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    v_manager_name, v_manager_phone,
    v_club_name, v_club_address, v_contact_person_name, v_contact_phone, v_contact_email, v_logo_url,
    v_coach_name, v_coach_phone
  )
  on conflict (tournament_id, captain_id) do update
    set name = excluded.name, ack_terms = true,
        manager_name = excluded.manager_name, manager_phone = excluded.manager_phone,
        club_name = excluded.club_name, club_address = excluded.club_address,
        contact_person_name = excluded.contact_person_name, contact_phone = excluded.contact_phone,
        contact_email = excluded.contact_email, logo_url = excluded.logo_url,
        coach_name = excluded.coach_name, coach_phone = excluded.coach_phone,
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
grant execute on function public.register_team(uuid,text,boolean,text,text,boolean,text,text,text,text,text,text,text,text) to authenticated;

-- ── 3. update_team_details: edit the profile (incl. coach) after signup ─
drop function if exists public.update_team_details(uuid,text,text,text,text,text,text,text);
drop function if exists public.update_team_details(uuid,text,text,text,text,text,text,text,text);

create or replace function public.update_team_details(
  p_team_id             uuid,
  p_club_name           text,
  p_club_address        text,
  p_contact_person_name text,
  p_contact_phone       text,
  p_contact_email       text,
  p_manager_name        text,
  p_manager_phone       text,
  p_logo_url            text default null,
  p_coach_name          text default null,
  p_coach_phone         text default null
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
  v_coach_name text := nullif(trim(coalesce(p_coach_name, '')), '');
  v_coach_phone text := nullif(trim(coalesce(p_coach_phone, '')), '');
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
      coach_name = v_coach_name, coach_phone = v_coach_phone,
      logo_url = coalesce(v_logo_url, logo_url)
    where id = p_team_id
    returning * into v_team;

  return v_team;
end;
$$;
grant execute on function public.update_team_details(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- ── 4. update_team_manager: admin sets manager and/or coach later ───
drop function if exists public.update_team_manager(uuid,text,text);

create or replace function public.update_team_manager(
  p_team_id       uuid,
  p_manager_name  text,
  p_manager_phone text,
  p_coach_name    text default null,
  p_coach_phone   text default null
)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t public.tournaments;
  v_manager_name text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_manager_phone text := nullif(trim(coalesce(p_manager_phone, '')), '');
  v_coach_name text := nullif(trim(coalesce(p_coach_name, '')), '');
  v_coach_phone text := nullif(trim(coalesce(p_coach_phone, '')), '');
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

  update public.tournament_teams
    set manager_name = v_manager_name, manager_phone = v_manager_phone,
        coach_name = v_coach_name, coach_phone = v_coach_phone
    where id = p_team_id
    returning * into v_team;

  return v_team;
end;
$$;
grant execute on function public.update_team_manager(uuid,text,text,text,text) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
