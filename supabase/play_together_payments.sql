-- ================================================================
-- Khelam Na — "Play Together" Phase 2: host-approval -> payment ->
-- verification -> confirmed-membership state machine.
-- Run this whole file in the Supabase SQL Editor, AFTER play_together.sql.
-- Safe to re-run.
--
-- Business rule (do not weaken): a player NEVER becomes a confirmed
-- group member just because the host approved their join request.
-- The full path is:
--
--   requested (PENDING_HOST_APPROVAL)
--     -> host approves -> payment_pending (2-hour deadline starts)
--     -> player submits proof -> payment_verification_pending
--     -> host verifies -> joined (CONFIRMED, only now added to the group)
--                       -> payment_rejected (player may resubmit before deadline)
--     -> deadline passes with no submission -> expired
--
-- host rejects the ORIGINAL request (before payment) -> rejected, same
-- as before this migration.
--
-- The backend is the source of truth for the 2-hour deadline: every
-- mutating RPC below re-checks payment_deadline against now() before
-- acting (never trust a client-side countdown), and a scheduled job
-- (pg_cron, best-effort — see bottom of file) sweeps stale rows so a
-- deadline is enforced even if nobody touches the row again.
-- ================================================================

-- ── game_players: new state-machine columns ───────────────────────
alter table public.game_players add column if not exists approved_at            timestamptz;
alter table public.game_players add column if not exists payment_deadline       timestamptz;
alter table public.game_players add column if not exists payment_submitted_at   timestamptz;
alter table public.game_players add column if not exists payment_verified_at    timestamptz;
alter table public.game_players add column if not exists payment_rejected_at    timestamptz;
alter table public.game_players add column if not exists payment_rejection_reason text;
alter table public.game_players add column if not exists expired_at             timestamptz;
alter table public.game_players add column if not exists payment_method         text;
alter table public.game_players add column if not exists transaction_id        text;
alter table public.game_players add column if not exists payment_proof_path    text;
alter table public.game_players add column if not exists payment_reminder_count int not null default 0;
alter table public.game_players add column if not exists last_payment_reminder_at timestamptz;

-- ── Re-run safety: widen the status + payment_method check constraints,
-- same find-and-drop pattern play_together.sql already established (these
-- tables were never created with name-tracked constraints).
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

select pg_temp.drop_check_constraints('game_players', 'status');
alter table public.game_players add constraint game_players_status_check
  check (status in (
    'requested',                     -- PENDING_HOST_APPROVAL
    'payment_pending',                -- host approved, 2hr window open
    'payment_verification_pending',   -- player submitted proof
    'joined',                         -- CONFIRMED — the only "in the group" state
    'left',
    'rejected',                       -- host rejected the ORIGINAL request
    'payment_rejected',               -- host rejected the payment proof
    'expired'                         -- 2hr window passed with no verified payment
  ));

select pg_temp.drop_check_constraints('game_players', 'payment_method');
alter table public.game_players add constraint game_players_payment_method_check
  check (payment_method is null or payment_method in ('host_qr','esewa','khalti','bank_transfer','cash'));

drop function pg_temp.drop_check_constraints(text, text);

create index if not exists idx_game_players_payment_deadline
  on public.game_players (payment_deadline)
  where status in ('payment_pending','payment_rejected');

