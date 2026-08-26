-- ================================================================
-- Bracket system upgrade: optional auto-generate (coexists with the
-- manual match builder — generation only runs when zero matches exist
-- yet, so it can never clobber hand-built fixtures), true winner
-- auto-cascade with a confirm-before-overwrite safety net, richer
-- match status, and per-match notes/ground label.
--
-- Auto-cascade design (the important part): record_match_result()
-- already called propagate_match_winner() when next_match_id was set
-- — that plumbing was live but unused, since manual match creation
-- never wires next_match_id. This adds:
--   1. A way to WIRE it — generate_knockout_bracket() (already existed,
--      untouched logic, just a permission-check fix) pre-wires the
--      whole tree; set_match_advancement() lets a hand-built match opt
--      into the same mechanism one link at a time.
--   2. A DIFF CHECK before overwriting — if the next match's slot
--      already holds the same team the diff is a no-op, so routine
--      score corrections that don't change who advances never prompt
--      anything. If it holds a *different* team, the caller must pass
--      p_confirm_cascade=true or the RPC raises
--      CASCADE_CONFIRMATION_REQUIRED — the client checks this
--      proactively client-side first (it already has the full match
--      list in memory) so confirming is a single follow-up call, not
--      a failed-then-retried one.
--   3. A RECURSIVE RESET — confirmed cascades clear every match
--      downstream of the corrected one (scores, winner, status, and
--      the propagated team slot), not just the immediate next match,
--      so a result correction can never leave a stale team sitting
--      several rounds ahead of where they actually got knocked out.
-- Every one of these writes an audit row, same as every other match
-- edit already does.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_matches add column if not exists notes text;
alter table public.tournament_matches add column if not exists court_label text;

alter table public.tournament_matches drop constraint if exists tournament_matches_status_check;
alter table public.tournament_matches add constraint tournament_matches_status_check
  check (status in ('unscheduled','scheduled','live','postponed','completed','walkover','cancelled'));

-- ── set_team_seed / generate_knockout_bracket: same logic as before,
-- just adding is_tournament_organizer() — an own-venue Organizer
-- (no vendor, so has_venue_access() alone can't see them) couldn't
-- seed or generate for their own tournament before this. ────────────
create or replace function public.set_team_seed(p_team_id uuid, p_seed int, p_group_name text default null)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if v_team.status <> 'confirmed' then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  update public.tournament_teams
    set seed = p_seed, group_name = coalesce(p_group_name, group_name)
    where id = p_team_id
    returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.set_team_seed(uuid,int,text) to authenticated;

create or replace function public.generate_knockout_bracket(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  -- The one safety rule that matters: generation only ever runs against
  -- an empty match list. Any matches already on the board — whether
  -- from a previous generation or hand-built — block it outright rather
  -- than silently merging or overwriting results.
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_knockout_bracket(p_tournament_id, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_knockout_bracket(uuid) to authenticated;

-- ── set_match_advancement: opt a hand-built match into the same
-- auto-cascade mechanism generation uses, one link at a time. ──────
create or replace function public.set_match_advancement(p_match_id uuid, p_next_match_id uuid, p_next_match_slot text)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_next public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_next_match_slot not in ('a','b') then raise exception 'INVALID_SLOT'; end if;
  if p_next_match_id = p_match_id then raise exception 'SAME_MATCH'; end if;

  select * into v_next from public.tournament_matches where id = p_next_match_id and tournament_id = v_match.tournament_id;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  update public.tournament_matches set next_match_id = p_next_match_id, next_match_slot = p_next_match_slot
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_advancement(uuid,uuid,text) to authenticated;

-- ── set_match_status: direct status flip (Live/Postponed/Cancelled/
-- back to Scheduled) independent of entering a score — the reference
-- brief's status list beyond what a result/schedule edit already
-- implies. Blocked once a real result is recorded; use record_match_result
-- (or delete_match, for unplayed ones) to undo that instead. ────────
create or replace function public.set_match_status(p_match_id uuid, p_status text)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  if p_status not in ('unscheduled','scheduled','live','postponed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed','walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  update public.tournament_matches set status = p_status where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_status(uuid,text) to authenticated;

-- ── set_match_time: adds ground/notes alongside the date/time it
-- already set. Same signature-widening reason as everywhere else in
-- this project — CREATE OR REPLACE can't add params to a function
-- PostgREST already resolved without a matching drop first. ────────
drop function if exists public.set_match_time(uuid,timestamptz,timestamptz);

create or replace function public.set_match_time(
  p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_court_label text default null, p_notes text default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set
      starts_at = p_starts_at, ends_at = p_ends_at,
      court_label = coalesce(p_court_label, court_label),
      notes = coalesce(p_notes, notes),
      status = case
        when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
        when status = 'scheduled' and p_starts_at is null then 'unscheduled'
        else status
      end
    where id = p_match_id
    returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz,text,text) to authenticated;

-- ── reset_downstream_from: walks next_match_id forward from a
-- corrected match, clearing every match that had already advanced
-- from its (now-stale) old winner. ──────────────────────────────────
create or replace function public.reset_downstream_from(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_next public.tournament_matches;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if not found or v_match.next_match_id is null then return; end if;

  select * into v_next from public.tournament_matches where id = v_match.next_match_id;
  if not found then return; end if;

  -- Recurse first — if v_next had itself already advanced a winner
  -- further down the tree, that has to be unwound before v_next's own
  -- team slot changes underneath it.
  perform public.reset_downstream_from(v_next.id);

  if v_match.next_match_slot = 'a' then
    update public.tournament_matches set team_a_id = null where id = v_next.id;
  else
    update public.tournament_matches set team_b_id = null where id = v_next.id;
  end if;

  update public.tournament_matches set
      status = 'unscheduled', score_a = null, score_b = null,
      score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null,
      winner_team_id = null
    where id = v_next.id;
end;
$$;

-- ── record_match_result: adds the cascade diff-check + confirm gate
-- + recursive reset on top of the existing scoring/ET/pens logic.
-- One more parameter than the live signature (with a default, but
-- Postgres still treats that as a distinct overload) — drop the old
-- 8-arg version first so PostgREST isn't left choosing between two. ──
drop function if exists public.record_match_result(uuid,int,int,uuid,int,int,int,int);

create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null,
  p_confirm_cascade boolean default false
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_before public.tournament_matches;
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
  v_current_next_team uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
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
  end if;

  -- Diff check, before touching anything: does this result actually
  -- change who's sitting in the next match's slot? If the slot's empty
  -- or already holds this exact team, there's nothing to cascade —
  -- proceed straight to a normal save, no confirmation needed.
  if v_winner is not null and v_match.next_match_id is not null then
    select (case when v_match.next_match_slot = 'a' then team_a_id else team_b_id end)
      into v_current_next_team
      from public.tournament_matches where id = v_match.next_match_id;

    if v_current_next_team is not null and v_current_next_team is distinct from v_winner and not p_confirm_cascade then
      raise exception 'CASCADE_CONFIRMATION_REQUIRED';
    end if;
  end if;

  if p_winner_team_id is not null then
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'result', to_jsonb(v_before), to_jsonb(v_match));

  if v_winner is not null and v_match.next_match_id is not null and v_current_next_team is distinct from v_winner then
    if v_current_next_team is not null then
      perform public.reset_downstream_from(p_match_id);
    end if;
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int,boolean) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
