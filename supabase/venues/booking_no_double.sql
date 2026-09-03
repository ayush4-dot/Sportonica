-- ================================================================
-- Sportonica — hard guarantee against two BOOKED bookings on one slot.
-- Run once in the Supabase SQL editor, AFTER booking_payment_gated.sql
-- (it needs court_booking_slot_state()). Safe to re-run.
--
-- Unpaid reservations deliberately do NOT block each other (see
-- booking_payment_gated.sql — the slot is only taken once a payment is
-- approved). This constraint is the backstop that makes "first approved
-- payment wins" airtight: no two settled bookings can ever overlap on
-- the same court. The block_double_paid_booking() trigger raises the
-- friendly SLOT_ALREADY_BOOKED first; this catches anything that slips
-- past it (direct writes, races).
--
-- The app maps SQLSTATE 23P01 (exclusion_violation) to a friendly
-- message — see src/lib/bookings/types.ts / src/lib/payments/types.ts.
-- ================================================================

create extension if not exists btree_gist;

alter table public.court_bookings
  drop constraint if exists court_bookings_no_overlap;

alter table public.court_bookings
  add constraint court_bookings_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    public.court_booking_slot_state(state, payment_status, source, created_at) = 'booked'
  );

-- ── DONE ─────────────────────────────────────────────────────────
