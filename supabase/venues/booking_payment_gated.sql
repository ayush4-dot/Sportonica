-- ================================================================
-- Sportonica — a court slot is BOOKED only once its payment is approved.
-- No "hold" state: until payment is confirmed, the slot stays open.
-- Run once in the Supabase SQL editor, AFTER admin_schema.sql /
-- payments.sql / booking_phone.sql / book_court_dedupe.sql. Safe to
-- re-run. Supersedes the old book_court_staff_guard.sql + court_busy_slots.sql.
--
-- Model:
--   * book_court() still writes a row (state 'reserved', payment_status
--     'unpaid') so there's something to attach the payment to — but that
--     row does NOT reserve the slot. Two people can both be at the
--     payment screen for the same time.
--   * The slot only becomes BOOKED — red on the picker, and blocked
--     against new bookings — when payment_status = 'paid' (review_payment
--     approved it), or for a staff walk-in / phone booking (no payment
--     step). Whoever's payment is approved first wins the slot; a second
--     approval for the same slot is refused (SLOT_ALREADY_BOOKED).
--   * Unpaid / rejected / abandoned rows are swept to 'dropped' so they
--     don't clutter "My Games" as forever-pending.
-- ================================================================

-- How long an unpaid row lingers before it's swept to 'dropped'.
create or replace function public.court_hold_grace()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

-- 'booked' = the slot is taken. 'free' = it is not (incl. anything still
-- waiting on payment). No middle "held" state.
create or replace function public.court_booking_slot_state(
  p_state text, p_payment_status text, p_source text, p_created_at timestamptz
) returns text language sql immutable as $$
  select case
    when p_payment_status = 'paid' then 'booked'
    when p_state in ('confirmed','checked_in','played','paid') then 'booked'
    when p_source in ('walk_in','phone') and p_state = 'confirmed' then 'booked'
    else 'free'
  end
$$;

-- Housekeeping only (slot availability no longer depends on this): drop
-- unpaid / rejected rows once they're clearly abandoned.
create or replace function public.expire_stale_court_holds(p_court_id uuid default null)
returns void language sql security definer set search_path = public as $$
  update public.court_bookings
     set state = 'dropped', updated_at = now()
   where state = 'reserved'
     and ( payment_status = 'rejected'
        or (payment_status in ('unpaid') and created_at < now() - public.court_hold_grace()) )
     and (p_court_id is null or court_id = p_court_id);
$$;

-- A rejected payment drops its row right away.
create or replace function public.free_slot_on_payment_rejected()
returns trigger language plpgsql as $$
begin
  if new.payment_status = 'rejected'
     and old.payment_status is distinct from 'rejected'
     and new.state = 'reserved' then
    new.state := 'dropped';
  end if;
  return new;
end $$;
drop trigger if exists free_slot_on_payment_rejected_trg on public.court_bookings;
create trigger free_slot_on_payment_rejected_trg
  before update on public.court_bookings
  for each row execute function public.free_slot_on_payment_rejected();

-- The race guard: when a booking is about to become paid, refuse it if
-- another booking for the same court/time is already paid. This is what
-- makes "first approved payment wins" safe even though the reservations
-- didn't block each other.
create or replace function public.block_double_paid_booking()
returns trigger language plpgsql as $$
declare
  v_now_booked boolean := public.court_booking_slot_state(new.state, new.payment_status, new.source, new.created_at) = 'booked';
  v_was_booked boolean := tg_op = 'UPDATE'
    and public.court_booking_slot_state(old.state, old.payment_status, old.source, old.created_at) = 'booked';
begin
  if v_now_booked and not v_was_booked then
    if exists (
      select 1 from public.court_bookings b
      where b.court_id = new.court_id and b.id <> new.id
        and public.court_booking_slot_state(b.state, b.payment_status, b.source, b.created_at) = 'booked'
        and b.starts_at < new.ends_at and b.ends_at > new.starts_at
    ) then
      raise exception 'SLOT_ALREADY_BOOKED';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists block_double_paid_booking_trg on public.court_bookings;
create trigger block_double_paid_booking_trg
  before insert or update on public.court_bookings
  for each row execute function public.block_double_paid_booking();

-- ── book_court(): staff guard + past-time check. Conflict is only
--    against settled bookings + venue blocks — an unpaid reservation
--    does NOT hold the slot. ─────────────────────────────────────
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
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;
  if p_starts_at <= now() then
    raise exception 'SLOT_IN_PAST';
  end if;
  if v_phone is not null and length(v_phone) <> 10 then
    raise exception 'PHONE_INVALID';
  end if;

  select venue_id into v_venue from public.courts where id = p_court_id;
  if v_venue is null then
    raise exception 'Court not found';
  end if;

  if coalesce(p_source, 'platform') <> 'platform'
     and not public.has_venue_access(v_venue, 'staff') then
    raise exception 'NOT_VENUE_STAFF';
  end if;

  perform public.expire_stale_court_holds(p_court_id);
  perform 1 from public.courts where id = p_court_id for update;

  -- conflict only against slots that are actually BOOKED (paid / staff).
  if exists (
    select 1 from public.court_bookings b
    where b.court_id = p_court_id
      and b.starts_at < p_ends_at and b.ends_at > p_starts_at
      and public.court_booking_slot_state(b.state, b.payment_status, b.source, b.created_at) = 'booked'
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

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
    (p_court_id, v_venue,
     case when coalesce(p_source,'platform') = 'platform' then coalesce(p_user_id, auth.uid()) else p_user_id end,
     p_customer, p_starts_at, p_ends_at, v_price, p_source,
     case when p_source = 'platform' then 'reserved' else 'confirmed' end,
     'unpaid', p_host_spots_needed, p_host_skill_level, p_host_bring_gear, p_host_notes, v_phone)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.book_court(
  uuid, timestamptz, timestamptz, uuid, text, text, int, text, boolean, text, text
) from public;
grant execute on function public.book_court(
  uuid, timestamptz, timestamptz, uuid, text, text, int, text, boolean, text, text
) to authenticated;

-- ── court_busy_slots(): the ranges the booking screen greys out ──
-- Only genuinely BOOKED slots (payment approved / staff) + venue blocks.
-- SECURITY DEFINER so guests and other players see it (court_bookings
-- RLS otherwise hides everyone else's rows). No PII — times only.
create or replace function public.court_busy_slots(
  p_court_id uuid,
  p_day      date,
  p_tz       text default 'Asia/Kathmandu'
)
returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_stale_court_holds(p_court_id);
  return query
  with bounds as (
    select (p_day::text || ' 00:00')::timestamp at time zone p_tz as day_start,
           ((p_day + 1)::text || ' 00:00')::timestamp at time zone p_tz as day_end
  )
  select b.starts_at, b.ends_at, 'booked'::text
  from public.court_bookings b, bounds
  where b.court_id = p_court_id
    and b.starts_at < bounds.day_end and b.ends_at > bounds.day_start
    and public.court_booking_slot_state(b.state, b.payment_status, b.source, b.created_at) = 'booked'
  union all
  select k.starts_at, k.ends_at, 'blocked'::text
  from public.court_blocks k, bounds
  where k.court_id = p_court_id
    and k.starts_at < bounds.day_end and k.ends_at > bounds.day_start;
end;
$$;

revoke all on function public.court_busy_slots(uuid, date, text) from public;
grant execute on function public.court_busy_slots(uuid, date, text) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
-- Sanity check (fill in a real court_id):
--   select * from public.court_busy_slots('<court_id>'::uuid, current_date);
