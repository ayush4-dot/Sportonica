-- ================================================================
-- Khelumna — Manual QR Payment Verification (eSewa / Khalti)
-- Run this whole file in the Supabase SQL Editor. Safe to re-run.
--
-- Design: Khelam Na publishes its own eSewa/Khalti merchant QR
-- (platform_methods, one row per method). A customer books first
-- (existing atomic book_court()/insert-into-bookings logic, unchanged
-- — this is what already prevents double-booking), then submits proof
-- of payment (transaction id + screenshot) against that booking. A
-- super-admin manually verifies. No money movement is ever trusted
-- from the browser: the expected amount is read server-side, inside a
-- security-definer function, from the booking row itself — a client
-- can never supply or influence it.
-- ================================================================

-- ── PAYMENT METHODS (platform-wide QR config, one row per method) ──
create table if not exists public.payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  method              text not null unique check (method in ('esewa','khalti')),
  enabled             boolean not null default false,
  merchant_name       text not null default 'Khelam Na',
  account_identifier  text,                 -- phone / merchant id shown to the customer
  qr_path             text,                 -- path in the 'payment-qr' bucket; null until uploaded
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

insert into public.payment_methods (method) values ('esewa'), ('khalti')
  on conflict (method) do nothing;

-- ── PAYMENTS (one row per submitted proof-of-payment) ────────────
-- Never FKs into payment_methods: the payment_method string + a frozen
-- merchant_account_snapshot are all that's stored, so replacing the
-- QR/account later can never corrupt a historical payment record.
create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  booking_type              text not null check (booking_type in ('court_booking','event_booking')),
  court_booking_id          uuid references public.court_bookings(id) on delete restrict,
  event_booking_id          uuid references public.bookings(id) on delete restrict,
  venue_id                  uuid references public.venues(id),   -- denormalized for admin filtering; nullable (legacy bookings can have a null venue)
  user_id                   uuid not null references auth.users(id),
  payment_method            text not null check (payment_method in ('esewa','khalti')),
  merchant_account_snapshot text,
  expected_amount           numeric(10,2) not null check (expected_amount >= 0),
  transaction_id             text not null check (length(trim(transaction_id)) > 0),
  screenshot_path            text not null check (length(trim(screenshot_path)) > 0),
  status                     text not null default 'PENDING_VERIFICATION'
                             check (status in ('PENDING_VERIFICATION','APPROVED','REJECTED','CANCELLED')),
  rejection_reason           text check (rejection_reason in
                             ('incorrect_amount','invalid_transaction_id','payment_not_found',
                              'duplicate_payment','screenshot_unclear','other')),
  rejection_note             text,
  submitted_at               timestamptz not null default now(),
  reviewed_at                timestamptz,
  reviewed_by                uuid references auth.users(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (
    (booking_type = 'court_booking' and court_booking_id is not null and event_booking_id is null) or
    (booking_type = 'event_booking' and event_booking_id is not null and court_booking_id is null)
  )
);

-- Only one live (pending) payment per booking at a time.
create unique index if not exists payments_one_pending_court on public.payments (court_booking_id)
  where status = 'PENDING_VERIFICATION' and court_booking_id is not null;
create unique index if not exists payments_one_pending_event on public.payments (event_booking_id)
  where status = 'PENDING_VERIFICATION' and event_booking_id is not null;

-- A transaction id can't be actively claimed twice, and stays locked
-- forever once approved (rejected/cancelled ones free it up for a
-- legitimate resubmission with the correct id).
create unique index if not exists payments_txn_active on public.payments
  (payment_method, lower(trim(transaction_id)))
  where status in ('PENDING_VERIFICATION','APPROVED');

create index if not exists idx_payments_status_submitted on public.payments (status, submitted_at desc);
create index if not exists idx_payments_venue on public.payments (venue_id);
create index if not exists idx_payments_user  on public.payments (user_id);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.set_updated_at();  -- defined in schema_full.sql, already live

