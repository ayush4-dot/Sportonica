-- ================================================================
-- Diagnostic: why aren't booked slots showing red on the booking screen?
-- Run this whole file in the Supabase SQL editor. Read-only — changes
-- nothing. Each block prints a labelled result.
-- ================================================================

-- 1. Is the court_busy_slots() function installed?
--    (src/lib/play/availability.ts calls this to see EVERYONE's bookings.)
select
  'court_busy_slots function' as check,
  case when count(*) > 0 then 'INSTALLED ✅' else 'MISSING ❌ — run supabase/venues/court_busy_slots.sql' end as status,
  count(*) as overloads
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'court_busy_slots';

-- 2. What SELECT policies exist on court_bookings? If the only one is
--    "user_id = auth.uid()", a player can't see other players' bookings
--    (that's the whole problem this feature hits).
select
  'court_bookings SELECT policies' as check,
  policyname, cmd, qual as using_expression
from pg_policies
where schemaname = 'public' and tablename = 'court_bookings' and cmd in ('SELECT', 'ALL')
order by policyname;

-- 3. Are there actually any active bookings to show? (last 30 days →
--    next 30 days). If this is empty, nothing WILL be red — book a slot
--    first, then re-check.
select
  b.id, b.court_id, c.name as court, b.starts_at, b.ends_at, b.state, b.payment_status
from public.court_bookings b
left join public.courts c on c.id = b.court_id
where b.starts_at between now() - interval '30 days' and now() + interval '30 days'
  and b.state not in ('dropped','no_show','refunded','cancelled')
order by b.starts_at
limit 50;

-- 4. Court blocks in the same window (also render as unavailable).
select k.id, k.court_id, c.name as court, k.starts_at, k.ends_at
from public.court_blocks k
left join public.courts c on c.id = k.court_id
where k.starts_at between now() - interval '30 days' and now() + interval '30 days'
order by k.starts_at
limit 50;

-- 5. If the function IS installed, this is exactly what the app sees for
--    a given court/day. Replace the court_id and date, then run just this.
-- select * from public.court_busy_slots(
--   '00000000-0000-0000-0000-000000000000'::uuid,   -- court_id from block 3
--   current_date                                     -- the day you're viewing
-- );

-- 6. Realtime for live updates (supabase/venues/realtime_availability.sql).
select
  'court_availability_pings in realtime publication' as check,
  case when count(*) > 0 then 'YES ✅' else 'NO — run realtime_availability.sql (optional, for live red without refresh)' end as status
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'court_availability_pings';
