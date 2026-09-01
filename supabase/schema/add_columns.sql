-- ================================================================
-- Add missing columns to events table
-- Safe to run multiple times
-- ================================================================

alter table public.events
  add column if not exists venue_lat   float,
  add column if not exists venue_lng   float,
  add column if not exists flash       boolean default false,
  add column if not exists sport_color text;

-- ================================================================
-- Create profiles table if it doesn't exist
-- ================================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  avatar_url    text,
  role          text default 'player' check (role in ('player','venue_owner','admin')),
  phone         text,
  trust_score   int default 80 check (trust_score between 0 and 100),
  games_played  int default 0,
  games_hosted  int default 0,
  cancellations int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert own profile"             on public.profiles;
drop policy if exists "Users can update own profile"             on public.profiles;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update using (id = auth.uid());

-- ================================================================
-- Auto-create profile on sign-up trigger
-- ================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================
-- events_with_counts view
-- ================================================================

create or replace view public.events_with_counts as
select
  e.*,
  coalesce(b.confirmed_count, 0) as confirmed_count,
  coalesce(b.total_count, 0)     as total_count,
  greatest(e.max_players - coalesce(b.confirmed_count, 0), 0) as slots_remaining
from public.events e
left join (
  select
    event_id,
    count(*) filter (where status = 'confirmed') as confirmed_count,
    count(*) as total_count
  from public.bookings
  group by event_id
) b on b.event_id = e.id;

grant select on public.events_with_counts to anon, authenticated;

-- ================================================================
-- RLS on events
-- ================================================================

alter table public.events enable row level security;

drop policy if exists "Anyone can read events"      on public.events;
drop policy if exists "Hosts can insert events"     on public.events;
drop policy if exists "Hosts can update own events" on public.events;
drop policy if exists "Hosts can delete own events" on public.events;

create policy "Anyone can read events"
  on public.events for select using (true);

create policy "Hosts can insert events"
  on public.events for insert with check (auth.uid() = host_id);

create policy "Hosts can update own events"
  on public.events for update using (auth.uid() = host_id);

create policy "Hosts can delete own events"
  on public.events for delete using (auth.uid() = host_id);

-- ================================================================
-- RLS on bookings
-- ================================================================

alter table public.bookings enable row level security;

drop policy if exists "Users can read own bookings"       on public.bookings;
drop policy if exists "Users can insert own bookings"     on public.bookings;
drop policy if exists "Users can update own bookings"     on public.bookings;
drop policy if exists "Venue owners can read bookings"    on public.bookings;
drop policy if exists "Venue owners can update bookings"  on public.bookings;

create policy "Users can read own bookings"
  on public.bookings for select using (auth.uid() = user_id);

create policy "Users can insert own bookings"
  on public.bookings for insert with check (auth.uid() = user_id);

create policy "Users can update own bookings"
  on public.bookings for update using (auth.uid() = user_id);

create policy "Venue owners can read bookings"
  on public.bookings for select
  using (
    venue_id in (select id from public.venues where owner_id = auth.uid())
  );

create policy "Venue owners can update bookings"
  on public.bookings for update
  using (
    venue_id in (select id from public.venues where owner_id = auth.uid())
  );

-- ================================================================
-- updated_at triggers
-- ================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
