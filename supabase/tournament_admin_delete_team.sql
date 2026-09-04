-- ================================================================
-- ADMIN: delete a registered team from a tournament
--
-- admin_delete_tournament_team(p_team_id) — hard-deletes one team
-- (its roster and match player-stats cascade). For the tournament
-- organiser, a venue manager on the host venue, or a super admin —
-- the same set that adds walk-in teams / edits rosters.
--
-- Refuses (TEAM_HAS_RESULTS) if the team has already played a real
-- two-team match (completed / walkover) — deleting it then would
-- leave the bracket and standings inconsistent. Byes don't count.
--
-- Clears the FK references that would otherwise block the delete:
--   payments.tournament_registration_id  (on delete restrict)  -> rows deleted
--   tournament_matches.team_a/b/winner   (no on-delete rule)    -> rows deleted
-- then regenerate_tournament_fixtures() rebuilds the bracket/schedule
-- from the remaining confirmed teams when nothing real has been
-- played yet (no-op otherwise).
--
-- Run AFTER: tournaments.sql, tournament_owner_access.sql,
-- tournament_late_reg_refixture.sql (regenerate_tournament_fixtures).
-- Idempotent (create or replace).
-- ================================================================

create or replace function public.admin_delete_tournament_team(p_team_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
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

  if exists (
    select 1 from public.tournament_matches
    where tournament_id = v_team.tournament_id
      and status in ('completed', 'walkover')
      and team_a_id is not null and team_b_id is not null
      and (team_a_id = p_team_id or team_b_id = p_team_id)
  ) then
    raise exception 'TEAM_HAS_RESULTS';
  end if;

  delete from public.payments where tournament_registration_id = p_team_id;

  delete from public.tournament_matches
    where tournament_id = v_team.tournament_id
      and (team_a_id = p_team_id or team_b_id = p_team_id or winner_team_id = p_team_id);

  -- tournament_team_players (and their tournament_match_player_stats)
  -- cascade from this.
  delete from public.tournament_teams where id = p_team_id;

  perform public.regenerate_tournament_fixtures(v_team.tournament_id);
end;
$$;
grant execute on function public.admin_delete_tournament_team(uuid) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
