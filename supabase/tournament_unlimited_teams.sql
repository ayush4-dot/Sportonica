-- ================================================================
-- TOURNAMENTS: allow "unlimited teams" (no max_teams cap)
--
-- What it does: the client wants the option to run a tournament with
-- no fixed team-count limit. max_teams was NOT NULL; it's now nullable,
-- and NULL means "unlimited" throughout the app.
--
-- Run AFTER: tournaments.sql, tournament_edit_details.sql (the
-- update_tournament_draft this replaces).
-- Idempotent. Not destructive — existing rows all have a real
-- max_teams value already, this only relaxes the constraint.
--
-- Verified NULL-safe with no code change needed:
--  - register_team / create_walkin_team both gate on
--    `v_existing >= v_t.max_teams`, which is NULL (never TRUE) when
--    max_teams is NULL, so the TOURNAMENT_FULL check just never fires.
--  - The `tournaments_max_teams_check CHECK (max_teams >= 2)`
--    constraint already lets NULL through (a CHECK only rejects FALSE,
--    and `NULL >= 2` is NULL) — still guards against a bogus 0/1 when a
--    number IS given, so it's left in place.
--
-- Two things DID need a change, both below:
--  1. update_tournament_draft used `coalesce(new, existing)` for every
--     field, which means there was no way to ever clear max_teams back
--     to NULL once set — an omitted key still needs to mean "leave
--     unchanged" for every other field, so max_teams now distinguishes
--     "key present" (set it, even to NULL) from "key absent" (leave it).
--  2. publish_tournament refused to publish when max_teams was NULL
--     (INCOMPLETE_TOURNAMENT) — that check is dropped for max_teams
--     only; min/max players per team are still required.
-- ================================================================

-- ── 1. Column: max_teams becomes nullable ──
alter table public.tournaments alter column max_teams drop not null;

-- ── 2. update_tournament_draft: max_teams can be explicitly cleared ──
create or replace function public.update_tournament_draft(p_id uuid, p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_row)
    or public.has_venue_access(v_row.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

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
    -- unlike every other field here, an explicit null in the payload
    -- must be allowed to win (that's how "unlimited" is set) — so this
    -- checks whether the key is present at all, not just its value.
    max_teams = case when p ? 'max_teams' then nullif(p->>'max_teams', '')::int else max_teams end,
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

-- ── 3. publish_tournament: max_teams no longer required to publish ──
create or replace function public.publish_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  if v_row.venue_booking_status <> 'confirmed' then raise exception 'VENUE_NOT_CONFIRMED'; end if;

  if v_row.name is null or v_row.sport is null
     or (v_row.venue_id is null and v_row.own_venue_name is null)
     or v_row.min_players_per_team is null or v_row.max_players_per_team is null
  then
    raise exception 'INCOMPLETE_TOURNAMENT';
  end if;

  update public.tournaments
    set status = case when public.is_super_admin() then 'published' else 'pending_approval' end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;

-- ── DONE ────────────────────────────────────────────────────────────
