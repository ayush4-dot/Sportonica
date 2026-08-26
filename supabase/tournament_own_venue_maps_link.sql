-- ================================================================
-- Sportonica — own-venue tournaments get a location the same way real
-- venues do: paste a Google Maps link (parseMapsUrl() in
-- src/lib/admin/location.ts already parses it into lat/lng), not a
-- browser-geolocation pin. Run AFTER organizer_approval_and_own_venue.sql.
-- Safe to re-run.
-- ================================================================

alter table public.tournaments add column if not exists own_venue_map_url text;

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
    rules_text, equipment_notes, venue_rules
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
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules'
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
