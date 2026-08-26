-- ================================================================
-- Extra-time and penalty-shootout scores for knockout matches.
--
-- record_match_result() previously just rejected a tied knockout score
-- outright (KNOCKOUT_CANNOT_DRAW) — the only way around it was the
-- Walkover button, which is semantically wrong for a match that was
-- actually played and drawn, then settled in extra time or on
-- penalties. This redeclares the function to accept two more optional
-- score pairs and fall through: regulation decides the winner if it
-- isn't level, otherwise extra time if that isn't level either,
-- otherwise penalties. League/group matches are unaffected — a draw
-- there was always a valid result and still is.
--
-- Also folds in the is_tournament_organizer() check this function was
-- missing (same has_venue_access-only gap already fixed elsewhere in
-- this project for own-venue tournaments — a vendor-less Organizer
-- couldn't record their own match results before this).
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_matches add column if not exists score_a_et int;
alter table public.tournament_matches add column if not exists score_b_et int;
alter table public.tournament_matches add column if not exists score_a_pens int;
alter table public.tournament_matches add column if not exists score_b_pens int;

-- The new signature adds four more (all-default) parameters — Postgres
-- treats that as a different overload, not a replacement, and having
-- both the old 4-arg and new 8-arg versions live at once makes every
-- call ambiguous to PostgREST ("could not choose the best candidate
-- function"). Drop the old one explicitly first.
drop function if exists public.record_match_result(uuid,int,int,uuid);

create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
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
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;

    if p_score_a <> p_score_b then
      v_winner := case when p_score_a > p_score_b then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_et is not null and p_score_b_et is not null and p_score_a_et <> p_score_b_et then
      v_winner := case when p_score_a_et > p_score_b_et then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_pens is not null and p_score_b_pens is not null and p_score_a_pens <> p_score_b_pens then
      v_winner := case when p_score_a_pens > p_score_b_pens then v_match.team_a_id else v_match.team_b_id end;
    else
      v_winner := null;
    end if;

    if v_winner is null and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;

    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
