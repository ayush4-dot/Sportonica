-- ================================================================
-- TOURNAMENT HOST PAYMENT QR — pay the organizer directly, organizer
-- verifies.
--
-- What it does: a tournament creator ("host") attaches their own payment
-- QR + recipient details to a tournament. Registration-fee payers then
-- pay the host directly (the host's QR, not Sportonica's platform
-- eSewa/Khalti QR), and the host verifies each payment themselves —
-- mirroring Play Together's uploadHostQr / verify_play_together_payment.
-- A super admin keeps a full fallback: review_payment() is unchanged, so
-- /platform/payments still lists and can act on the same payments.
--
-- Run AFTER: tournaments.sql, payments.sql, play_together.sql,
-- tournament_owner_access.sql (needs is_tournament_organizer,
-- has_venue_access, is_super_admin, the payments table + its
-- tournament_registration branch, tournament_teams).
--
-- Idempotent: every statement is CREATE ... IF NOT EXISTS /
-- CREATE OR REPLACE / DROP+CREATE. Safe to re-run. Not destructive.
--
-- Deliberately does NOT re-declare create_tournament /
-- update_tournament_draft / submit_payment / publish_tournament — those
-- have heavy historical drift across several files. Instead:
--   * the QR columns are written through a small dedicated RPC
--     (set_tournament_host_payment), which also serves as the
--     "fix my QR after publishing" path;
--   * the payer's merchant_account_snapshot / payment_method are set by a
--     BEFORE INSERT trigger on payments, so submit_payment() is untouched.
-- ================================================================

-- ── 1. Columns on public.tournaments ────────────────────────────────
-- host_payment_qr_url holds the FULL public URL (like banner_url), so the
-- read path needs no helper. host_payment_method is constrained to the
-- same four values as payments.payment_method, so nothing downstream
-- needs widening — the QR image is what a payer actually scans, this is
-- just the label shown beside it.
alter table public.tournaments add column if not exists host_payment_qr_url  text;
alter table public.tournaments add column if not exists host_payment_name    text;
alter table public.tournaments add column if not exists host_payment_account text;
alter table public.tournaments add column if not exists host_payment_method  text;

do $$
begin
  alter table public.tournaments drop constraint if exists tournaments_host_payment_method_check;
  alter table public.tournaments add constraint tournaments_host_payment_method_check
    check (host_payment_method is null or host_payment_method in ('esewa','khalti','fonepay','bank_transfer'));
end $$;

-- ── 2. Storage bucket for the QR image ──────────────────────────────
-- Same shape as tournament-banners: public read, owner-scoped insert
-- keyed by the uploader's own auth.uid() folder (the tournament row may
-- not exist yet while the draft is being built).
insert into storage.buckets (id, name, public)
  values ('tournament-qr', 'tournament-qr', true)
  on conflict (id) do nothing;

drop policy if exists tournament_qr_read on storage.objects;
drop policy if exists tournament_qr_owner_insert on storage.objects;

create policy tournament_qr_read on storage.objects for select
  using (bucket_id = 'tournament-qr');

