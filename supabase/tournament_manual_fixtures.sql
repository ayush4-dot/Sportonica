-- ================================================================
-- Fully manual fixtures/bracket — replaces auto-seeding + auto-pairing
-- (generate_knockout_bracket/generate_league_fixtures/
-- generate_group_fixtures/generate_knockout_from_groups, all left in
-- place but no longer called from anywhere). The organizer now adds
-- each match by hand: pick both teams from the confirmed pool, a
-- stage, a round number, and a round label — then sets its date/time
-- separately via set_match_time() (already shipped). Scoring, extra
-- time/penalties, and player stats all work exactly as before —
-- nothing about record_match_result()/record_match_player_stats()
-- changes here.
--
-- create_match() flips the tournament to 'live' on the first match
-- created, same as auto-generation used to.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.create_match(
  p_tournament_id uuid,
  p_stage         text,
  p_round         int,
  p_round_label   text,
  p_team_a_id     uuid,
  p_team_b_id     uuid default null,
  p_group_name    text default null
) returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t   public.tournaments;
  v_row public.tournament_matches;
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
  if v_t.status not in ('registration_closed', 'live') then raise exception 'INVALID_TRANSITION'; end if;
  if p_stage not in ('group', 'league', 'knockout') then raise exception 'INVALID_STAGE'; end if;
  if p_round_label is null or length(trim(p_round_label)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = p_tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = p_tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  insert into public.tournament_matches (
    tournament_id, stage, round, round_label, group_name, team_a_id, team_b_id, status
  ) values (
    p_tournament_id, p_stage, p_round, trim(p_round_label), nullif(trim(coalesce(p_group_name, '')), ''),
    p_team_a_id, p_team_b_id, 'unscheduled'
  ) returning * into v_row;

  if v_t.status = 'registration_closed' then
    update public.tournaments set status = 'live' where id = p_tournament_id;
  end if;

  return v_row;
end;
$$;
grant execute on function public.create_match(uuid,text,int,text,uuid,uuid,text) to authenticated;

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
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
