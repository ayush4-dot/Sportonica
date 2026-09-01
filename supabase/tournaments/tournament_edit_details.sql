-- ================================================================
-- TOURNAMENT EDIT DETAILS — let name/dates/fees/rules/etc. be edited
-- any time, not just while status = 'draft'. Run AFTER tournaments.sql
-- (needs is_tournament_organizer, has_venue_access, is_super_admin
-- already defined). Safe to re-run.
--
-- Two fixes bundled in the same function since they're both about who
-- can call this and when:
--   1. Dropped the "must be a draft" restriction entirely — the actual
--      constraint on editing something already published/live isn't
--      "can this row still be touched", it's "does the caller manage
--      it", which the permission check below already covers.
--   2. The permission check itself was missing has_venue_access() —
--      only is_tournament_organizer()/is_super_admin() were checked,
--      so a plain venue owner (vendor, not an Organizer) editing their
--      own venue's own tournament draft would already have been
--      FORBIDDEN before this fix, same class of bug as
--      open/close_tournament_registration and cancel_tournament had
--      (see tournament_owner_access.sql).
-- ================================================================
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

-- ── DONE ─────────────────────────────────────────────────────────
