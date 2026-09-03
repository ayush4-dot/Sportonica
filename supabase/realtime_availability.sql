-- ================================================================
-- Sportonica — realtime "a slot changed" pings for the booking screen.
-- Run once in the Supabase SQL editor. Safe to re-run. Not destructive (adds one table + triggers).
--
-- SlotPicker (src/app/(play)/create/[id]/SlotPicker.tsx) wants to update
-- the timetable live when another player books or frees a slot. It can't
-- subscribe to court_bookings directly — RLS scopes those rows to their
-- owner, so a different player's INSERT never reaches the subscription.
--
-- This table carries only court_id + day + a timestamp — no names, no
-- prices, nothing private — and is world-readable, so any viewer of the
-- booking screen gets the ping and refetches availability (which still
-- runs server-side and is the authoritative check).
-- ================================================================

create table if not exists public.court_availability_pings (
  court_id   uuid not null references public.courts(id) on delete cascade,
  day        date not null,
  changed_at timestamptz not null default now(),
  primary key (court_id, day)
);

alter table public.court_availability_pings enable row level security;
drop policy if exists cap_read on public.court_availability_pings;
create policy cap_read on public.court_availability_pings for select using (true);
-- writes only via the trigger below (SECURITY DEFINER) — no client policy.

do $$
begin
  alter publication supabase_realtime add table public.court_availability_pings;
exception when duplicate_object then null;
end$$;

create or replace function public.touch_court_availability()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  r := coalesce(new, old);
  insert into public.court_availability_pings (court_id, day, changed_at)
  values (r.court_id, (r.starts_at at time zone 'Asia/Kathmandu')::date, now())
  on conflict (court_id, day) do update set changed_at = now();
  return null;
end;
$$;

drop trigger if exists court_bookings_ping on public.court_bookings;
create trigger court_bookings_ping
  after insert or update or delete on public.court_bookings
  for each row execute function public.touch_court_availability();

drop trigger if exists court_blocks_ping on public.court_blocks;
create trigger court_blocks_ping
  after insert or update or delete on public.court_blocks
  for each row execute function public.touch_court_availability();

-- ── DONE ─────────────────────────────────────────────────────────
-- If `alter publication` errors with "already member", that's fine —
-- the table is already published. Re-running is otherwise idempotent.
