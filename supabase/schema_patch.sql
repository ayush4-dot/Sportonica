-- ================================================================
-- Khelumna Schema Patch — safe to run multiple times
-- ================================================================

-- ── 1. Create tables first (no-op if already exist) ──────────────

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

create table if not exists public.court_slots (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  court_number   text not null default 'Court 1',
  sport          text not null,
  start_time     timestamptz not null,
  end_time       timestamptz not null,
  price          numeric(10,2) default 0,
  status         text default 'open' check (status in ('open','booked','blocked')),
  recurring      boolean default false,
  recurring_days int[] default '{}',
  created_at     timestamptz default now()
);

create table if not exists public.flash_matches (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  slot_id      uuid references public.court_slots(id),
  sport        text not null,
  court        text not null,
  match_time   timestamptz not null,
  urgency_min  int not null default 45,
  slots_needed int not null default 4,
  slots_filled int not null default 0,
  status       text default 'active' check (status in ('active','expired','cancelled')),
  created_at   timestamptz default now()
);

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  amount       numeric(10,2) not null default 0,
  method       text default 'khalti' check (method in ('khalti','esewa')),
  account      text,
  status       text default 'pending' check (status in ('pending','processing','settled','failed')),
  period_start date,
  period_end   date,
  created_at   timestamptz default now()
);

-- ── 2. Now drop existing policies (tables exist so this is safe) ──

drop policy if exists "Owner can read own venue"            on public.venues;
drop policy if exists "Owner can insert own venue"          on public.venues;
drop policy if exists "Owner can update own venue"          on public.venues;
drop policy if exists "Owner can manage own slots"          on public.court_slots;
drop policy if exists "Anyone can read open slots"          on public.court_slots;
drop policy if exists "Owner can manage own flash matches"  on public.flash_matches;
drop policy if exists "Anyone can read active flash matches" on public.flash_matches;
drop policy if exists "Owner can manage own payouts"        on public.payouts;

-- ── 3. Enable RLS ─────────────────────────────────────────────────

alter table public.venues        enable row level security;
alter table public.court_slots   enable row level security;
alter table public.flash_matches enable row level security;
alter table public.payouts       enable row level security;

-- ── 4. Recreate policies ──────────────────────────────────────────

create policy "Owner can read own venue"
  on public.venues for select
  using (owner_id = auth.uid());

create policy "Owner can insert own venue"
  on public.venues for insert
  with check (owner_id = auth.uid());

create policy "Owner can update own venue"
  on public.venues for update
  using (owner_id = auth.uid());

create policy "Owner can manage own slots"
  on public.court_slots for all
  using (venue_id in (select id from public.venues where owner_id = auth.uid()));

create policy "Anyone can read open slots"
  on public.court_slots for select
  using (status = 'open');

create policy "Owner can manage own flash matches"
  on public.flash_matches for all
  using (venue_id in (select id from public.venues where owner_id = auth.uid()));

create policy "Anyone can read active flash matches"
  on public.flash_matches for select
  using (status = 'active');

create policy "Owner can manage own payouts"
  on public.payouts for all
  using (venue_id in (select id from public.venues where owner_id = auth.uid()));

-- ── 5. Add columns to existing tables ────────────────────────────

alter table public.bookings
  add column if not exists venue_id       uuid references public.venues(id),
  add column if not exists slot_id        uuid references public.court_slots(id),
  add column if not exists sport          text,
  add column if not exists court          text,
  add column if not exists amount         numeric(10,2) default 0,
  add column if not exists payment_status text default 'unpaid'
    check (payment_status in ('paid','unpaid','partial'));

alter table public.events
  add column if not exists venue_id uuid references public.venues(id);

-- ── 6. updated_at trigger ─────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venues_updated_at on public.venues;

create trigger venues_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();
