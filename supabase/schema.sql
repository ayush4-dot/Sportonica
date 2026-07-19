-- ================================================================
-- Khelumna Admin Schema
-- Run this entire file in Supabase SQL Editor
-- ================================================================

-- ── VENUES ──────────────────────────────────────────────────────
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  venue_type    text default 'Futsal court',
  address       text,
  lat           float,
  lng           float,
  phone         text,
  description   text,
  status        text default 'open' check (status in ('open','closed','maintenance')),
  sports        text[] default '{}',
  amenities     text[] default '{}',
  hours         jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.venues enable row level security;

create policy "Owner can read own venue"
  on public.venues for select
  using (owner_id = auth.uid());

create policy "Owner can insert own venue"
  on public.venues for insert
  with check (owner_id = auth.uid());

create policy "Owner can update own venue"
  on public.venues for update
  using (owner_id = auth.uid());

-- ── COURT SLOTS ─────────────────────────────────────────────────
create table if not exists public.court_slots (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  court_number  text not null default 'Court 1',
  sport         text not null,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  price         numeric(10,2) default 0,
  status        text default 'open' check (status in ('open','booked','blocked')),
  recurring     boolean default false,
  recurring_days int[] default '{}',
  created_at    timestamptz default now()
);

alter table public.court_slots enable row level security;

create policy "Owner can manage own slots"
  on public.court_slots for all
  using (
    venue_id in (
      select id from public.venues where owner_id = auth.uid()
    )
  );

create policy "Anyone can read open slots"
  on public.court_slots for select
  using (status = 'open');

-- ── FLASH MATCHES ────────────────────────────────────────────────
create table if not exists public.flash_matches (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  slot_id       uuid references public.court_slots(id),
  sport         text not null,
  court         text not null,
  match_time    timestamptz not null,
  urgency_min   int not null default 45,
  slots_needed  int not null default 4,
  slots_filled  int not null default 0,
  status        text default 'active' check (status in ('active','expired','cancelled')),
  created_at    timestamptz default now()
);

alter table public.flash_matches enable row level security;

create policy "Owner can manage own flash matches"
  on public.flash_matches for all
  using (
    venue_id in (
      select id from public.venues where owner_id = auth.uid()
    )
  );

create policy "Anyone can read active flash matches"
  on public.flash_matches for select
  using (status = 'active');

-- ── PAYOUTS ──────────────────────────────────────────────────────
create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  amount        numeric(10,2) not null,
  method        text default 'khalti' check (method in ('khalti','esewa')),
  account       text,
  status        text default 'pending' check (status in ('pending','processing','settled','failed')),
  period_start  date,
  period_end    date,
  created_at    timestamptz default now()
);

alter table public.payouts enable row level security;

create policy "Owner can manage own payouts"
  on public.payouts for all
  using (
    venue_id in (
      select id from public.venues where owner_id = auth.uid()
    )
  );

-- ── EXTEND EXISTING BOOKINGS TABLE ───────────────────────────────
-- Add venue_id + slot_id to existing bookings if not already there
alter table public.bookings
  add column if not exists venue_id   uuid references public.venues(id),
  add column if not exists slot_id    uuid references public.court_slots(id),
  add column if not exists sport      text,
  add column if not exists court      text,
  add column if not exists amount     numeric(10,2) default 0,
  add column if not exists payment_status text default 'unpaid'
    check (payment_status in ('paid','unpaid','partial'));

-- ── EXTEND EXISTING EVENTS TABLE ─────────────────────────────────
alter table public.events
  add column if not exists venue_id uuid references public.venues(id);

-- ── HELPER: updated_at trigger ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger venues_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

-- ── DONE ─────────────────────────────────────────────────────────
-- Tables created:
--   public.venues
--   public.court_slots
--   public.flash_matches
--   public.payouts
-- Columns added to existing:
--   public.bookings (venue_id, slot_id, sport, court, amount, payment_status)
--   public.events   (venue_id)