-- ================================================================
-- join_play_together_game: REPLACES the play_together.sql version.
-- Adds p_ack_terms — the player must explicitly acknowledge the
-- PlayTogether Terms & Conditions (host approval, the 2-hour payment
-- window, and that they're not confirmed until verified) before a
-- request can even be created. Mirrors p_ack_risk on
-- create_play_together_game(), same enforcement style: checked
-- server-side, never trusted from the client alone.
-- ================================================================
drop function if exists public.join_play_together_game(uuid);

create or replace function public.join_play_together_game(p_game_id uuid, p_ack_terms boolean default false)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_game         public.games;
  v_joined_count int;
  v_row          public.game_players;
begin
  if p_ack_terms is not true then
    raise exception 'TERMS_NOT_ACKNOWLEDGED';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'published' then raise exception 'JOINING_CLOSED'; end if;
  if now() >= v_game.joining_deadline then raise exception 'JOINING_CLOSED'; end if;
  if v_game.host_id = auth.uid() then raise exception 'HOST_CANNOT_JOIN'; end if;

  if exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = auth.uid() and status in ('requested','joined','payment_pending','payment_verification_pending')
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  -- Pending requests don't reserve a spot — only approved players count
  -- toward capacity — but there's no point accepting a request into an
  -- already-full game.
  select count(*) into v_joined_count
    from public.game_players where game_id = p_game_id and status = 'joined';
  if v_joined_count >= v_game.max_players - 1 then
    raise exception 'GAME_FULL';
  end if;

  insert into public.game_players (game_id, user_id, status, contribution_amount, contribution_status)
  values (p_game_id, auth.uid(), 'requested', v_game.contribution_amount, 'pending')
  on conflict (game_id, user_id) do update
    set status = 'requested',
        contribution_amount = excluded.contribution_amount,
        contribution_status = 'pending',
        collected_at = null,
        joined_at = now(),
        left_at = null,
        approved_at = null, payment_deadline = null, payment_submitted_at = null,
        payment_verified_at = null, payment_rejected_at = null, expired_at = null,
        payment_method = null, transaction_id = null, payment_proof_path = null,
        payment_rejection_reason = null, payment_reminder_count = 0, last_payment_reminder_at = null
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.join_play_together_game(uuid,boolean) to authenticated;

-- ================================================================
-- approve_join_request: REPLACES the play_together.sql version.
-- Approving no longer flips straight to 'joined' — it opens a 2-hour
-- payment window. Rejecting the original request is unchanged.
-- ================================================================
create or replace function public.approve_join_request(p_game_player_id uuid, p_approve boolean)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row           public.game_players;
  v_host          uuid;
  v_max_players   int;
  v_game_status   text;
  v_reserved      int;
begin
  select gp.* into v_row
    from public.game_players gp
    where gp.id = p_game_player_id for update of gp;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;

  select g.host_id, g.max_players, g.status into v_host, v_max_players, v_game_status
    from public.games g where g.id = v_row.game_id;
  if v_host <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_row.status <> 'requested' then raise exception 'ALREADY_REVIEWED'; end if;
  if v_game_status <> 'published' then raise exception 'GAME_CANCELLED'; end if;

  if p_approve then
    -- Every player already in the pipeline (confirmed, or mid-payment)
    -- reserves a spot — an approval can't oversubscribe the game.
    select count(*) into v_reserved
      from public.game_players
      where game_id = v_row.game_id
        and status in ('joined','payment_pending','payment_verification_pending');
    if v_reserved >= v_max_players - 1 then
      raise exception 'GAME_FULL';
    end if;
    update public.game_players
      set status = 'payment_pending',
          approved_at = now(),
          payment_deadline = now() + interval '2 hours',
          payment_reminder_count = 0,
          last_payment_reminder_at = null
      where id = p_game_player_id
      returning * into v_row;
  else
    update public.game_players set status = 'rejected' where id = p_game_player_id returning * into v_row;
  end if;

  return v_row;
end;
$$;
grant execute on function public.approve_join_request(uuid,boolean) to authenticated;

-- ================================================================
-- submit_play_together_payment: player-only. Attaches proof of payment
-- to their own payment_pending (or previously payment_rejected) row and
-- moves it to payment_verification_pending. The 2-hour deadline is
-- re-checked here, server-side, before accepting — never trust the
-- client's countdown. A row already past its deadline is expired in
-- place instead of accepting the submission.
-- ================================================================
create or replace function public.submit_play_together_payment(
  p_game_player_id   uuid,
  p_payment_method   text,
  p_transaction_id   text,
  p_payment_proof_path text
) returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row public.game_players;
  v_game_status text;
begin
  select gp.* into v_row from public.game_players gp where gp.id = p_game_player_id for update of gp;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  if v_row.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_row.status not in ('payment_pending', 'payment_rejected') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;

  select g.status into v_game_status from public.games g where g.id = v_row.game_id;
  if v_game_status <> 'published' then raise exception 'GAME_CANCELLED'; end if;

  -- Deliberately does NOT raise after this update — raising here would
  -- roll back the very expiry we just wrote, since a PL/pgSQL exception
  -- aborts the whole calling transaction unless caught. Instead we return
  -- the now-expired row and the caller (submitPlayTogetherPayment() in
  -- src/lib/playTogether/actions.ts) detects status = 'expired' on the
  -- returned row and surfaces the friendly message itself.
  if v_row.payment_deadline is null or now() >= v_row.payment_deadline then
    update public.game_players set status = 'expired', expired_at = now()
      where id = p_game_player_id returning * into v_row;

    insert into public.notifications (user_id, kind, title, body, game_id)
    select r2.user_id, 'game_payment_expired', 'Payment window expired',
      format('Your payment window expired. Your request to join the %s game was cancelled because payment wasn''t completed in time.', g2.sport),
      r2.game_id
    from public.game_players r2 join public.games g2 on g2.id = r2.game_id where r2.id = p_game_player_id;
    insert into public.notifications (user_id, kind, title, body, game_id, actor_id)
    select g2.host_id, 'game_host_payment_expired', 'Player payment expired',
      format('A player''s payment window for your %s game expired before they paid.', g2.sport),
      r2.game_id, r2.user_id
    from public.game_players r2 join public.games g2 on g2.id = r2.game_id where r2.id = p_game_player_id;

    return v_row;
  end if;

  if p_payment_method is null or p_payment_method not in ('host_qr','esewa','khalti','bank_transfer','cash') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if p_transaction_id is null or length(trim(p_transaction_id)) = 0 then
    raise exception 'TRANSACTION_ID_REQUIRED';
  end if;
  if p_payment_proof_path is null or length(trim(p_payment_proof_path)) = 0 then
    raise exception 'PAYMENT_PROOF_REQUIRED';
  end if;

  update public.game_players
    set status = 'payment_verification_pending',
        payment_method = p_payment_method,
        transaction_id = trim(p_transaction_id),
        payment_proof_path = p_payment_proof_path,
        payment_submitted_at = now(),
        payment_rejected_at = null
    where id = p_game_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.submit_play_together_payment(uuid,text,text,text) to authenticated;

-- ================================================================
-- verify_play_together_payment: host-only. This is the ONLY point a
-- player is actually added to the group. Deliberately does NOT
-- re-check payment_deadline — a proof submitted on time stays
-- reviewable even if the host verifies it after the deadline passed
-- (see play_together_payments.sql Case C in the spec). An already-
-- expired row can never reach this function because expiry moves the
-- row out of 'payment_verification_pending'.
-- ================================================================
-- Signature gained a third param (p_reason) after the first release of
-- this file — CREATE OR REPLACE does NOT replace a function whose
-- parameter list changed, it just adds a second overload, which then
-- makes every call ambiguous. Drop the old 2-arg version explicitly.
drop function if exists public.verify_play_together_payment(uuid, boolean);

create or replace function public.verify_play_together_payment(
  p_game_player_id uuid, p_approve boolean, p_reason text default null
)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row          public.game_players;
  v_host         uuid;
  v_max_players  int;
  v_game_status  text;
  v_joined_count int;
begin
  select gp.* into v_row from public.game_players gp where gp.id = p_game_player_id for update of gp;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;

  select g.host_id, g.max_players, g.status into v_host, v_max_players, v_game_status
    from public.games g where g.id = v_row.game_id;
  if v_host <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_row.status <> 'payment_verification_pending' then raise exception 'NOT_AWAITING_VERIFICATION'; end if;

  if p_approve then
    -- A payment can still be rejected on a cancelled game (harmless
    -- record-keeping), but never approved into a group that no longer
    -- exists as a live game.
    if v_game_status <> 'published' then raise exception 'GAME_CANCELLED'; end if;
    select count(*) into v_joined_count
      from public.game_players where game_id = v_row.game_id and status = 'joined';
    if v_joined_count >= v_max_players - 1 then
      raise exception 'GAME_FULL';
    end if;
    update public.game_players
      set status = 'joined', payment_verified_at = now(),
          contribution_status = 'collected', collected_at = now()
      where id = p_game_player_id returning * into v_row;
  else
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'REJECTION_REASON_REQUIRED';
    end if;
    update public.game_players
      set status = 'payment_rejected', payment_rejected_at = now(), payment_rejection_reason = p_reason
      where id = p_game_player_id returning * into v_row;
  end if;

  return v_row;
end;
$$;
grant execute on function public.verify_play_together_payment(uuid,boolean,text) to authenticated;

-- ================================================================
-- expire_stale_play_together_requests: bulk sweep. This is the backend
-- enforcement of the 2-hour deadline — called by a scheduled job (best
-- effort pg_cron below) AND opportunistically from the app on every
-- read of a game's roster/requests, so an expired row can never be
-- displayed or acted on as if it were still active just because the
-- cron tick hasn't run yet. A row already in payment_verification_pending
-- is deliberately left alone — a submitted proof stays under host review
-- past the deadline rather than silently expiring (see Case C).
-- ================================================================
create or replace function public.expire_stale_play_together_requests()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  r       record;
begin
  -- Row-by-row (not a single bulk UPDATE) so each expiry can notify both
  -- sides right here — this runs unattended from pg_cron, so the cron tick
  -- itself is often the only place these notifications can originate from;
  -- nothing guarantees a player or host will load a page around the same
  -- moment their window lapses.
  for r in
    select gp.id, gp.game_id, gp.user_id, g.host_id, g.sport
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.status in ('payment_pending','payment_rejected')
      and gp.payment_deadline is not null
      and gp.payment_deadline < now()
    for update of gp
  loop
    update public.game_players set status = 'expired', expired_at = now() where id = r.id;

    insert into public.notifications (user_id, kind, title, body, game_id)
    values (
      r.user_id, 'game_payment_expired', 'Payment window expired',
      format('Your payment window expired. Your request to join the %s game was cancelled because payment wasn''t completed in time.', r.sport),
      r.game_id
    );
    insert into public.notifications (user_id, kind, title, body, game_id, actor_id)
    values (
      r.host_id, 'game_host_payment_expired', 'Player payment expired',
      format('A player''s payment window for your %s game expired before they paid.', r.sport),
      r.game_id, r.user_id
    );

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.expire_stale_play_together_requests() to authenticated;

-- ================================================================
-- send_due_play_together_reminders: fires the next scheduled payment
-- reminder (max 10 per request) for every player currently in
-- payment_pending. Schedule is minutes-since-approval: immediately,
-- then 10/20/30/45/60/75/90/105 minutes in, then a final one 5 minutes
-- before the deadline. Each row only ever advances one reminder per
-- call — payment_reminder_count is both the progress marker and the
-- hard cap, so this can never send more than 10 even if called out of
-- order or concurrently (the UPDATE's WHERE re-checks the count).
-- ================================================================
create or replace function public.send_due_play_together_reminders()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_schedule int[] := array[0,10,20,30,45,60,75,90,105,115];
  v_count    int := 0;
  r          record;
begin
  for r in
    select gp.id, gp.game_id, gp.user_id, gp.approved_at, gp.payment_reminder_count,
           g.sport, g.contribution_amount
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.status = 'payment_pending'
      and gp.payment_reminder_count < array_length(v_schedule, 1)
      and gp.approved_at is not null
      and now() >= gp.approved_at + make_interval(mins => v_schedule[gp.payment_reminder_count + 1])
    for update of gp
  loop
    update public.game_players
      set payment_reminder_count = payment_reminder_count + 1,
          last_payment_reminder_at = now()
      where id = r.id and payment_reminder_count = r.payment_reminder_count;

    insert into public.notifications (user_id, kind, title, body, game_id)
    values (
      r.user_id, 'game_payment_reminder', 'Payment reminder',
      format('Complete your Rs %s payment for the %s game to keep your spot.', r.contribution_amount::int, r.sport),
      r.game_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.send_due_play_together_reminders() to authenticated;

-- ── NOTIFICATIONS: new kinds for the payment sub-flow ──────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected',
                   'game_payment_required','game_payment_reminder',
                   'game_payment_submitted','game_payment_verified',
                   'game_payment_rejected','game_payment_expired',
                   'game_host_payment_submitted','game_host_payment_expired'));

-- ── STORAGE: proof of payment to the HOST (private — owner + that
-- game's host only, mirrors 'payment-proofs' in payments.sql but
-- scoped per-host instead of admin-wide). Path convention:
-- '{user_id}/{game_player_id}_{timestamp}.{ext}' — underscore, not
-- hyphen, deliberately: game_player_id is itself a UUID full of
-- hyphens, so split_part(..., '-', 1) would truncate it. The
-- game_player_id segment is what lets the read policy resolve the
-- owning host.
-- ================================================================
insert into storage.buckets (id, name, public)
  values ('game-payment-proofs', 'game-payment-proofs', false)
  on conflict (id) do nothing;

drop policy if exists game_proof_owner_insert on storage.objects;
drop policy if exists game_proof_read         on storage.objects;
create policy game_proof_owner_insert on storage.objects for insert
  with check (bucket_id = 'game-payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy game_proof_read on storage.objects for select
  using (
    bucket_id = 'game-payment-proofs' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.game_players gp join public.games g on g.id = gp.game_id
        where gp.id::text = split_part(split_part(name, '/', 2), '_', 1)
          and g.host_id = auth.uid()
      )
      or public.is_super_admin()
    )
  );
