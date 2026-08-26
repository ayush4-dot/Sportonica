-- ================================================================
-- Yellow/red card tracking + disciplinary fines, recorded alongside
-- goals in the existing per-match player stats system
-- (tournament_player_stats.sql). Fine amounts are per-tournament
-- (an organizer sets Rs/card once when creating it, defaulting to 0 —
-- untracked) rather than hardcoded, since different tournaments set
-- their own rates.
--
-- create_tournament()/update_tournament_draft() are redeclared here
-- with the two new fields added on top of their current bodies
-- (tournament_own_venue_maps_link.sql / organizer_partnerships.sql
-- respectively) — same "whichever ran last wins" reason flagged in
-- tournament_payment_playtogether_regression_fix.sql: `create or
-- replace` has no merge, so adding a column means re-declaring the
-- whole function, not just the new part.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournaments add column if not exists yellow_card_fine numeric(10,2) not null default 0 check (yellow_card_fine >= 0);
alter table public.tournaments add column if not exists red_card_fine numeric(10,2) not null default 0 check (red_card_fine >= 0);

alter table public.tournament_match_player_stats add column if not exists yellow_cards int not null default 0 check (yellow_cards between 0 and 2);
alter table public.tournament_match_player_stats add column if not exists red_card boolean not null default false;

create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := nullif(p->>'venue_id', '')::uuid;
  v_own_venue_name text := nullif(trim(p->>'own_venue_name'), '');
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  if v_venue_id is not null then
    select owner_id into v_vendor_id from public.venues where id = v_venue_id;
    if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;
    if not (
      public.is_organizer()
      and exists (
        select 1 from public.partnerships
        where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
      )
    ) then
      raise exception 'FORBIDDEN';
    end if;
  elsif v_own_venue_name is not null then
    if not public.is_organizer() then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.tournaments (
    venue_id, own_venue_name, own_venue_address, own_venue_map_url, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules, yellow_card_fine, red_card_fine
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
    nullif(trim(p->>'own_venue_map_url'), ''),
    (p->>'own_venue_lat')::double precision, (p->>'own_venue_lng')::double precision,
    case when v_venue_id is null then 'confirmed' else 'pending' end,
    auth.uid(),
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules',
    coalesce((p->>'yellow_card_fine')::numeric, 0), coalesce((p->>'red_card_fine')::numeric, 0)
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

create or replace function public.update_tournament_draft(p_id uuid, p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'NOT_A_DRAFT'; end if;

  update public.tournaments set
    name = coalesce(p->>'name', name),
    sport = coalesce(p->>'sport', sport),
    banner_url = coalesce(p->>'banner_url', banner_url),
    description = coalesce(p->>'description', description),
    contact_phone = coalesce(p->>'contact_phone', contact_phone),
    starts_at = coalesce((p->>'starts_at')::timestamptz, starts_at),
    ends_at = coalesce((p->>'ends_at')::timestamptz, ends_at),
    registration_opens_at = coalesce((p->>'registration_opens_at')::timestamptz, registration_opens_at),
    registration_closes_at = coalesce((p->>'registration_closes_at')::timestamptz, registration_closes_at),
    match_duration_mins = coalesce((p->>'match_duration_mins')::int, match_duration_mins),
    format = coalesce(p->>'format', format),
    max_teams = coalesce((p->>'max_teams')::int, max_teams),
    min_players_per_team = coalesce((p->>'min_players_per_team')::int, min_players_per_team),
    max_players_per_team = coalesce((p->>'max_players_per_team')::int, max_players_per_team),
    substitute_limit = coalesce((p->>'substitute_limit')::int, substitute_limit),
    registration_mode = coalesce(p->>'registration_mode', registration_mode),
    gender_rule = coalesce(p->>'gender_rule', gender_rule),
    skill_category = coalesce(p->>'skill_category', skill_category),
    fee = coalesce((p->>'fee')::numeric, fee),
    payment_instructions = coalesce(p->>'payment_instructions', payment_instructions),
    refund_policy = coalesce(p->>'refund_policy', refund_policy),
    prize_winner = coalesce(p->>'prize_winner', prize_winner),
    prize_runner_up = coalesce(p->>'prize_runner_up', prize_runner_up),
    prize_mvp = coalesce(p->>'prize_mvp', prize_mvp),
    prize_other = coalesce(p->>'prize_other', prize_other),
    rules_text = coalesce(p->>'rules_text', rules_text),
    equipment_notes = coalesce(p->>'equipment_notes', equipment_notes),
    venue_rules = coalesce(p->>'venue_rules', venue_rules),
    yellow_card_fine = coalesce((p->>'yellow_card_fine')::numeric, yellow_card_fine),
    red_card_fine = coalesce((p->>'red_card_fine')::numeric, red_card_fine)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_tournament_draft(uuid,jsonb) to authenticated;

-- ── record_match_player_stats: add yellow_cards/red_card alongside
-- goals/is_mom. Same body as tournament_player_stats.sql otherwise. ──
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

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, is_mom, yellow_cards, red_card)
    values (
      p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'is_mom')::boolean, false),
      least(coalesce((v_stat->>'yellow_cards')::int, 0), 2), coalesce((v_stat->>'red_card')::boolean, false)
    )
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, is_mom = excluded.is_mom,
          yellow_cards = excluded.yellow_cards, red_card = excluded.red_card, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── get_tournament_team_fines: total disciplinary fine owed per team,
-- for whoever manages the tournament to collect. ───────────────────
create or replace function public.get_tournament_team_fines(p_tournament_id uuid)
returns table (team_id uuid, total_fine numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
    select tt.id,
      coalesce(sum(s.yellow_cards), 0) * v_t.yellow_card_fine
        + coalesce(sum(s.red_card::int), 0) * v_t.red_card_fine
    from public.tournament_teams tt
    left join public.tournament_team_players tp on tp.team_id = tt.id
    left join public.tournament_match_player_stats s on s.team_player_id = tp.id
    where tt.tournament_id = p_tournament_id
    group by tt.id;
end;
$$;
grant execute on function public.get_tournament_team_fines(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
