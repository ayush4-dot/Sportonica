-- ================================================================
-- BOOKING SELF-SERVICE — let a customer fix mistakes on a booking
-- they already made (wrong name, wrong phone, wrong slot), and cancel
-- a booking made by mistake — without going through support.
--
-- Mirrors the payments model: all writes go through security-definer
-- RPCs that do their own authorization (owner vs. venue staff vs.
-- super_admin) and log every change to booking_audit_logs. There is no
-- direct UPDATE/DELETE RLS policy for customers on these tables.
--
-- Rules:
--   * Contact fields (name / phone / position) — editable any time,
--     by the booker or by venue staff / the game host.
--   * Date / time / court — the booker may only change it while the
--     booking is still unpaid or payment-rejected and hasn't started;
--     venue staff may change it any time.
--   * Cancel — the booker only while unpaid/rejected and not started;
--     staff / host / super_admin any time.
--
-- Run AFTER schema/admin_schema.sql, venues/booking_phone.sql and
-- payments/payments.sql. Idempotent — safe to re-run.
-- ================================================================

-- ── AUDIT LOG ────────────────────────────────────────────────────
create table if not exists public.booking_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  booking_kind  text not null check (booking_kind in ('court','event_join')),
  booking_id    uuid not null,
  action        text not null check (action in ('EDITED','CANCELLED')),
  performed_by  uuid references auth.users(id),
  changes       jsonb,                       -- { field: [old, new], ... }
  created_at    timestamptz not null default now()
);
create index if not exists idx_booking_audit_logs_booking on public.booking_audit_logs(booking_id);

alter table public.booking_audit_logs enable row level security;

-- No INSERT/UPDATE/DELETE policy: rows are written only by the
-- security-definer functions below (which bypass RLS). Readable by a
-- super_admin, or by the person whose booking it is.
drop policy if exists bal_read on public.booking_audit_logs;
create policy bal_read on public.booking_audit_logs for select using (
  public.is_super_admin()
  or (booking_kind = 'court'      and exists (
        select 1 from public.court_bookings b where b.id = booking_id and b.user_id = auth.uid()))
  or (booking_kind = 'event_join' and exists (
        select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()))
);

-- ── EDIT A COURT BOOKING ─────────────────────────────────────────
-- Null argument = "leave this field unchanged". Empty string for a
-- contact field = "clear it".
create or replace function public.edit_court_booking(
  p_id            uuid,
  p_customer_name text        default null,
  p_phone         text        default null,
  p_court_id      uuid        default null,
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null
)
returns public.court_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_row      public.court_bookings;
  v_is_staff boolean;
  v_is_owner boolean;
  v_new_court uuid;
  v_new_start timestamptz;
  v_new_end   timestamptz;
  v_time_change boolean;
  v_new_name  text;
  v_new_phone text;
  v_new_price numeric(10,2);
  v_changes   jsonb := '{}'::jsonb;
begin
  select * into v_row from public.court_bookings where id = p_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  v_is_staff := public.has_venue_access(v_row.venue_id, 'staff') or public.is_super_admin();
  v_is_owner := v_row.user_id is not null and v_row.user_id = auth.uid();
  if not (v_is_staff or v_is_owner) then raise exception 'FORBIDDEN'; end if;

  -- resolve the target values (null arg = unchanged)
  v_new_court := coalesce(p_court_id, v_row.court_id);
  v_new_start := coalesce(p_starts_at, v_row.starts_at);
  v_new_end   := coalesce(p_ends_at, v_row.ends_at);
  v_time_change := (v_new_court, v_new_start, v_new_end)
                   is distinct from (v_row.court_id, v_row.starts_at, v_row.ends_at);

  -- ── contact fields ──
  if p_customer_name is not null then
    v_new_name := nullif(trim(p_customer_name), '');
    if v_new_name is distinct from v_row.customer_name then
      v_changes := v_changes || jsonb_build_object('customer_name',
        jsonb_build_array(v_row.customer_name, v_new_name));
      update public.court_bookings set customer_name = v_new_name where id = p_id;
    end if;
  end if;
  if p_phone is not null then
    v_new_phone := nullif(trim(p_phone), '');
    if v_new_phone is distinct from v_row.phone then
      v_changes := v_changes || jsonb_build_object('phone',
        jsonb_build_array(v_row.phone, v_new_phone));
      update public.court_bookings set phone = v_new_phone where id = p_id;
    end if;
  end if;

  -- ── date / time / court ──
  if v_time_change then
    if not v_is_staff then
      if v_row.payment_status not in ('unpaid','rejected') then raise exception 'BOOKING_LOCKED'; end if;
      if v_row.starts_at <= now() then raise exception 'BOOKING_LOCKED'; end if;
    end if;
    if v_new_end <= v_new_start then raise exception 'End time must be after start time'; end if;
    if not exists (select 1 from public.courts where id = v_new_court) then raise exception 'Court not found'; end if;

    perform 1 from public.courts where id = v_new_court for update;

    if exists (
      select 1 from public.court_bookings
      where court_id = v_new_court and id <> p_id
        and state not in ('dropped','no_show','refunded','cancelled')
        and starts_at < v_new_end and ends_at > v_new_start
    ) then raise exception 'SLOT_TAKEN'; end if;

    if exists (
      select 1 from public.court_blocks
      where court_id = v_new_court and starts_at < v_new_end and ends_at > v_new_start
    ) then raise exception 'SLOT_BLOCKED'; end if;

    v_new_price := public.quote_price(v_new_court, v_new_start, v_new_end);

    v_changes := v_changes || jsonb_build_object(
      'court_id',  jsonb_build_array(v_row.court_id::text, v_new_court::text),
      'starts_at', jsonb_build_array(v_row.starts_at, v_new_start),
      'ends_at',   jsonb_build_array(v_row.ends_at, v_new_end),
      'price',     jsonb_build_array(v_row.price, v_new_price));

    update public.court_bookings
      set court_id = v_new_court, venue_id = (select venue_id from public.courts where id = v_new_court),
          starts_at = v_new_start, ends_at = v_new_end, price = v_new_price
      where id = p_id;
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.booking_audit_logs (booking_kind, booking_id, action, performed_by, changes)
    values ('court', p_id, 'EDITED', auth.uid(), v_changes);
  end if;

  select * into v_row from public.court_bookings where id = p_id;
  return v_row;
