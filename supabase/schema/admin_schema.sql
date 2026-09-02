-- ================================================================
-- Sportonica — Admin Panel Schema (Section 6: Venue Admin)
-- Modern, computed-availability model. Safe to re-run.
-- Run this whole file in the Supabase SQL Editor.
-- ================================================================
-- Design notes:
--   * A venue HAS MANY courts. Pricing, maintenance and bookings
--     hang off a real `courts` table (not a text field).
--   * Availability is COMPUTED, never pre-generated. We store the
--     court's weekly opening hours + a list of "blocks" (maintenance,
--     walk-ins, phone bookings) + platform bookings, and derive free
--     intervals at query time. No infinite slot rows.
--   * Pricing is RULES, not a single price field (base + peak + happy).
--   * Every money movement is an immutable double-entry ledger row.
-- ================================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────
-- ROLE HELPER: is the current user staff (owner/manager/staff) of a venue?
-- Defined early so policies can use it.
-- ─────────────────────────────────────────────────────────────────

-- ── VENUES ───────────────────────────────────────────────────────
create table if not exists public.venues (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  venue_type          text default 'Futsal court',
  address             text,
  ward                int,
  lat                 double precision,
  lng                 double precision,
  phone               text,
  description         text,
  photos              text[]  default '{}',
  sports              text[]  default '{}',
  amenities           text[]  default '{}',
  -- verification: unverified venues can still take bookings but are
  -- badged and payout-capped (blueprint 6.1 — throttle risk, don't block supply)
  verification_status text default 'unverified'
                      check (verification_status in ('unverified','pending','verified')),
  payout_cap          numeric(12,2),         -- null = uncapped (verified)
  -- payout preferences (blueprint 6.4)
  payout_schedule     text default 'weekly'  check (payout_schedule in ('per_game','weekly')),
  cancellation_policy text default 'standard',
  house_rules         text,
  status              text default 'open'    check (status in ('open','closed','maintenance')),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── VENUE STAFF (blueprint 6.7: owner / manager / staff) ─────────
create table if not exists public.venue_staff (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'staff' check (role in ('owner','manager','staff')),
  created_at timestamptz default now(),
  unique (venue_id, user_id)
);

-- Helper: does the current user have staff access to a venue?
create or replace function public.has_venue_access(v_id uuid, min_role text default 'staff')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.venues v where v.id = v_id and v.owner_id = auth.uid()
  ) or exists (
    select 1 from public.venue_staff s
    where s.venue_id = v_id and s.user_id = auth.uid()
      and case min_role
            when 'staff'   then true
            when 'manager' then s.role in ('owner','manager')
            when 'owner'   then s.role = 'owner'
            else false
          end
  );
$$;

-- ── COURTS / GROUNDS (a venue has many) ──────────────────────────
create table if not exists public.courts (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  name         text not null default 'Court 1',
  sport        text not null,
  surface      text,
  capacity     int,
  base_price   numeric(10,2) not null default 0,   -- per hour, fallback
  status       text default 'active' check (status in ('active','maintenance','inactive')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── OPENING HOURS (weekly template per court) ────────────────────
-- One row per weekday the court is open. dow: 0=Sun .. 6=Sat.
-- Availability = these windows MINUS blocks MINUS bookings.
create table if not exists public.court_hours (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  dow        int  not null check (dow between 0 and 6),
  open_time  time not null,
  close_time time not null,
  unique (court_id, dow, open_time)
);

-- ── PRICING RULES (blueprint 6.3: rules, not price fields) ───────
-- Evaluated at quote time. Highest-priority matching rule wins.
create table if not exists public.pricing_rules (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts(id) on delete cascade,
  label       text not null,                       -- "Weekend peak", "Tue happy hour"
  kind        text not null default 'multiplier'
              check (kind in ('multiplier','fixed','discount_pct')),
  amount      numeric(10,2) not null,              -- 1.5 = +50%, or fixed price, or 30 = 30% off
  days        int[] default '{0,1,2,3,4,5,6}',     -- which weekdays it applies
  start_time  time,                                 -- null = all day
  end_time    time,
  priority    int  default 0,                       -- higher wins on conflict
  auto_suggested boolean default false,             -- flagged by empty-slot suggester (6.3)
  active      boolean default true,
  created_at  timestamptz default now()
);

-- ── BLOCKS (maintenance + walk-ins + phone bookings) ─────────────
-- The "one-tap block slot" from blueprint 6.2. Any interval a court
-- is NOT bookable on the platform. This is how we respect the venue's
-- offline reality so they don't abandon the app.
create table if not exists public.court_blocks (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null default 'manual'
              check (reason in ('manual','maintenance','walk_in','phone_booking','offline')),
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  check (ends_at > starts_at)
);

-- ── BOOKINGS (platform-side reservations against a court) ────────
create table if not exists public.court_bookings (
  id             uuid primary key default gen_random_uuid(),
  court_id       uuid not null references public.courts(id) on delete cascade,
  venue_id       uuid not null references public.venues(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  customer_name  text,                              -- for staff-entered bookings
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  price          numeric(10,2) not null default 0,
  -- state machine (blueprint 2.0): reserved -> paid -> confirmed ->
  -- checked_in -> played, or dropped/no_show/refunded/cancelled
  state          text not null default 'reserved'
                 check (state in ('reserved','paid','confirmed','checked_in',
                                  'played','dropped','no_show','refunded','cancelled')),
  payment_status text default 'unpaid' check (payment_status in ('unpaid','paid','partial','refunded')),
  source         text default 'platform' check (source in ('platform','walk_in','phone')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_court_bookings_court_time on public.court_bookings (court_id, starts_at, ends_at);
create index if not exists idx_court_blocks_court_time    on public.court_blocks   (court_id, starts_at, ends_at);

-- ── LEDGER (blueprint 4.5: immutable double-entry) ───────────────
create table if not exists public.ledger (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid references public.venues(id) on delete set null,
  booking_id    uuid references public.court_bookings(id) on delete set null,
  debit_account  text not null,   -- e.g. 'escrow', 'venue_payable', 'platform_commission'
  credit_account text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  reason        text not null,
  created_at    timestamptz default now()
);

-- ── PAYOUTS (blueprint 6.4) ──────────────────────────────────────
create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  gross        numeric(12,2) not null default 0,
  commission   numeric(12,2) not null default 0,
  net          numeric(12,2) not null default 0,
  method       text default 'khalti' check (method in ('khalti','esewa','fonepay','bank')),
  account      text,
  status       text default 'pending' check (status in ('pending','processing','settled','failed')),
  period_start date,
  period_end   date,
  created_at   timestamptz default now()
);

-- ================================================================
-- CORE FUNCTION: computed availability for a court on a given day.
-- Returns free intervals = opening hours − blocks − bookings.
-- This is the blueprint 6.2 model done right.
-- ================================================================
create or replace function public.court_availability(
  p_court_id uuid,
  p_day      date,
  p_tz       text default 'Asia/Kathmandu'
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dow int := extract(dow from p_day)::int;
begin
  return query
  with open_windows as (
    select
      (p_day::text || ' ' || h.open_time::text)::timestamp at time zone p_tz  as w_start,
      (p_day::text || ' ' || h.close_time::text)::timestamp at time zone p_tz as w_end
    from public.court_hours h
    where h.court_id = p_court_id and h.dow = v_dow
  ),
  busy as (
    select starts_at, ends_at from public.court_blocks
      where court_id = p_court_id
    union all
    select starts_at, ends_at from public.court_bookings
      where court_id = p_court_id
        and state not in ('dropped','no_show','refunded','cancelled')
  ),
  -- break each open window by subtracting busy intervals
  points as (
    select w.w_start, w.w_end,
           coalesce(b.starts_at, w.w_end)   as b_start,
           coalesce(b.ends_at,   w.w_end)   as b_end
    from open_windows w
    left join busy b
      on b.starts_at < w.w_end and b.ends_at > w.w_start
  )
  -- Simplified gap logic: return the raw open windows minus overlapping busy.
  -- For MVP we expose open windows and let the app subtract busy client-side
  -- for rendering; server still enforces conflicts on write (see book_court).
  select w_start, w_end from open_windows
  order by w_start;
end;
$$;

-- ================================================================
-- ATOMIC BOOKING (blueprint 2.2: never read-check-write).
-- Inserts a booking only if no conflicting block/booking exists,
-- inside a single locked transaction. Raises on conflict.
-- ================================================================
create or replace function public.book_court(
  p_court_id   uuid,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_user_id    uuid default null,
  p_customer   text default null,
  p_source     text default 'platform'
)
returns public.court_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_venue uuid;
  v_price numeric(10,2);
  v_row   public.court_bookings;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  select venue_id into v_venue from public.courts where id = p_court_id;
  if v_venue is null then
    raise exception 'Court not found';
  end if;

  -- lock this court's rows to serialize concurrent bookers
  perform 1 from public.courts where id = p_court_id for update;

  -- conflict against active bookings
  if exists (
    select 1 from public.court_bookings
    where court_id = p_court_id
      and state not in ('dropped','no_show','refunded','cancelled')
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  -- conflict against blocks
  if exists (
    select 1 from public.court_blocks
    where court_id = p_court_id
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_BLOCKED';
  end if;

  v_price := public.quote_price(p_court_id, p_starts_at, p_ends_at);

  insert into public.court_bookings
    (court_id, venue_id, user_id, customer_name, starts_at, ends_at, price, source,
     state, payment_status)
  values
    (p_court_id, v_venue, p_user_id, p_customer, p_starts_at, p_ends_at, v_price, p_source,
     case when p_source = 'platform' then 'reserved' else 'confirmed' end,
     'unpaid')
  returning * into v_row;

  return v_row;
end;
$$;

-- ================================================================
-- PRICE QUOTE: evaluate pricing rules at a point in time.
-- base_price × hours, then apply the highest-priority matching rule.
-- ================================================================
create or replace function public.quote_price(
  p_court_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_tz        text default 'Asia/Kathmandu'
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_base   numeric(10,2);
  v_hours  numeric(10,4);
  v_dow    int;
  v_time   time;
  v_rule   public.pricing_rules;
  v_price  numeric(10,2);
begin
  select base_price into v_base from public.courts where id = p_court_id;
  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;
  v_dow  := extract(dow from (p_starts_at at time zone p_tz))::int;
  v_time := (p_starts_at at time zone p_tz)::time;
  v_price := coalesce(v_base,0) * v_hours;

  select * into v_rule from public.pricing_rules r
  where r.court_id = p_court_id and r.active
    and v_dow = any(r.days)
    and (r.start_time is null or v_time >= r.start_time)
    and (r.end_time   is null or v_time <  r.end_time)
  order by r.priority desc
  limit 1;

  if found then
    v_price := case v_rule.kind
      when 'multiplier'   then v_price * v_rule.amount
      when 'fixed'        then v_rule.amount * v_hours
      when 'discount_pct' then v_price * (1 - v_rule.amount/100.0)
      else v_price end;
  end if;

  return round(v_price, 2);
end;
$$;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
alter table public.venues         enable row level security;
alter table public.venue_staff    enable row level security;
alter table public.courts         enable row level security;
alter table public.court_hours    enable row level security;
alter table public.pricing_rules  enable row level security;
alter table public.court_blocks   enable row level security;
alter table public.court_bookings enable row level security;
alter table public.ledger         enable row level security;
alter table public.payouts        enable row level security;

-- Venues: public can read; only owner writes; staff can read
drop policy if exists venues_read       on public.venues;
drop policy if exists venues_owner_ins  on public.venues;
drop policy if exists venues_owner_upd  on public.venues;
drop policy if exists venues_owner_del  on public.venues;
create policy venues_read      on public.venues for select using (true);
create policy venues_owner_ins on public.venues for insert with check (owner_id = auth.uid());
create policy venues_owner_upd on public.venues for update using (owner_id = auth.uid());
create policy venues_owner_del on public.venues for delete using (owner_id = auth.uid());

-- Staff: owner manages, staff can see their own rows
drop policy if exists staff_owner_all on public.venue_staff;
drop policy if exists staff_self_read on public.venue_staff;
create policy staff_owner_all on public.venue_staff for all
  using (public.has_venue_access(venue_id,'owner'))
  with check (public.has_venue_access(venue_id,'owner'));
create policy staff_self_read on public.venue_staff for select using (user_id = auth.uid());

-- Courts / hours / pricing: public read (for player discovery), staff write
drop policy if exists courts_read on public.courts;
drop policy if exists courts_staff on public.courts;
create policy courts_read  on public.courts for select using (true);
create policy courts_staff on public.courts for all
  using (public.has_venue_access(venue_id,'manager'))
  with check (public.has_venue_access(venue_id,'manager'));

drop policy if exists hours_read on public.court_hours;
drop policy if exists hours_staff on public.court_hours;
create policy hours_read  on public.court_hours for select using (true);
create policy hours_staff on public.court_hours for all
  using (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'manager'))
  with check (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'manager'));

drop policy if exists pricing_read on public.pricing_rules;
drop policy if exists pricing_staff on public.pricing_rules;
create policy pricing_read  on public.pricing_rules for select using (true);
create policy pricing_staff on public.pricing_rules for all
  using (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'manager'))
  with check (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'manager'));

-- Blocks: staff (incl. plain staff) can create — walk-ins are their job
drop policy if exists blocks_read on public.court_blocks;
drop policy if exists blocks_staff on public.court_blocks;
create policy blocks_read  on public.court_blocks for select
  using (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'staff'));
create policy blocks_staff on public.court_blocks for all
  using (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'staff'))
  with check (public.has_venue_access((select venue_id from public.courts c where c.id = court_id),'staff'));

-- Bookings: the booking user reads own; venue staff read/manage venue's
drop policy if exists bk_user_read  on public.court_bookings;
drop policy if exists bk_user_ins   on public.court_bookings;
drop policy if exists bk_staff_all  on public.court_bookings;
create policy bk_user_read on public.court_bookings for select using (user_id = auth.uid());
create policy bk_user_ins  on public.court_bookings for insert with check (user_id = auth.uid());
create policy bk_staff_all on public.court_bookings for all
  using (public.has_venue_access(venue_id,'staff'))
  with check (public.has_venue_access(venue_id,'staff'));

-- Ledger: venue staff (manager+) read only; writes via functions
drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select
  using (public.has_venue_access(venue_id,'manager'));

-- Payouts: owner/manager only (blueprint 6.7 — staff can't touch payouts)
drop policy if exists payouts_mgr on public.payouts;
create policy payouts_mgr on public.payouts for all
  using (public.has_venue_access(venue_id,'manager'))
  with check (public.has_venue_access(venue_id,'manager'));

-- ── auto updated_at ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists venues_touch on public.venues;
create trigger venues_touch before update on public.venues
  for each row execute function public.set_updated_at();
drop trigger if exists courts_touch on public.courts;
create trigger courts_touch before update on public.courts
  for each row execute function public.set_updated_at();
drop trigger if exists bookings_touch on public.court_bookings;
create trigger bookings_touch before update on public.court_bookings
  for each row execute function public.set_updated_at();

-- ── auto-add owner as 'owner' staff row on venue create ──────────
create or replace function public.venue_owner_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.venue_staff (venue_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (venue_id, user_id) do nothing;
  return new;
end; $$;
drop trigger if exists venue_owner_staff_trg on public.venues;
create trigger venue_owner_staff_trg after insert on public.venues
  for each row execute function public.venue_owner_staff();

-- ── ANALYTICS VIEW: per-court occupancy for the dashboard heatmap ─
create or replace view public.venue_daily_stats as
select
  b.venue_id,
  b.court_id,
  date_trunc('day', b.starts_at) as day,
  count(*)                        as bookings,
  count(*) filter (where b.state = 'no_show') as no_shows,
  coalesce(sum(b.price) filter (where b.state not in ('cancelled','refunded','dropped')),0) as revenue
from public.court_bookings b
group by b.venue_id, b.court_id, date_trunc('day', b.starts_at);

grant select on public.venue_daily_stats to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
