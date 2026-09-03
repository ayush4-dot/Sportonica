-- ================================================================
-- LATE REGISTRATION → FIXTURES STAY IN SYNC
--
-- create_walkin_team() (tournament_team_edit.sql, redeclared in
-- tournament_walkin_phone_optional.sql) already lets an organizer/venue
-- manager/super_admin add a team any time — including after registration
-- closes or the bracket/schedule has already been generated. Until now
-- that late team was just never in the fixtures: generate_knockout_bracket
-- / generate_league_fixtures / generate_group_fixtures snapshot the
-- confirmed team list once and refuse to run again (ALREADY_GENERATED).
--
-- regenerate_tournament_fixtures() closes that gap: create_walkin_team
-- calls it after inserting the new team, AND it's a standalone RPC an
-- admin can call directly (a "Regenerate fixtures" button) for cases the
-- auto-call can't resolve on its own — e.g. a group_knockout team that
-- had no group yet when it was added.
--
-- Behaviour:
--  - No fixtures generated yet -> no-op ('NO_MATCHES'); the next manual
--    "Generate bracket/fixtures" call picks the team up normally.
--  - A REAL result already exists (a two-team match that's completed or
--    walkover) -> no-op ('ALREADY_PLAYED'). Rebuilding from scratch would
--    destroy match history, so it's left alone; a bye (team_b_id null,
--    auto-completed by build_knockout_bracket with no opponent ever
--    playing) does NOT count as a real result and never blocks a rebuild
--    — that was the original bug: any bracket with a bye (any team count
--    that isn't a power of 2) silently never regenerated.
--  - group_knockout with a confirmed, ungrouped team -> no-op
--    ('TEAMS_NOT_GROUPED'); there's no automatic way to decide which
--    group it belongs in — assign one, then call this again.
--  - Otherwise: wipes and rebuilds tournament_matches from the current
--    confirmed team list -> 'REBUILT'.
--
-- Run AFTER: tournaments.sql (build_knockout_bracket, build_round_robin,
-- tournament_matches, is_tournament_organizer, has_venue_access,
-- is_super_admin). Idempotent, not destructive to played matches.
-- ================================================================

create or replace function public.regenerate_tournament_fixtures(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t        public.tournaments;
  v_played   int;
  v_team_ids uuid[];
  v_group    text;
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

  if not exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    return 'NO_MATCHES'; -- no bracket/schedule generated yet — nothing to keep in sync
  end if;

  -- A bye (team_b_id null) is auto-completed by build_knockout_bracket
  -- with no opponent ever playing — it doesn't count as "underway".
  -- Only a real two-team completed/walkover match should block a rebuild.
  select count(*) into v_played from public.tournament_matches
    where tournament_id = p_tournament_id and status in ('completed', 'walkover')
      and team_b_id is not null;
  if v_played > 0 then
    return 'ALREADY_PLAYED'; -- a real result exists — never clobber recorded results
  end if;

  if v_t.format = 'group_knockout' and exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is null
  ) then
    return 'TEAMS_NOT_GROUPED'; -- new team has no group yet — needs a human to assign one
  end if;

  delete from public.tournament_matches where tournament_id = p_tournament_id;

  if v_t.format = 'knockout' then
    select array_agg(id order by seed nulls last, created_at) into v_team_ids
      from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';
    if coalesce(array_length(v_team_ids, 1), 0) >= 2 then
      perform public.build_knockout_bracket(p_tournament_id, v_team_ids);
    end if;
  elsif v_t.format = 'league' then
    select array_agg(id order by seed nulls last, created_at) into v_team_ids
      from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';
    if coalesce(array_length(v_team_ids, 1), 0) >= 2 then
      perform public.build_round_robin(p_tournament_id, 'league', null, v_team_ids);
    end if;
  elsif v_t.format = 'group_knockout' then
    for v_group in
      select distinct group_name from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'confirmed'
      order by group_name
    loop
      select array_agg(id order by seed nulls last, created_at) into v_team_ids
        from public.tournament_teams
        where tournament_id = p_tournament_id and status = 'confirmed' and group_name = v_group;
      if coalesce(array_length(v_team_ids, 1), 0) >= 2 then
        perform public.build_round_robin(p_tournament_id, 'group', v_group, v_team_ids);
      end if;
    end loop;
  end if;

  return 'REBUILT';
end;
$$;
grant execute on function public.regenerate_tournament_fixtures(uuid) to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
