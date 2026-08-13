-- ================================================================
-- Khelam Na — "Play Together" (Phase 1: core loop)
-- Run this whole file in the Supabase SQL Editor. Safe to re-run.
--
-- Model: the host books and pays for the venue through KhelamNa
-- upfront (reuses the existing atomic book_court() + QR payment /
-- review pipeline from payments.sql, unchanged). Other players join
-- the game for free — no money ever moves through KhelamNa for them —
-- and reimburse the host in cash at the venue. KhelamNa never
-- collects, holds, or distributes player contributions.
--
-- Deliberately new tables (games, game_players), not the legacy
-- events/bookings pair, which already implements the OPPOSITE model
-- (platform collects & verifies every player's payment via QR). The
-- legacy "need players" toggle in BookingFlow.tsx is left untouched.
--
-- Phase 1 scope only: no waitlist, no joining-deadline auto-cancel,
-- no attendance/no-show/reliability, no refund-policy engine, no
-- KhelamNa service fee on top of venue price, no admin dashboard.
-- Those are follow-up migrations.
-- ================================================================

-- ── GAMES ──────────────────────────────────────────────────────
create table if not exists public.games (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references public.profiles(id),
  court_booking_id      uuid not null unique references public.court_bookings(id),
  venue_id              uuid not null references public.venues(id),
  court_id              uuid not null references public.courts(id),
  sport                 text not null,
  game_format           text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  min_players           int not null,
  max_players           int not null,
  -- max_players counts the host as one of the slots — available player
  -- spots shown to players and enforced at join time is max_players - 1.
  contribution_amount   numeric(10,2) not null default 0,
  service_fee           numeric(10,2) not null default 0, -- unused in phase 1, kept for a later phase
  joining_deadline      timestamptz not null,
  notes                 text,
  cancel_reason         text,
  -- The host's OWN eSewa/Khalti QR + phone, captured at creation time —
  -- players pay the host directly with these, never a KhelamNa QR.
  host_qr_path          text,
  host_phone            text,
  status                text not null default 'awaiting_payment',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (min_players >= 1),
  check (max_players >= min_players),
  check (contribution_amount >= 0),
  check (service_fee >= 0),
  check (ends_at > starts_at),
  check (joining_deadline < starts_at),
  check (status in ('awaiting_payment','published','cancelled_by_host'))
);
create index if not exists idx_games_status_starts on public.games (status, starts_at);
create index if not exists idx_games_host on public.games (host_id);

-- Re-run safety: the table may already exist from an earlier run of this
-- file without these two columns.
alter table public.games add column if not exists host_qr_path text;
alter table public.games add column if not exists host_phone text;

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
  for each row execute function public.set_updated_at();  -- defined in schema_full.sql, already live

-- ── GAME PLAYERS ───────────────────────────────────────────────
-- status is a join-request lifecycle, not an instant join: a player
-- tapping "Join" only ever creates a 'requested' row. The host must
-- explicitly approve it (approve_join_request() below) before the
-- player is actually in — that's the only point a player is notified
-- or counted toward capacity.
create table if not exists public.game_players (
  id                    uuid primary key default gen_random_uuid(),
  game_id               uuid not null references public.games(id) on delete cascade,
  user_id               uuid not null references public.profiles(id),
  status                text not null default 'requested',
  -- Snapshot of games.contribution_amount at join time, so a later host
  -- edit to the amount can never silently change what an already-joined
  -- player owes.
  contribution_amount   numeric(10,2) not null default 0,
  contribution_status   text not null default 'pending',
  collected_at          timestamptz,
  joined_at             timestamptz not null default now(),
  left_at               timestamptz,
  check (status in ('requested','joined','left','rejected')),
  check (contribution_status in ('pending','collected')),
  unique (game_id, user_id)
);
create index if not exists idx_game_players_game on public.game_players (game_id);
create index if not exists idx_game_players_user on public.game_players (user_id);

-- ── Re-run safety: widen an already-existing status check/default ──
-- (mirrors the pg_temp helper payments.sql already established, for the
-- exact same reason: these tables were never created via a name-tracked
-- constraint, so find-and-drop rather than assume a name).
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
  check (status in ('requested','joined','left','rejected'));
alter table public.game_players alter column status set default 'requested';

drop function pg_temp.drop_check_constraints(text, text);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────────
-- Deliberately minimal, same style as payments.sql: only SELECT
-- policies. Every write goes through the security-definer RPCs below,
-- never direct table access.
alter table public.games enable row level security;
alter table public.game_players enable row level security;

drop policy if exists games_read_public on public.games;
drop policy if exists games_read_host   on public.games;
drop policy if exists games_read_super  on public.games;
create policy games_read_public on public.games for select using (status = 'published');
create policy games_read_host   on public.games for select using (host_id = auth.uid());
create policy games_read_super  on public.games for select using (public.is_super_admin());

drop policy if exists game_players_read_own       on public.game_players;
drop policy if exists game_players_read_host      on public.game_players;
drop policy if exists game_players_read_super     on public.game_players;
drop policy if exists game_players_read_published on public.game_players;
create policy game_players_read_own on public.game_players for select using (user_id = auth.uid());
create policy game_players_read_host on public.game_players for select using (
  exists (select 1 from public.games g where g.id = game_players.game_id and g.host_id = auth.uid())
);
create policy game_players_read_super on public.game_players for select using (public.is_super_admin());
-- The roster of a published game is public (mirrors the legacy
-- event_players view) — this is what lets the discovery list and game
-- detail page show real join counts to a visitor who hasn't joined yet.
-- Deliberately scoped to status = 'joined' only — a pending request is
-- between the requester and the host, not visible to other visitors.
create policy game_players_read_published on public.game_players for select using (
  status = 'joined'
  and exists (select 1 from public.games g where g.id = game_players.game_id and g.status = 'published')
);

-- ================================================================
-- create_play_together_game: reserves the court slot via the
-- existing book_court() (unchanged — reuses its row-locking and
-- conflict-check logic atomically) and captures the Play Together
-- specific fields on a new `games` row. The game stays
-- 'awaiting_payment' — never joinable — until the host's payment is
-- confirmed (see finalize_play_together_game() below).
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
  if p_joining_deadline is null or p_joining_deadline >= p_starts_at then
    raise exception 'DEADLINE_AFTER_START';
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

-- ================================================================
-- finalize_play_together_game: idempotent, mirrors
-- maybe_publish_hosted_event(). Called from confirm_free_booking()
-- and review_payment() (APPROVE) below, right after the host's
-- venue payment is confirmed. A strict no-op for any court_booking
-- that isn't a Play Together game.
-- ================================================================
create or replace function public.finalize_play_together_game(p_court_booking_id uuid)
returns public.games
language plpgsql security definer set search_path = public as $$
declare v_game public.games;
begin
  select * into v_game from public.games where court_booking_id = p_court_booking_id;
  if v_game.id is null or v_game.status <> 'awaiting_payment' then
    return v_game;
  end if;

  update public.games set status = 'published', updated_at = now()
    where id = v_game.id returning * into v_game;

  return v_game;
end;
$$;

-- ================================================================
-- join_play_together_game: NOT an instant join — creates a pending
-- request. No money changes hands here either way. The host must
-- explicitly approve_join_request() before the player is actually in;
-- that's the only point they're notified or counted toward capacity.
-- ================================================================
create or replace function public.join_play_together_game(p_game_id uuid)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_game         public.games;
  v_joined_count int;
  v_row          public.game_players;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'published' then raise exception 'JOINING_CLOSED'; end if;
  if now() >= v_game.joining_deadline then raise exception 'JOINING_CLOSED'; end if;
  if v_game.host_id = auth.uid() then raise exception 'HOST_CANNOT_JOIN'; end if;

  if exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = auth.uid() and status in ('requested','joined')
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
        left_at = null
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.join_play_together_game(uuid) to authenticated;

-- ================================================================
-- approve_join_request: host-only. Flips a pending request to
-- 'joined' (or 'rejected'). This is the ONLY point a player is
-- notified or counted toward capacity — see
-- notifyPlayTogetherJoined()/notifyPlayTogetherJoinRejected() in
-- src/lib/mail/notify.ts, called right after this succeeds.
-- ================================================================
create or replace function public.approve_join_request(p_game_player_id uuid, p_approve boolean)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row          public.game_players;
  v_host         uuid;
  v_max_players  int;
  v_joined_count int;
begin
  select gp.*, g.host_id, g.max_players into v_row, v_host, v_max_players
    from public.game_players gp join public.games g on g.id = gp.game_id
    where gp.id = p_game_player_id for update of gp;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  if v_host <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_row.status <> 'requested' then raise exception 'ALREADY_REVIEWED'; end if;

  if p_approve then
    select count(*) into v_joined_count
      from public.game_players where game_id = v_row.game_id and status = 'joined';
    if v_joined_count >= v_max_players - 1 then
      raise exception 'GAME_FULL';
    end if;
    update public.game_players set status = 'joined' where id = p_game_player_id returning * into v_row;
  else
    update public.game_players set status = 'rejected' where id = p_game_player_id returning * into v_row;
  end if;

  return v_row;
end;
$$;
grant execute on function public.approve_join_request(uuid,boolean) to authenticated;

-- ── leave_play_together_game: withdraw a request, or leave after being
-- approved — either way, before the joining deadline. ──
create or replace function public.leave_play_together_game(p_game_id uuid)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_game public.games;
  v_row  public.game_players;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if now() >= v_game.joining_deadline then raise exception 'JOINING_CLOSED'; end if;

  update public.game_players set status = 'left', left_at = now()
    where game_id = p_game_id and user_id = auth.uid() and status in ('requested','joined')
    returning * into v_row;

  if v_row.id is null then raise exception 'NOT_JOINED'; end if;
  return v_row;
end;
$$;
grant execute on function public.leave_play_together_game(uuid) to authenticated;

-- ── mark_contribution_collected: host-only cash-tracking toggle ──
-- This is only a record. KhelamNa never processes or holds this cash.
create or replace function public.mark_contribution_collected(p_game_player_id uuid, p_collected boolean)
returns public.game_players
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.game_players;
  v_host uuid;
begin
  select g.host_id into v_host
    from public.game_players gp join public.games g on g.id = gp.game_id
    where gp.id = p_game_player_id;
  if v_host is null then raise exception 'NOT_FOUND'; end if;
  if v_host <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  update public.game_players
    set contribution_status = case when p_collected then 'collected' else 'pending' end,
        collected_at = case when p_collected then now() else null end
    where id = p_game_player_id
    returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.mark_contribution_collected(uuid,boolean) to authenticated;

-- ================================================================
-- cancel_play_together_game: host-only. No refund logic — per the
-- product spec, refunds depend on venue/KhelamNa policy, which is a
-- later phase. This only stops the game and records why; any refund
-- must currently be handled manually by an admin.
-- ================================================================
create or replace function public.cancel_play_together_game(p_game_id uuid, p_reason text default null)
returns public.games
language plpgsql security definer set search_path = public as $$
declare v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.host_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_game.status = 'cancelled_by_host' then raise exception 'ALREADY_CANCELLED'; end if;

  update public.games set status = 'cancelled_by_host', cancel_reason = p_reason, updated_at = now()
    where id = p_game_id returning * into v_game;

  return v_game;
end;
$$;
grant execute on function public.cancel_play_together_game(uuid,text) to authenticated;

-- ── NOTIFICATIONS: add a Play Together deep-link + new kinds ──────
alter table public.notifications add column if not exists game_id uuid references public.games(id);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected'));

-- ── STORAGE: host's own payment QR (public — players need to see it to
-- pay the host; owner-write-only, same shape as the 'payment-qr' bucket
-- in payments.sql but per-host instead of platform-wide) ──────────
insert into storage.buckets (id, name, public)
  values ('host-qr', 'host-qr', true)
  on conflict (id) do nothing;

