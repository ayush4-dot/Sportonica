-- ================================================================
-- Walk-in teams: lets whoever manages a tournament (its Organizer,
-- the hosting venue's manager, or Super Admin) register a team on
-- behalf of people who signed up in person rather than through the
-- app — no Sportonica account needed for any of them. Each member
-- gets a name + phone (required) and an optional email, stored
-- directly on the roster row instead of a user_id.
--
-- Payment still gets tracked (per the existing "confirmed vs
-- payment_pending" team status), matching how every other paid
-- registration works — the difference is there's no online proof-of-
-- payment step for a walk-in (the admin collected cash/whatever in
-- person), so a dedicated mark_walkin_team_paid() RPC flips the
-- status directly instead of going through submit_payment()/
-- review_payment()'s screenshot-review flow.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_teams alter column captain_id drop not null;
alter table public.tournament_teams add column if not exists is_walkin boolean not null default false;
alter table public.tournament_teams add column if not exists created_by uuid references auth.users(id);

alter table public.tournament_team_players alter column user_id drop not null;
alter table public.tournament_team_players add column if not exists guest_name text;
alter table public.tournament_team_players add column if not exists guest_phone text;
alter table public.tournament_team_players add column if not exists guest_email text;

alter table public.tournament_team_players drop constraint if exists ttp_user_or_guest_check;
alter table public.tournament_team_players add constraint ttp_user_or_guest_check check (
  (user_id is not null and guest_name is null and guest_phone is null and guest_email is null)
  or (user_id is null and length(trim(coalesce(guest_name, ''))) > 0 and length(trim(coalesce(guest_phone, ''))) > 0)
);

-- ── Read access: is_tournament_organizer() (own-venue tournaments —
-- no vendor, so has_venue_access() alone can't see these) wasn't
-- included in the original read policies below, which means an
-- own-venue Organizer couldn't even see their own teams. Additive
-- policies (RLS OR's every permissive policy together), so this only
-- ever widens access, never narrows what already worked. ───────────
drop policy if exists tournament_teams_read_organizer2 on public.tournament_teams;
create policy tournament_teams_read_organizer2 on public.tournament_teams for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists tournament_team_players_read_organizer2 on public.tournament_team_players;
create policy tournament_team_players_read_organizer2 on public.tournament_team_players for select
  using (exists (
    select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
    where tt.id = team_id and public.is_tournament_organizer(t)
  ));

-- ── create_walkin_team: p_members is a jsonb array of
-- {name, phone, email?}. First member becomes the roster's 'captain'
-- (display-only — there's no real captain_id/account behind it). ──
create or replace function public.create_walkin_team(
  p_tournament_id uuid,
  p_team_name     text,
  p_members       jsonb
) returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.tournaments;
  v_team    public.tournament_teams;
  v_member  jsonb;
  v_name    text;
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

  if p_team_name is null or length(trim(p_team_name)) = 0 then raise exception 'TEAM_NAME_REQUIRED'; end if;

  v_count := coalesce(jsonb_array_length(p_members), 0);
  if v_count = 0 then raise exception 'AT_LEAST_ONE_MEMBER_REQUIRED'; end if;
  if v_count > v_t.max_players_per_team + v_t.substitute_limit then raise exception 'TOO_MANY_PLAYERS'; end if;

  select count(*) into v_existing from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_existing >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status, is_walkin, created_by)
  values (
    p_tournament_id, trim(p_team_name), null, true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    true, auth.uid()
  ) returning * into v_team;

  for i in 0 .. v_count - 1 loop
    v_member := p_members -> i;
    v_name  := trim(coalesce(v_member->>'name', ''));
    v_phone := trim(coalesce(v_member->>'phone', ''));
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    if v_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
    values (v_team.id, v_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb) to authenticated;

-- ── mark_walkin_team_paid: the walk-in equivalent of review_payment()
-- APPROVE — no payments row exists for these, so there's nothing for
-- the Payments console to review. ──────────────────────────────────
create or replace function public.mark_walkin_team_paid(p_team_id uuid)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if not v_team.is_walkin then raise exception 'NOT_A_WALKIN_TEAM'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_team.status <> 'payment_pending' then raise exception 'NOT_PENDING_PAYMENT'; end if;

  update public.tournament_teams set status = 'confirmed' where id = p_team_id returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.mark_walkin_team_paid(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
