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
-- calls it after inserting the new team. If no fixtures exist yet, it's a
-- no-op (the next manual "Generate bracket/fixtures" call will pick the
-- team up normally). If fixtures exist, it wipes and rebuilds them from
-- the current confirmed team list — but ONLY while nothing has been
-- played yet (no match is 'completed' or 'walkover'). Once a result has
-- been recorded, rebuilding from scratch would destroy real match
-- history, so it's left alone; the late team is on the roster but a
-- human has to fold it in by hand (e.g. via create_match) from that point
-- on. group_knockout tournaments are skipped the same way when the new
-- team hasn't been assigned a group yet — there's no automatic way to
-- decide which group it belongs in.
--
-- Run AFTER: tournaments.sql (build_knockout_bracket, build_round_robin,
-- tournament_matches). Idempotent, not destructive to played matches.
-- ================================================================

create or replace function public.regenerate_tournament_fixtures(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t        public.tournaments;
  v_played   int;
  v_team_ids uuid[];
  v_group    text;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then return; end if;

  if not exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    return; -- no bracket/schedule generated yet — nothing to keep in sync
  end if;

  select count(*) into v_played from public.tournament_matches
    where tournament_id = p_tournament_id and status in ('completed', 'walkover');
  if v_played > 0 then
    return; -- matches already underway — never clobber recorded results
  end if;

  if v_t.format = 'group_knockout' and exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is null
  ) then
    return; -- new team has no group yet — needs a human to assign one
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
end;
$$;

-- Internal helper only — called from create_walkin_team (security
-- definer, runs as the function owner). No grant to authenticated.

-- ── DONE ────────────────────────────────────────────────────────────