-- No update/delete: proofs are immutable evidence, same as payment-proofs.

-- ── BEST-EFFORT SCHEDULING (pg_cron) ────────────────────────────────
-- Every minute: expire stale payment windows, then fire any due
-- reminders. If pg_cron isn't enabled on this project (Database ->
-- Extensions -> pg_cron in the Supabase dashboard), this block no-ops
-- instead of failing the whole migration — correctness still holds
-- without it because every mutating RPC above re-checks the deadline
-- itself, but reminders strictly need a scheduler to fire proactively.
do $$
begin
  perform cron.unschedule('play-together-expire-payments');
exception
  when others then null;
end $$;
do $$
begin
  perform cron.schedule(
    'play-together-expire-payments',
    '* * * * *',
    $cron$select public.expire_stale_play_together_requests(); select public.send_due_play_together_reminders();$cron$
  );
exception
  when undefined_table then null;   -- pg_cron extension not installed
  when insufficient_privilege then null;
  when others then null;
end $$;

-- ── REALTIME: payment sub-flow updates live on both game/host pages ──
do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ================================================================
-- create_play_together_game: REPLACES the play_together.sql version.
-- Real bug hit in production: nothing validated that the chosen slot
-- was actually still in the future. A host who leaves the wizard open
-- for a while (uploading a QR, deliberating on capacity) before
-- finally submitting could reserve a court for a starts_at that had
-- already passed by the time the RPC ran — and worse, a
-- joining_deadline that was ALREADY in the past the moment the game
-- was created, silently making the game unjoinable from the instant
-- it existed. The frontend's SlotPicker greys out past slots, but that
-- check only runs at selection time, not at final submit — exactly
-- the class of bug the state-machine's own design note warns about
-- (never trust client-side timing as authority). Same signature as
-- before, so this cleanly replaces it — no duplicate overload risk.
-- ================================================================
create or replace function public.create_play_together_game(
  p_court_id          uuid,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_sport             text,
  p_game_format       text,
  p_min_players       int,
  p_max_players       int,
  p_joining_deadline  timestamptz,
  p_host_qr_path      text,
  p_host_phone        text,
  p_notes             text default null,
  p_ack_risk          boolean default false
) returns public.games
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.court_bookings;
  v_game    public.games;
