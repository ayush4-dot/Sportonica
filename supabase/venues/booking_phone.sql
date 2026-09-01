-- ================================================================
-- Adds a customer phone number to bookings, and extends book_court()
-- to accept it. Run once in the Supabase SQL editor — safe to re-run.
-- ================================================================

alter table public.court_bookings add column if not exists phone text;
alter table public.bookings add column if not exists phone text;

-- Same signature as before (see payments.sql), with one new trailing
-- default param — existing callers that don't pass p_phone still work.
create or replace function public.book_court(
  p_court_id   uuid,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_user_id    uuid default null,
  p_customer   text default null,
  p_source     text default 'platform',
  p_host_spots_needed int default null,
  p_host_skill_level text default null,
  p_host_bring_gear boolean default null,
  p_host_notes text default null,
  p_phone text default null
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
     state, payment_status, host_spots_needed, host_skill_level, host_bring_gear, host_notes, phone)
  values
    (p_court_id, v_venue, p_user_id, p_customer, p_starts_at, p_ends_at, v_price, p_source,
     case when p_source = 'platform' then 'reserved' else 'confirmed' end,
     'unpaid', p_host_spots_needed, p_host_skill_level, p_host_bring_gear, p_host_notes, p_phone)
  returning * into v_row;

  return v_row;
end;
$$;
