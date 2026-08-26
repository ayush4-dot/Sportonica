-- ================================================================
-- Fix: hosting a paid Play Together game and getting the payment
-- approved (or a free game booking) never actually published the
-- game — it silently stayed 'awaiting_payment' forever, invisible on
-- Play Together and the home page's "Play socially" rail no matter
-- what you did.
--
-- Root cause: play_together.sql's confirm_free_booking()/review_payment()
-- added a `perform public.finalize_play_together_game(...)` call right
-- alongside the existing maybe_publish_hosted_event() call. Later,
-- tournaments.sql re-declared BOTH of those same functions again (via
-- `create or replace function`, which fully replaces the body — there's
-- no merging) to add the tournament_registration booking-type branch,
-- but it was written from payments.sql's ORIGINAL versions, from
-- before play_together.sql's fix existed — so applying tournaments.sql
-- after play_together.sql silently dropped the finalize call again.
-- Whichever of these two files a project ran last on its live database
-- has been missing it since.
--
-- This redeclares both functions one more time: tournament_registration
-- support (from tournaments.sql) + the finalize_play_together_game()
-- call (from play_together.sql), combined for good this time.
-- Run any time. Safe to re-run.
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
    perform public.maybe_publish_hosted_event(p_booking_id);
    perform public.finalize_play_together_game(p_booking_id);
  elsif p_booking_type = 'event_booking' then
    select amount, user_id into v_amount, v_owner from public.bookings where id = p_booking_id for update;
    if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
    if v_owner is null or v_owner <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
    if coalesce(v_amount, 0) <> 0 then raise exception 'BOOKING_NOT_FREE'; end if;
    update public.bookings set payment_status = 'paid' where id = p_booking_id;
  elsif p_booking_type = 'tournament_registration' then
    declare v_team public.tournament_teams;
    begin
      select * into v_team from public.tournament_teams where id = p_booking_id for update;
      if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
      if v_team.captain_id <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
      update public.tournament_teams set status = 'confirmed' where id = p_booking_id;
    end;
  else
    raise exception 'INVALID_BOOKING_TYPE';
  end if;
end;
$$;
grant execute on function public.confirm_free_booking(text,uuid) to authenticated;

create or replace function public.review_payment(
  p_payment_id uuid,
  p_action     text,
  p_reason     text default null,
  p_note       text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_row          public.payments;
  v_new_status   text;
  v_audit_action text;
  v_court_state  text;
  v_event_status text;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_row from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_row.status <> 'PENDING_VERIFICATION' then raise exception 'ALREADY_REVIEWED'; end if;

  if p_action = 'APPROVE' then
    if v_row.booking_type = 'court_booking' then
      select state into v_court_state from public.court_bookings where id = v_row.court_booking_id for update;
      if v_court_state in ('cancelled','dropped','no_show','refunded') then
        raise exception 'BOOKING_CANCELLED';
      end if;
      update public.court_bookings set payment_status = 'paid', state = 'confirmed' where id = v_row.court_booking_id;
      perform public.maybe_publish_hosted_event(v_row.court_booking_id);
      perform public.finalize_play_together_game(v_row.court_booking_id);
    elsif v_row.booking_type = 'event_booking' then
      select e.status into v_event_status
        from public.bookings b join public.events e on e.id = b.event_id
        where b.id = v_row.event_booking_id for update of b;
      if v_event_status = 'cancelled' then raise exception 'BOOKING_CANCELLED'; end if;
      update public.bookings set payment_status = 'paid' where id = v_row.event_booking_id;
    elsif v_row.booking_type = 'tournament_registration' then
      update public.tournament_teams set status = 'confirmed' where id = v_row.tournament_registration_id;
    end if;
    v_new_status := 'APPROVED';
    v_audit_action := 'APPROVED';
  elsif p_action = 'REJECT' then
    if p_reason is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    if v_row.booking_type = 'tournament_registration' then
      update public.tournament_teams set status = 'rejected' where id = v_row.tournament_registration_id;
    end if;
    v_new_status := 'REJECTED';
    v_audit_action := 'REJECTED';
  else
    raise exception 'INVALID_ACTION';
  end if;

  update public.payments
    set status = v_new_status, rejection_reason = p_reason, rejection_note = p_note,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_payment_id
    returning * into v_row;

  insert into public.payment_audit_logs (payment_id, action, performed_by, previous_status, new_status, reason)
  values (p_payment_id, v_audit_action, auth.uid(), 'PENDING_VERIFICATION', v_new_status, p_reason);

  return v_row;
end;
$$;
grant execute on function public.review_payment(uuid,text,text,text) to authenticated;

-- ── Republish anything that got stuck by this bug before the fix ───
-- Any already-APPROVED payment whose game never got the finalize call
-- would otherwise sit broken forever with no way to re-trigger it.
do $$
declare r record;
begin
  for r in
    select court_booking_id from public.payments
    where booking_type = 'court_booking' and status = 'APPROVED' and court_booking_id is not null
  loop
    perform public.finalize_play_together_game(r.court_booking_id);
  end loop;
end $$;

-- ── DONE ─────────────────────────────────────────────────────────