begin
  if p_ack_risk is not true then
    raise exception 'RISK_NOT_ACKNOWLEDGED';
  end if;
  if p_min_players is null or p_min_players < 1 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if p_max_players is null or p_max_players < p_min_players then
    raise exception 'INVALID_CAPACITY';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'STARTS_AT_IN_PAST';
  end if;
  if p_joining_deadline is null or p_joining_deadline >= p_starts_at then
    raise exception 'DEADLINE_AFTER_START';
  end if;
  if p_joining_deadline <= now() then
    raise exception 'DEADLINE_IN_PAST';
  end if;
  if p_host_qr_path is null or length(trim(p_host_qr_path)) = 0 then
    raise exception 'HOST_QR_REQUIRED';
  end if;
  if p_host_phone is null or length(trim(p_host_phone)) = 0 then
    raise exception 'HOST_PHONE_REQUIRED';
  end if;

  -- Atomic slot reservation — same locking/conflict-check every other
  -- court booking on the platform goes through.
  v_booking := public.book_court(p_court_id, p_starts_at, p_ends_at, auth.uid(), null, 'platform');

  insert into public.games (
    host_id, court_booking_id, venue_id, court_id, sport, game_format,
    starts_at, ends_at, min_players, max_players, contribution_amount,
    joining_deadline, host_qr_path, host_phone, notes, status
  ) values (
    auth.uid(), v_booking.id, v_booking.venue_id, p_court_id, p_sport, p_game_format,
    p_starts_at, p_ends_at, p_min_players, p_max_players,
    round(v_booking.price / p_max_players, 2),
    p_joining_deadline, trim(p_host_qr_path), trim(p_host_phone), p_notes, 'awaiting_payment'
  ) returning * into v_game;

  return v_game;
end;
$$;
grant execute on function public.create_play_together_game
  (uuid,timestamptz,timestamptz,text,text,int,int,timestamptz,text,text,text,boolean) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
