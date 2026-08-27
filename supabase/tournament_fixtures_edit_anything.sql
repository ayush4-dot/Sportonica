-- ================================================================
-- "Edit anything, delete anything" — admin explicitly asked to be able
-- to delete or re-pick teams on a match regardless of its status
-- (completed, walkover, bye — doesn't matter, their call). Both RPCs
-- used to raise MATCH_ALREADY_DONE once a match was decided; that
-- guard is removed here, with the cascade/FK bookkeeping it existed to
-- avoid now handled explicitly instead:
--   - delete_match(): a match other matches point to via next_match_id
--     has no ON DELETE behavior on that FK, so deleting it first clears
--     every match's next_match_id/next_match_slot that pointed at it
--     (otherwise the delete would fail outright with a FK violation).
--     If the match being deleted had itself already propagated a
--     winner forward, reset_downstream_from() unwinds that first.
--   - update_match_teams(): swapping teams on an already-decided match
--     invalidates its old result (the old winner may not even be one
--     of the new teams anymore) — the match is reset to unscheduled
--     with the score/winner cleared, and reset_downstream_from() unwinds
--     anything that result had already fed forward.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_match.next_match_id is not null then
    perform public.reset_downstream_from(p_match_id);
  end if;

  -- Sever incoming links from any match that advances into this one —
  -- otherwise the delete below fails on the next_match_id FK.
  update public.tournament_matches set next_match_id = null, next_match_slot = null
    where next_match_id = p_match_id;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'deleted', to_jsonb(v_match));

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

create or replace function public.update_match_teams(p_match_id uuid, p_team_a_id uuid, p_team_b_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments; v_was_done boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = v_match.tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = v_match.tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  v_was_done := v_match.status in ('completed', 'walkover');
  if v_was_done and v_match.next_match_id is not null then
    perform public.reset_downstream_from(p_match_id);
  end if;

  update public.tournament_matches set
      team_a_id = p_team_a_id, team_b_id = p_team_b_id,
      status = case when v_was_done then 'unscheduled' else status end,
      score_a = case when v_was_done then null else score_a end,
      score_b = case when v_was_done then null else score_b end,
      score_a_et = case when v_was_done then null else score_a_et end,
      score_b_et = case when v_was_done then null else score_b_et end,
      score_a_pens = case when v_was_done then null else score_a_pens end,
      score_b_pens = case when v_was_done then null else score_b_pens end,
      winner_team_id = case when v_was_done then null else winner_team_id end
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.update_match_teams(uuid,uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