create policy tournament_qr_owner_insert on storage.objects for insert
  with check (bucket_id = 'tournament-qr' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 3. set_tournament_host_payment: the only writer for the QR columns ─
-- Gated on is_tournament_organizer() (owner + active partnership, or a
-- tournament_managers grant), a venue manager, or a super admin — same
-- gate as every other tournament-management RPC. NOT restricted to
-- drafts, so a published tournament can still fix its QR.
create or replace function public.set_tournament_host_payment(
  p_id      uuid,
  p_qr_url  text,
  p_name    text default null,
  p_account text default null,
  p_method  text default null
) returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_row)
    or public.has_venue_access(v_row.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_method is not null and p_method not in ('esewa','khalti','fonepay','bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  update public.tournaments set
    host_payment_qr_url  = nullif(trim(p_qr_url), ''),
    host_payment_name    = nullif(trim(p_name), ''),
    host_payment_account = nullif(trim(p_account), ''),
    host_payment_method  = coalesce(nullif(p_method, ''), 'esewa')
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.set_tournament_host_payment(uuid,text,text,text,text) to authenticated;

-- ── 4. Snapshot the host's account onto each registration payment ────
-- A BEFORE INSERT trigger, so submit_payment() itself stays untouched.
-- Only fires for tournament_registration rows whose tournament actually
-- has a host QR — a fee-charging tournament with no QR set still falls
-- back to Sportonica's platform QR, and that path must keep its own
-- merchant_account_snapshot / payment_method intact.
create or replace function public.tournament_payment_host_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  if new.booking_type = 'tournament_registration' then
    select t.* into v_t
      from public.tournaments t
      join public.tournament_teams tt on tt.tournament_id = t.id
      where tt.id = new.tournament_registration_id;

    if v_t.host_payment_qr_url is not null then
      new.merchant_account_snapshot := nullif(trim(both ' ·' from
        coalesce(v_t.host_payment_name, '') || ' · ' || coalesce(v_t.host_payment_account, '')), '');
      if v_t.host_payment_method is not null then
        new.payment_method := v_t.host_payment_method;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_tournament_host_snapshot on public.payments;
create trigger payments_tournament_host_snapshot
  before insert on public.payments
  for each row execute function public.tournament_payment_host_snapshot();

-- ── 5. verify_tournament_payment: host-primary, super-admin fallback ──
-- Mirrors review_payment()'s tournament_registration branch, but the auth
-- gate is is_tournament_organizer() / venue manager / super admin instead
-- of super-admin-only. Same row lock + PENDING_VERIFICATION guard, so a
-- concurrent verify and a /platform review can't both land — the second
-- gets ALREADY_REVIEWED.
create or replace function public.verify_tournament_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_reason     text default null,
  p_note       text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.payments;
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_new_status   text;
  v_audit_action text;
begin
  select * into v_row from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_row.booking_type <> 'tournament_registration' then raise exception 'INVALID_BOOKING_TYPE'; end if;

  select * into v_team from public.tournament_teams where id = v_row.tournament_registration_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;

  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status <> 'PENDING_VERIFICATION' then raise exception 'ALREADY_REVIEWED'; end if;

  if p_approve then
    update public.tournament_teams set status = 'confirmed' where id = v_team.id;
    v_new_status := 'APPROVED';
    v_audit_action := 'APPROVED';
    update public.payments
      set status = 'APPROVED', reviewed_at = now(), reviewed_by = auth.uid()
      where id = p_payment_id
      returning * into v_row;
  else
    if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    update public.tournament_teams set status = 'rejected' where id = v_team.id;
    v_new_status := 'REJECTED';
    v_audit_action := 'REJECTED';
    update public.payments
      set status = 'REJECTED', rejection_reason = p_reason, rejection_note = p_note,
          reviewed_at = now(), reviewed_by = auth.uid()
      where id = p_payment_id
      returning * into v_row;
  end if;

  insert into public.payment_audit_logs (payment_id, action, performed_by, previous_status, new_status, reason)
  values (p_payment_id, v_audit_action, auth.uid(), 'PENDING_VERIFICATION', v_new_status, p_reason);

  return v_row;
end;
$$;
grant execute on function public.verify_tournament_payment(uuid,boolean,text,text) to authenticated;

-- ── 6. Storage RLS: host reads their tournament's proof screenshots ──
-- payment-proofs is private; proof_read (payments.sql) covers the
-- uploader + super admin. Add the tournament's host / venue manager.
-- The object path holds a hyphenated team UUID, so resolve via the
-- payments row rather than parsing the filename.
drop policy if exists proof_read_tournament_organizer on storage.objects;
create policy proof_read_tournament_organizer on storage.objects for select
  using (
    bucket_id = 'payment-proofs' and exists (
      select 1
      from public.payments p
      join public.tournament_teams tt on tt.id = p.tournament_registration_id
      join public.tournaments t on t.id = tt.tournament_id
      where p.booking_type = 'tournament_registration'
        and p.screenshot_path = storage.objects.name
        and (public.is_tournament_organizer(t) or public.has_venue_access(t.venue_id, 'manager'))
    )
  );

-- ── DONE ────────────────────────────────────────────────────────────
-- SELECT on the payments themselves is already covered:
-- pay_tournament_organizer_read + pay_vendor_tournament_read
-- (tournament_owner_access.sql) scope a host's read to their own
-- tournament's registration payments. No new payments-table policy here.
