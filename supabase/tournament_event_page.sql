-- ================================================================
-- Backs the new public tournament event page (Overview / Table /
-- Knockout / Fixtures / Player Stats / Teams):
--   - assists, alongside goals/cards already tracked
--   - goals for/against/diff in standings (was points-only)
--   - a lightweight per-match date & time the organizer sets directly
--     (no court, no conflict-checking — venue is already fixed at the
--     tournament level; this is just "when", for the public Fixtures
--     list, replacing the court-scheduling flow removed earlier)
--   - a tournament-wide player stats leaderboard, public
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_match_player_stats add column if not exists assists int not null default 0 check (assists >= 0);

create or replace function public.record_match_player_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t     public.tournaments;
  v_stat  jsonb;
  v_tp_id uuid;
  v_valid boolean;
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
  if v_match.status <> 'completed' then raise exception 'MATCH_NOT_COMPLETED'; end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb))
  loop
    v_tp_id := (v_stat->>'team_player_id')::uuid;

    select exists (
      select 1 from public.tournament_team_players
      where id = v_tp_id and team_id in (v_match.team_a_id, v_match.team_b_id)
    ) into v_valid;
    if not v_valid then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, assists, is_mom, yellow_cards, red_card)
    values (
      p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'assists')::int, 0),
      coalesce((v_stat->>'is_mom')::boolean, false),
      least(coalesce((v_stat->>'yellow_cards')::int, 0), 2), coalesce((v_stat->>'red_card')::boolean, false)
    )
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, assists = excluded.assists, is_mom = excluded.is_mom,
          yellow_cards = excluded.yellow_cards, red_card = excluded.red_card, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── Standings: add goals for/against/diff, use GD then GF as the
-- standard football tiebreak after points. ─────────────────────────
create or replace function public.tournament_standings(p_tournament_id uuid, p_group_name text default null)
returns table(
  team_id uuid, team_name text, played int, won int, drawn int, lost int,
  goals_for int, goals_against int, goal_diff int, points int
)
language sql stable as $$
  with relevant_matches as (
    select * from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and m.stage in ('league','group')
      and (p_group_name is null or m.group_name = p_group_name)
      and m.status in ('completed','walkover')
  )
  select
    t.id as team_id,
    t.name as team_name,
    count(rm.id)::int as played,
    count(rm.id) filter (where rm.winner_team_id = t.id)::int as won,
    count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b)::int as drawn,
    count(rm.id) filter (where rm.winner_team_id is not null and rm.winner_team_id <> t.id)::int as lost,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_a when rm.team_b_id = t.id then rm.score_b end), 0)::int as goals_for,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_b when rm.team_b_id = t.id then rm.score_a end), 0)::int as goals_against,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_a when rm.team_b_id = t.id then rm.score_b end), 0)::int
      - coalesce(sum(case when rm.team_a_id = t.id then rm.score_b when rm.team_b_id = t.id then rm.score_a end), 0)::int as goal_diff,
    (count(rm.id) filter (where rm.winner_team_id = t.id) * 3
     + count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b))::int as points
  from public.tournament_teams t
  left join relevant_matches rm on (rm.team_a_id = t.id or rm.team_b_id = t.id)
  where t.tournament_id = p_tournament_id and t.status = 'confirmed'
    and (p_group_name is null or t.group_name = p_group_name)
  group by t.id, t.name
  order by points desc, goal_diff desc, goals_for desc, team_name asc;
$$;
grant execute on function public.tournament_standings(uuid,text) to anon, authenticated;

-- ── set_match_time: just "when", no court/conflict-checking — the
-- venue is already fixed for the whole tournament. ──────────────────
create or replace function public.set_match_time(p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.tournament_matches
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
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set starts_at = p_starts_at, ends_at = p_ends_at, status = case
      when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
      when status = 'scheduled' and p_starts_at is null then 'unscheduled'
      else status
    end
    where id = p_match_id
    returning * into v_match;

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz) to authenticated;

-- ── get_tournament_player_stats: public leaderboard — name (from the
-- linked account or the walk-in guest_name) + team + totals, across
-- every completed match in the tournament. No phone/email exposed. ──
create or replace function public.get_tournament_player_stats(p_tournament_id uuid)
returns table (
  team_player_id uuid, player_name text, team_id uuid, team_name text,
  goals bigint, assists bigint, yellow_cards bigint, red_cards bigint, mom_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    tp.id as team_player_id,
    coalesce(p.full_name, p.name, p.username, tp.guest_name, 'Player') as player_name,
    tt.id as team_id,
    tt.name as team_name,
    coalesce(sum(s.goals), 0) as goals,
    coalesce(sum(s.assists), 0) as assists,
    coalesce(sum(s.yellow_cards), 0) as yellow_cards,
    coalesce(sum(s.red_card::int), 0) as red_cards,
    coalesce(count(*) filter (where s.is_mom), 0) as mom_count
  from public.tournament_team_players tp
  join public.tournament_teams tt on tt.id = tp.team_id
  left join public.profiles p on p.id = tp.user_id
  left join public.tournament_match_player_stats s on s.team_player_id = tp.id
  where tt.tournament_id = p_tournament_id and tt.status = 'confirmed'
  group by tp.id, p.full_name, p.name, p.username, tp.guest_name, tt.id, tt.name
  having coalesce(sum(s.goals), 0) + coalesce(sum(s.assists), 0)
    + coalesce(sum(s.yellow_cards), 0) + coalesce(sum(s.red_card::int), 0) > 0
  order by goals desc, assists desc, player_name asc;
$$;
grant execute on function public.get_tournament_player_stats(uuid) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