end;
$$;
grant execute on function public.edit_court_booking(uuid,text,text,uuid,timestamptz,timestamptz) to authenticated;

-- ── CANCEL A COURT BOOKING ───────────────────────────────────────
create or replace function public.cancel_court_booking(p_id uuid)
returns public.court_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_row      public.court_bookings;
  v_is_staff boolean;
  v_is_owner boolean;
begin
  select * into v_row from public.court_bookings where id = p_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  v_is_staff := public.has_venue_access(v_row.venue_id, 'staff') or public.is_super_admin();
  v_is_owner := v_row.user_id is not null and v_row.user_id = auth.uid();
  if not (v_is_staff or v_is_owner) then raise exception 'FORBIDDEN'; end if;

  if v_row.state = 'cancelled' then return v_row; end if;

  if not v_is_staff then
    if v_row.payment_status not in ('unpaid','rejected') then raise exception 'BOOKING_LOCKED'; end if;
    if v_row.starts_at <= now() then raise exception 'BOOKING_LOCKED'; end if;
  end if;

  update public.court_bookings set state = 'cancelled' where id = p_id returning * into v_row;

  insert into public.booking_audit_logs (booking_kind, booking_id, action, performed_by, changes)
  values ('court', p_id, 'CANCELLED', auth.uid(),
          jsonb_build_object('state', jsonb_build_array(v_row.state, 'cancelled')));

  return v_row;
end;
$$;
grant execute on function public.cancel_court_booking(uuid) to authenticated;

-- ── EDIT A GAME JOIN (bookings row) ──────────────────────────────
create or replace function public.edit_game_join(
  p_booking_id  uuid,
  p_player_name text default null,
  p_phone       text default null,
  p_position    text default null
)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_row     public.bookings;
  v_host    uuid;
  v_changes jsonb := '{}'::jsonb;
  v_val     text;
begin
  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select host_id into v_host from public.events where id = v_row.event_id;

  if not (
    (v_row.user_id is not null and v_row.user_id = auth.uid())
    or v_host = auth.uid()
    or public.is_super_admin()
  ) then raise exception 'FORBIDDEN'; end if;

  if p_player_name is not null then
    v_val := nullif(trim(p_player_name), '');
    if v_val is distinct from v_row.player_name then
      v_changes := v_changes || jsonb_build_object('player_name', jsonb_build_array(v_row.player_name, v_val));
      update public.bookings set player_name = v_val where id = p_booking_id;
    end if;
  end if;
  if p_phone is not null then
    v_val := nullif(trim(p_phone), '');
    if v_val is distinct from v_row.phone then
      v_changes := v_changes || jsonb_build_object('phone', jsonb_build_array(v_row.phone, v_val));
      update public.bookings set phone = v_val where id = p_booking_id;
    end if;
  end if;
  if p_position is not null then
    v_val := nullif(trim(p_position), '');
    if v_val is distinct from v_row.position then
      v_changes := v_changes || jsonb_build_object('position', jsonb_build_array(v_row.position, v_val));
      update public.bookings set position = v_val where id = p_booking_id;
    end if;
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.booking_audit_logs (booking_kind, booking_id, action, performed_by, changes)
    values ('event_join', p_booking_id, 'EDITED', auth.uid(), v_changes);
  end if;

  select * into v_row from public.bookings where id = p_booking_id;
  return v_row;
end;
$$;
grant execute on function public.edit_game_join(uuid,text,text,text) to authenticated;

-- ── CANCEL A GAME JOIN (leave the game) ──────────────────────────
create or replace function public.cancel_game_join(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row      public.bookings;
  v_host     uuid;
  v_date     timestamptz;
  v_is_host  boolean;
  v_is_owner boolean;
begin
  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select host_id, event_date into v_host, v_date from public.events where id = v_row.event_id;
  v_is_host  := v_host = auth.uid() or public.is_super_admin();
  v_is_owner := v_row.user_id is not null and v_row.user_id = auth.uid();
  if not (v_is_host or v_is_owner) then raise exception 'FORBIDDEN'; end if;

  if not v_is_host then
    if v_row.payment_status not in ('unpaid','rejected') then raise exception 'BOOKING_LOCKED'; end if;
    if v_date is not null and v_date <= now() then raise exception 'BOOKING_LOCKED'; end if;
  end if;

  insert into public.booking_audit_logs (booking_kind, booking_id, action, performed_by, changes)
  values ('event_join', p_booking_id, 'CANCELLED', auth.uid(),
          jsonb_build_object('event_id', to_jsonb(v_row.event_id)));

  delete from public.bookings where id = p_booking_id;
end;
$$;
grant execute on function public.cancel_game_join(uuid) to authenticated;