drop policy if exists host_qr_read        on storage.objects;
drop policy if exists host_qr_owner_write on storage.objects;
create policy host_qr_read on storage.objects for select
  using (bucket_id = 'host-qr');
-- path convention: '{host_id}/{timestamp}.{ext}'
create policy host_qr_owner_write on storage.objects for insert
  with check (bucket_id = 'host-qr' and (storage.foldername(name))[1] = auth.uid()::text);

-- ================================================================
-- Payments integration: confirm_free_booking() and review_payment()
-- are re-declared here byte-identical to payments.sql, with exactly
-- one added line each (a perform call to
-- finalize_play_together_game()), right alongside the existing
-- maybe_publish_hosted_event() call. Same pattern booking_phone.sql
-- already used to supersede book_court() in place.
--
-- finalize_play_together_game() is a strict no-op when no `games` row
-- references the booking, so every existing/legacy booking path is
-- completely unaffected.
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
  else
    raise exception 'INVALID_BOOKING_TYPE';
  end if;
end;
$$;
grant execute on function public.confirm_free_booking(text,uuid) to authenticated;

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
      perform public.maybe_publish_hosted_event(v_row.court_booking_id);
      perform public.finalize_play_together_game(v_row.court_booking_id);
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

-- ── REALTIME: game detail / host dashboard can subscribe to live updates ──
do $$
begin
  execute 'alter publication supabase_realtime add table public.games';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.game_players';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── DONE ─────────────────────────────────────────────────────────
