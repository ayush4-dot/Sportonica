-- ================================================================
-- events_full — the main game/event discovery feed.
--
-- This view already existed in the live database (created directly
-- in Supabase Studio, not tracked in git) before this file was added.
-- Definition below was pulled from production via `pg_get_viewdef` on
-- 2026-08-19 and committed here so schema changes go through git
-- instead of drifting. Safe to run multiple times.
-- ================================================================

create or replace view public.events_full as
select
  e.id,
  e.host_id,
  e.sport,
  e.title,
  e.venue,
  e.venue_lat,
  e.venue_lng,
  e.event_date,
  e.max_players,
  e.fee,
  e.description,
  e.status,
  e.created_at,
  e.venue_id,
  e.flash,
  e.sport_color,
  e.min_players,
  e.event_type,
  e.organizer_name,
  e.banner_url,
  e.skill_level,
  e.bring_own_gear,
  e.notes,
  e.duration_mins,
  coalesce(c.confirmed_count, 0::bigint) as confirmed_count,
  greatest(e.max_players - coalesce(c.confirmed_count, 0::bigint), 0::bigint) as slots_remaining,
  p.full_name as host_name,
  p.username as host_username,
  p.avatar_url as host_avatar,
  coalesce(p.trust_score, 50::numeric) as host_trust
from events e
left join (
  select bookings.event_id, count(*) as confirmed_count
  from bookings
  where bookings.status = 'confirmed'::text
  group by bookings.event_id
) c on c.event_id = e.id
left join profiles p on p.id = e.host_id;

grant select on public.events_full to anon, authenticated;

-- ================================================================
-- Indexes backing events_full's actual query patterns.
--
-- idx_events_date / idx_events_sport / idx_events_status already
-- existed (also created outside git). event_type and flash were
-- both used as filters with no supporting index:
--   - homeRails.ts filters event_type IN (...) / = 'pickup',
--     always combined with an event_date range + order — a
--     composite index serves that exact access path.
--   - useEvents.ts filters flash = true, also combined with
--     event_date — flash events are a small subset, so a partial
--     index keyed on event_date scoped to flash = true is cheaper
--     than indexing the low-cardinality boolean column directly.
-- ================================================================

create index if not exists idx_events_type_date
  on public.events using btree (event_type, event_date);

create index if not exists idx_events_flash_date
  on public.events using btree (event_date)
  where flash = true;
