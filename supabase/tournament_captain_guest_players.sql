-- ================================================================
-- CAPTAIN ADDS TEAMMATES BY NAME / EMAIL / PHONE (walk-in style)
--
-- What it does: when a team captain builds their roster during
-- registration, they enter each teammate's name (required) + email and
-- phone (optional) instead of searching for an existing account. Those
-- rows are guest rows (user_id null); the teammate is auto-linked later
-- by claim_guest_tournament_entries() when they sign in with a matching
-- email or phone.
--
-- Two new RPCs, both callable by the team's captain (only while
-- registration is open) OR a tournament organizer / venue manager /
-- super admin (any time) — the same permission split add_team_player()
-- already uses.
--
-- Run AFTER: tournaments.sql, tournament_admin_roster.sql,
-- tournament_walkin_phone_optional.sql (guest rows need only a name).
-- Idempotent. Not destructive.
-- ================================================================

-- ── add_team_guest_player: captain (or admin) adds a no-account teammate ──
create or replace function public.add_team_guest_player(
  p_team_id uuid,
  p_name    text,
  p_phone   text default null,
  p_email   text default null,
  p_role    text default 'player'
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
grant execute on function public.add_team_guest_player(uuid,text,text,text,text) to authenticated;

-- ── remove_team_guest_player: captain (or admin) removes a roster row
-- by its own id — the only way to target a guest member, since
-- remove_team_player() keys on user_id which is null for guests. ──
create or replace function public.remove_team_guest_player(p_team_player_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.tournament_team_players;
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_is_admin boolean;
begin
  select * into v_row from public.tournament_team_players where id = p_team_player_id for update;
  if not found then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

  select * into v_team from public.tournament_teams where id = v_row.team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;

  v_is_admin := public.is_tournament_organizer(v_t)
                or public.has_venue_access(v_t.venue_id, 'manager')
                or public.is_super_admin();

  if not (v_team.captain_id = auth.uid() or v_is_admin) then raise exception 'FORBIDDEN'; end if;
  if v_row.role = 'captain' or v_row.user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;
  if not v_is_admin and v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  delete from public.tournament_team_players where id = p_team_player_id;
end;
$$;
grant execute on function public.remove_team_guest_player(uuid) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