-- ── AUDIT LOG ──────────────────────────────────────────────────
create table if not exists public.payment_audit_logs (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid not null references public.payments(id) on delete cascade,
  action           text not null check (action in ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  performed_by     uuid references auth.users(id),
  previous_status  text,
  new_status       text not null,
  reason           text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_payment_audit_logs_payment on public.payment_audit_logs(payment_id);

-- ── WIDEN EXISTING CHECK CONSTRAINTS ───────────────────────────────
-- These tables/columns were never created via a tracked CREATE TABLE in
-- this repo (schema drift noted throughout supabase/*.sql — only ALTERs
-- are committed), so the live constraint name may not match Postgres's
-- usual auto-generated "<table>_<column>_check" pattern. Rather than
-- assume a name, find and drop whatever CHECK constraint currently
-- governs each column, then add the widened one.
create or replace function pg_temp.drop_check_constraints(p_table text, p_column text)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where nsp.nspname = 'public' and rel.relname = p_table
      and con.contype = 'c' and att.attname = p_column
  loop
    execute format('alter table public.%I drop constraint %I', p_table, r.conname);
  end loop;
end;
$$;

-- court_bookings.payment_status: add pending_verification/rejected.
-- `state` itself is untouched — 'reserved' already excludes the slot
-- from availability (see court_availability()/book_court() in
-- admin_schema.sql), so the slot stays held through the whole review
-- window with zero change to booking-conflict logic.
select pg_temp.drop_check_constraints('court_bookings', 'payment_status');
alter table public.court_bookings add constraint court_bookings_payment_status_check
  check (payment_status in ('unpaid','paid','partial','refunded','pending_verification','rejected'));

-- bookings.payment_status (legacy hosted-game join table): same two
-- values. `status` is deliberately untouched — it stays 'confirmed' at
-- insert as today, since events_with_counts/my-games/profile all key
-- slot-counting and visibility off it; payment state lives purely in
-- payment_status.
select pg_temp.drop_check_constraints('bookings', 'payment_status');
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('unpaid','paid','partial','pending_verification','rejected'));

-- notifications.kind: add payment-related kinds
select pg_temp.drop_check_constraints('notifications', 'kind');
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected'));

drop function pg_temp.drop_check_constraints(text, text);

-- ── is_super_admin(): defensive bootstrap only ────────────────────
-- Already called throughout /platform (src/lib/platform/actions.ts,
-- src/lib/events/actions.ts) so it must already exist live — created
-- directly in the Studio, never committed. Only create it if truly
-- missing, so we never silently overwrite an unknown live definition.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_super_admin'
  ) then
    create function public.is_super_admin()
    returns boolean language sql stable security definer set search_path = public as $f$
      select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
    $f$;
  end if;
end $$;

-- ================================================================
-- submit_payment: the ONLY way a payments row is ever created.
-- The expected amount is read from the booking row itself — never a
-- parameter — so a client can never influence it, regardless of
-- whether it goes through the app's UI or a hand-crafted RPC call.
-- ================================================================
create or replace function public.submit_payment(
  p_booking_type   text,
  p_booking_id     uuid,
  p_payment_method text,
  p_transaction_id text,
  p_screenshot_path text
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_amount   numeric(10,2);
  v_venue    uuid;
  v_owner    uuid;
  v_enabled  boolean;
  v_account  text;
  v_row      public.payments;
begin
  if p_transaction_id is null or length(trim(p_transaction_id)) = 0 then
    raise exception 'TRANSACTION_ID_REQUIRED';
  end if;
  if p_screenshot_path is null or length(trim(p_screenshot_path)) = 0 then
    raise exception 'SCREENSHOT_REQUIRED';
  end if;

  if p_booking_type = 'court_booking' then
    select price, venue_id, user_id into v_amount, v_venue, v_owner
      from public.court_bookings where id = p_booking_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_owner is null or v_owner <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
    if exists (
      select 1 from public.court_bookings
      where id = p_booking_id and state in ('cancelled','dropped','no_show','refunded')
    ) then
      raise exception 'BOOKING_CANCELLED';
    end if;
    if exists (select 1 from public.court_bookings where id = p_booking_id and payment_status = 'paid') then
      raise exception 'BOOKING_ALREADY_PAID';
    end if;
    if exists (
      select 1 from public.payments
      where court_booking_id = p_booking_id and status = 'PENDING_VERIFICATION'
    ) then
      raise exception 'PAYMENT_ALREADY_PENDING';
    end if;

  elsif p_booking_type = 'event_booking' then
    select amount, venue_id, user_id into v_amount, v_venue, v_owner
      from public.bookings where id = p_booking_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_owner is null or v_owner <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
    if exists (
      select 1 from public.bookings b
      join public.events e on e.id = b.event_id
      where b.id = p_booking_id and e.status = 'cancelled'
    ) then
      raise exception 'BOOKING_CANCELLED';
    end if;
    if exists (select 1 from public.bookings where id = p_booking_id and payment_status = 'paid') then
      raise exception 'BOOKING_ALREADY_PAID';
    end if;
    if exists (
      select 1 from public.payments
      where event_booking_id = p_booking_id and status = 'PENDING_VERIFICATION'
    ) then
      raise exception 'PAYMENT_ALREADY_PENDING';
    end if;

  else
    raise exception 'INVALID_BOOKING_TYPE';
  end if;

  select enabled, account_identifier into v_enabled, v_account
    from public.payment_methods where method = p_payment_method;
  if v_enabled is not true then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;

  if exists (
    select 1 from public.payments
    where payment_method = p_payment_method
      and lower(trim(transaction_id)) = lower(trim(p_transaction_id))
      and status in ('PENDING_VERIFICATION','APPROVED')
  ) then
    raise exception 'DUPLICATE_TRANSACTION_ID';
  end if;

  insert into public.payments (
    booking_type, court_booking_id, event_booking_id, venue_id, user_id,
    payment_method, merchant_account_snapshot, expected_amount, transaction_id, screenshot_path
  ) values (
    p_booking_type,
    case when p_booking_type = 'court_booking' then p_booking_id end,
    case when p_booking_type = 'event_booking' then p_booking_id end,
    v_venue, auth.uid(), p_payment_method, v_account, v_amount, trim(p_transaction_id), p_screenshot_path
  ) returning * into v_row;

  if p_booking_type = 'court_booking' then
    update public.court_bookings set payment_status = 'pending_verification' where id = p_booking_id;
  else
    update public.bookings set payment_status = 'pending_verification' where id = p_booking_id;
  end if;

  insert into public.payment_audit_logs (payment_id, action, performed_by, previous_status, new_status)
  values (v_row.id, 'SUBMITTED', auth.uid(), null, 'PENDING_VERIFICATION');

  return v_row;
end;
$$;
grant execute on function public.submit_payment(text,uuid,text,text,text) to authenticated;

-- ================================================================
-- confirm_free_booking: zero-amount bookings (e.g. a free hosted
-- game) skip the whole QR/verification loop, but the "it's free" claim
-- is still re-verified server-side, never trusted from the client.
-- ================================================================
create or replace function public.confirm_free_booking(
  p_booking_type text,
  p_booking_id   uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare v_amount numeric(10,2); v_owner uuid;
begin
  if p_booking_type = 'court_booking' then
    select price, user_id into v_amount, v_owner from public.court_bookings where id = p_booking_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_owner is null or v_owner <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
    if coalesce(v_amount, 0) <> 0 then raise exception 'BOOKING_NOT_FREE'; end if;
    update public.court_bookings set payment_status = 'paid', state = 'confirmed' where id = p_booking_id;
  elsif p_booking_type = 'event_booking' then
    select amount, user_id into v_amount, v_owner from public.bookings where id = p_booking_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_owner is null or v_owner <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
    if coalesce(v_amount, 0) <> 0 then raise exception 'BOOKING_NOT_FREE'; end if;
    update public.bookings set payment_status = 'paid' where id = p_booking_id;
  else
    raise exception 'INVALID_BOOKING_TYPE';
  end if;
end;
$$;
grant execute on function public.confirm_free_booking(text,uuid) to authenticated;

-- ================================================================
-- review_payment: the ONLY way a payment is approved/rejected.
-- Locks the row and requires status = PENDING_VERIFICATION, so two
-- admins double-clicking Approve, or an Approve firing after a
-- Reject, both fail cleanly instead of corrupting state.
-- ================================================================
create or replace function public.review_payment(
  p_payment_id uuid,
  p_action     text,       -- 'APPROVE' | 'REJECT'
  p_reason     text default null,
  p_note       text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_row       public.payments;
  v_new_status text;
  v_audit_action text;
  v_court_state text;
  v_event_status text;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_row from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_row.status <> 'PENDING_VERIFICATION' then raise exception 'ALREADY_REVIEWED'; end if;

  if p_action = 'APPROVE' then
    -- The booking may have been cancelled by staff/host while this payment
    -- sat pending — never let an approval blindly resurrect it back to
    -- confirmed. Lock the booking row too so a concurrent cancel can't
    -- race past this check.
    if v_row.booking_type = 'court_booking' then
      select state into v_court_state from public.court_bookings where id = v_row.court_booking_id for update;
      if v_court_state is null then raise exception 'BOOKING_NOT_FOUND'; end if;
      if v_court_state in ('cancelled','dropped','no_show','refunded') then
        raise exception 'BOOKING_NO_LONGER_VALID';
      end if;
    else
      select e.status into v_event_status
        from public.bookings b join public.events e on e.id = b.event_id
        where b.id = v_row.event_booking_id for update of e;
      if v_event_status is null then raise exception 'BOOKING_NOT_FOUND'; end if;
      if v_event_status = 'cancelled' then
        raise exception 'BOOKING_NO_LONGER_VALID';
      end if;
    end if;

    v_new_status := 'APPROVED';
    v_audit_action := 'APPROVED';
    update public.payments set status = 'APPROVED', reviewed_at = now(), reviewed_by = auth.uid()
      where id = p_payment_id returning * into v_row;
    if v_row.booking_type = 'court_booking' then
      update public.court_bookings set payment_status = 'paid', state = 'confirmed' where id = v_row.court_booking_id;
    else
      update public.bookings set payment_status = 'paid' where id = v_row.event_booking_id;
    end if;

  elsif p_action = 'REJECT' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'REJECTION_REASON_REQUIRED';
    end if;
    v_new_status := 'REJECTED';
    v_audit_action := 'REJECTED';
    update public.payments set status = 'REJECTED', rejection_reason = p_reason, rejection_note = p_note,
      reviewed_at = now(), reviewed_by = auth.uid() where id = p_payment_id returning * into v_row;
    if v_row.booking_type = 'court_booking' then
      update public.court_bookings set payment_status = 'rejected' where id = v_row.court_booking_id;
    else
      update public.bookings set payment_status = 'rejected' where id = v_row.event_booking_id;
    end if;

  else
    raise exception 'INVALID_ACTION';
  end if;

  insert into public.payment_audit_logs (payment_id, action, performed_by, previous_status, new_status, reason)
  values (p_payment_id, v_audit_action, auth.uid(), 'PENDING_VERIFICATION', v_new_status,
          case when p_action = 'REJECT' then coalesce(p_reason,'') || coalesce(': ' || nullif(p_note,''), '') else null end);

  return v_row;
end;
$$;
grant execute on function public.review_payment(uuid,text,text,text) to authenticated;

-- ================================================================
-- ROW LEVEL SECURITY
-- Deliberately minimal: all writes go through the security-definer
-- functions above, not direct table access. A customer's own client
-- can SELECT their own rows and nothing else — there is no RLS path
-- through which a browser can write expected_amount, status,
-- reviewed_by, or someone else's user_id.
-- ================================================================
alter table public.payment_methods    enable row level security;
alter table public.payments           enable row level security;
alter table public.payment_audit_logs enable row level security;

drop policy if exists pm_read  on public.payment_methods;
drop policy if exists pm_admin on public.payment_methods;
create policy pm_read  on public.payment_methods for select using (true);   -- checkout needs to read QR/account info
create policy pm_admin on public.payment_methods for all
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists pay_owner_read on public.payments;
drop policy if exists pay_admin_all  on public.payments;
create policy pay_owner_read on public.payments for select using (user_id = auth.uid());
create policy pay_admin_all  on public.payments for all
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists pal_admin_read on public.payment_audit_logs;
create policy pal_admin_read on public.payment_audit_logs for select using (public.is_super_admin());

-- ── auto-stamp updated_by/updated_at on payment_methods writes ────
create or replace function public.payment_methods_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists payment_methods_touch_trg on public.payment_methods;
create trigger payment_methods_touch_trg before update on public.payment_methods
  for each row execute function public.payment_methods_touch();

-- ================================================================
-- STORAGE: QR images (public, admin-write-only) + proof screenshots
-- (private, owner + admin read only, no update/delete — immutable
-- evidence).
-- ================================================================
insert into storage.buckets (id, name, public)
  values ('payment-qr', 'payment-qr', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('payment-proofs', 'payment-proofs', false)
  on conflict (id) do nothing;

drop policy if exists qr_read        on storage.objects;
drop policy if exists qr_admin_write on storage.objects;
create policy qr_read on storage.objects for select
  using (bucket_id = 'payment-qr');
create policy qr_admin_write on storage.objects for all
  using (bucket_id = 'payment-qr' and public.is_super_admin())
  with check (bucket_id = 'payment-qr' and public.is_super_admin());

-- proofs path convention: '{user_id}/{booking_type}-{booking_id}-{timestamp}.{ext}'
drop policy if exists proof_owner_insert on storage.objects;
drop policy if exists proof_read         on storage.objects;
create policy proof_owner_insert on storage.objects for insert
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proof_read on storage.objects for select
  using (
    bucket_id = 'payment-proofs' and
    ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin())
  );
-- No update/delete policy for anyone on payment-proofs: screenshots are
-- immutable evidence once uploaded (spec: never overwrite historical
-- payment evidence).

-- ── REALTIME: admin Payment Verification Center updates live ─────
do $$
begin
  execute 'alter publication supabase_realtime add table public.payments';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── DONE ─────────────────────────────────────────────────────────
