-- ================================================================
-- TOURNAMENTS — full schema, RPCs, and every incremental migration,
-- consolidated into one file (was 22 separate files, in the
-- order they were originally written — each section below is
-- idempotent and was already 'safe to re-run' on its own, so the
-- whole file is safe to run start to finish against a fresh
-- database, and safe to re-run in full against one that's already
-- up to date.
--
-- Depends on organizer_partnerships.sql +
-- organizer_approval_and_own_venue.sql having been run first
-- (is_tournament_organizer(), has_venue_access(), is_super_admin()).
-- ================================================================


-- ================================================================
-- ── originally: tournaments.sql ──
-- ================================================================

-- ================================================================
-- Sportonica — Tournaments (Phase 1: creation, team registration,
-- payment). Run this whole file in the Supabase SQL Editor, AFTER
-- admin_schema.sql, payments.sql and notifications.sql. Safe to re-run.
--
-- A tournament is deliberately its own thing, not another `events` row:
-- team-based (not per-player), spans a registration window separate
-- from its start date, and carries its own status lifecycle:
--
--   draft -> pending_approval -> published -> registration_open
--         -> registration_closed -> live -> completed
--                                 -> cancelled (from most states)
--
-- "Vendor" = the existing venue_owner role; permission checks reuse
-- has_venue_access() from admin_schema.sql exactly as venues/courts do.
-- Payment reuses the existing payments table/submit_payment/
-- review_payment machinery (see payments.sql) via a third booking_type,
-- not a parallel payment system.
-- ================================================================

-- ── TOURNAMENTS ────────────────────────────────────────────────────
create table if not exists public.tournaments (
  id                        uuid primary key default gen_random_uuid(),
  venue_id                  uuid not null references public.venues(id),
  owner_id                  uuid references auth.users(id),   -- null for a platform-run tournament
  organizer_type            text not null default 'venue' check (organizer_type in ('venue','platform')),
  organizer_name            text,

  name                      text not null check (length(trim(name)) > 0),
  sport                     text not null,
  banner_url                text,
  description               text,
  contact_phone             text,

  starts_at                 timestamptz not null,
  ends_at                   timestamptz not null,
  registration_opens_at     timestamptz not null,
  registration_closes_at    timestamptz not null,
  match_duration_mins       int,

  format                    text not null check (format in ('knockout','league','group_knockout')),

  max_teams                 int not null check (max_teams >= 2),
  min_players_per_team      int not null check (min_players_per_team >= 1),
  max_players_per_team      int not null check (max_players_per_team >= min_players_per_team),
  substitute_limit          int not null default 0 check (substitute_limit >= 0),
  registration_mode         text not null default 'team' check (registration_mode in ('team','individual')),
  gender_rule               text,
  skill_category            text,

  fee                       numeric(10,2) not null default 0 check (fee >= 0),
  payment_instructions      text,
  refund_policy             text,

  prize_winner              text,
  prize_runner_up           text,
  prize_mvp                 text,
  prize_other               text,

  rules_text                text,
  equipment_notes           text,
  venue_rules               text,

  status                    text not null default 'draft' check (status in (
                              'draft','pending_approval','published','registration_open',
                              'registration_closed','live','completed','cancelled'
                            )),
  cancel_reason             text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  check (ends_at >= starts_at),
  check (registration_closes_at > registration_opens_at),
  check (registration_closes_at <= starts_at)
);

create index if not exists idx_tournaments_venue on public.tournaments(venue_id);
create index if not exists idx_tournaments_owner on public.tournaments(owner_id);
create index if not exists idx_tournaments_status on public.tournaments(status);

drop trigger if exists tournaments_touch on public.tournaments;
create trigger tournaments_touch before update on public.tournaments
  for each row execute function public.set_updated_at();

-- ── TEAMS (a team's row IS its registration — status lives here) ───
create table if not exists public.tournament_teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  captain_id    uuid not null references auth.users(id),
  ack_terms     boolean not null default false,
  status        text not null default 'pending' check (status in (
                  'pending','payment_pending','verification_pending','confirmed','rejected','withdrawn'
                )),
  created_at    timestamptz not null default now(),
  unique (tournament_id, captain_id)
);

create index if not exists idx_tournament_teams_tournament on public.tournament_teams(tournament_id);
create index if not exists idx_tournament_teams_captain on public.tournament_teams(captain_id);

-- ── ROSTER ──────────────────────────────────────────────────────────
create table if not exists public.tournament_team_players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.tournament_teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  role        text not null default 'player' check (role in ('captain','player','substitute')),
  joined_at   timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_tournament_team_players_team on public.tournament_team_players(team_id);

-- ================================================================
-- RLS
-- ================================================================
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_team_players enable row level security;

drop policy if exists tournaments_read_public on public.tournaments;
drop policy if exists tournaments_read_owner on public.tournaments;
drop policy if exists tournaments_read_super on public.tournaments;
drop policy if exists tournaments_insert on public.tournaments;
drop policy if exists tournaments_update on public.tournaments;

-- Anyone can see a tournament once it's past draft/pending review.
create policy tournaments_read_public on public.tournaments for select
  using (status not in ('draft','pending_approval'));
-- The vendor sees their own regardless of status (drafts included).
create policy tournaments_read_owner on public.tournaments for select
  using (public.has_venue_access(venue_id));
create policy tournaments_read_super on public.tournaments for select
  using (public.is_super_admin());

create policy tournaments_insert on public.tournaments for insert
  with check (public.has_venue_access(venue_id, 'manager') or public.is_super_admin());
create policy tournaments_update on public.tournaments for update
  using (public.has_venue_access(venue_id, 'manager') or public.is_super_admin());

drop policy if exists tournament_teams_read_own on public.tournament_teams;
drop policy if exists tournament_teams_read_organizer on public.tournament_teams;
drop policy if exists tournament_teams_read_super on public.tournament_teams;
drop policy if exists tournament_teams_insert on public.tournament_teams;
drop policy if exists tournament_teams_update_captain on public.tournament_teams;

create policy tournament_teams_read_own on public.tournament_teams for select
  using (captain_id = auth.uid() or exists (
    select 1 from public.tournament_team_players tp where tp.team_id = id and tp.user_id = auth.uid()
  ));
create policy tournament_teams_read_organizer on public.tournament_teams for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.has_venue_access(t.venue_id)
  ));
create policy tournament_teams_read_super on public.tournament_teams for select
  using (public.is_super_admin());
-- Row creation itself only ever happens through register_team() (security
-- definer, below) so this just needs to not block that function; direct
-- client inserts are blocked by requiring an impossible condition-free
-- policy is avoided by simply not granting insert to the client role at
-- all — table grants below cover this.
create policy tournament_teams_update_captain on public.tournament_teams for update
  using (captain_id = auth.uid());

drop policy if exists tournament_team_players_read on public.tournament_team_players;
create policy tournament_team_players_read on public.tournament_team_players for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.tournament_teams tt where tt.id = team_id and tt.captain_id = auth.uid())
    or exists (
      select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
      where tt.id = team_id and public.has_venue_access(t.venue_id)
    )
    or public.is_super_admin()
  );

-- A vendor can SEE (not approve — that stays super_admin-only via
-- review_payment(), same as every other booking type today) the payment
-- status of their own tournament's registrations. Nothing here widens
-- visibility into court/event booking payments, which stay exactly as
-- restrictive as before this file.
drop policy if exists pay_vendor_tournament_read on public.payments;
create policy pay_vendor_tournament_read on public.payments for select
  using (booking_type = 'tournament_registration' and public.has_venue_access(venue_id));

-- ================================================================
-- Extend the existing payments system with a third booking type
-- instead of building a new one.
-- ================================================================
alter table public.payments
  add column if not exists tournament_registration_id uuid references public.tournament_teams(id) on delete restrict;

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

select pg_temp.drop_check_constraints('payments', 'booking_type');
alter table public.payments add constraint payments_booking_type_check
  check (booking_type in ('court_booking','event_booking','tournament_registration'));

-- payment_method was esewa/khalti only, even though the UI/admin
-- settings already reference fonepay and bank transfer — widen it
-- here since tournament registration explicitly needs to offer
-- whatever methods a vendor supports.
select pg_temp.drop_check_constraints('payments', 'payment_method');
alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('esewa','khalti','fonepay','bank_transfer'));

-- The old "exactly one of the two FK columns" check can't just be
-- widened — it needs a third branch — so replace it outright the same
-- way play_together_payments.sql replaces changed-shape constraints.
select pg_temp.drop_check_constraints('payments', 'court_booking_id');
alter table public.payments add constraint payments_one_target_check check (
  (booking_type = 'court_booking' and court_booking_id is not null and event_booking_id is null and tournament_registration_id is null) or
  (booking_type = 'event_booking' and event_booking_id is not null and court_booking_id is null and tournament_registration_id is null) or
  (booking_type = 'tournament_registration' and tournament_registration_id is not null and court_booking_id is null and event_booking_id is null)
);

create unique index if not exists payments_one_pending_tournament on public.payments (tournament_registration_id)
  where status = 'PENDING_VERIFICATION' and tournament_registration_id is not null;
create index if not exists idx_payments_tournament_registration on public.payments(tournament_registration_id);

-- ── submit_payment / confirm_free_booking: add the third branch ────
-- CREATE OR REPLACE keeps the same signature, so this cleanly replaces
-- the versions in payments.sql — no duplicate-overload risk.
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

  elsif p_booking_type = 'tournament_registration' then
    declare
      v_team public.tournament_teams;
      v_t    public.tournaments;
    begin
      select * into v_team from public.tournament_teams where id = p_booking_id for update;
      if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
      if v_team.captain_id <> auth.uid() then raise exception 'NOT_YOUR_BOOKING'; end if;
      if v_team.status not in ('payment_pending', 'pending') then raise exception 'BOOKING_ALREADY_PAID'; end if;

      select * into v_t from public.tournaments where id = v_team.tournament_id;
      if now() >= v_t.registration_closes_at then
        update public.tournament_teams set status = 'rejected' where id = p_booking_id;
        raise exception 'REGISTRATION_CLOSED';
      end if;

      v_amount := v_t.fee;
      v_venue := v_t.venue_id;
      v_owner := auth.uid();

      if exists (
        select 1 from public.payments
        where tournament_registration_id = p_booking_id and status = 'PENDING_VERIFICATION'
      ) then
        raise exception 'PAYMENT_ALREADY_PENDING';
      end if;
    end;
  else
    raise exception 'INVALID_BOOKING_TYPE';
  end if;

  if p_payment_method not in ('esewa','khalti','fonepay','bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  select enabled, account_identifier into v_enabled, v_account
    from public.payment_methods where method = p_payment_method;
  if v_enabled is not true and p_booking_type <> 'tournament_registration' then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;

  insert into public.payments (
    booking_type, court_booking_id, event_booking_id, tournament_registration_id,
    venue_id, user_id, payment_method, merchant_account_snapshot,
    expected_amount, transaction_id, screenshot_path
  ) values (
    p_booking_type,
    case when p_booking_type = 'court_booking' then p_booking_id end,
    case when p_booking_type = 'event_booking' then p_booking_id end,
    case when p_booking_type = 'tournament_registration' then p_booking_id end,
    v_venue, v_owner, p_payment_method, v_account,
    v_amount, trim(p_transaction_id), trim(p_screenshot_path)
  ) returning * into v_row;

  if p_booking_type = 'tournament_registration' then
    update public.tournament_teams set status = 'verification_pending' where id = p_booking_id;
  end if;

  return v_row;
end;
$$;
grant execute on function public.submit_payment(text,uuid,text,text,text) to authenticated;

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

-- ── review_payment: add the tournament-registration branch. Approval
-- stays super-admin-only, matching how court/event bookings already
-- work today — vendors get visibility into their tournament's payments
-- but not a new, one-off approval power nothing else in the app has. ──
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

-- ================================================================
-- Tournament lifecycle RPCs
-- ================================================================

create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := (p->>'venue_id')::uuid;
  v_row public.tournaments;
begin
  if not (public.has_venue_access(v_venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.tournaments (
    venue_id, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules
  ) values (
    v_venue_id,
    case when public.is_super_admin() and coalesce(p->>'organizer_type','venue') = 'platform' then null else auth.uid() end,
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules'
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- Draft-only edit — once submitted for review the shape is locked to
-- keep what a super_admin approved from silently changing underneath
-- them. Cancelling and re-drafting is the escape hatch for a vendor who
-- needs to change something after that point.
create or replace function public.update_tournament_draft(p_id uuid, p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'NOT_A_DRAFT'; end if;

  update public.tournaments set
    name = coalesce(p->>'name', name),
    sport = coalesce(p->>'sport', sport),
    banner_url = coalesce(p->>'banner_url', banner_url),
    description = coalesce(p->>'description', description),
    contact_phone = coalesce(p->>'contact_phone', contact_phone),
    starts_at = coalesce((p->>'starts_at')::timestamptz, starts_at),
    ends_at = coalesce((p->>'ends_at')::timestamptz, ends_at),
    registration_opens_at = coalesce((p->>'registration_opens_at')::timestamptz, registration_opens_at),
    registration_closes_at = coalesce((p->>'registration_closes_at')::timestamptz, registration_closes_at),
    match_duration_mins = coalesce((p->>'match_duration_mins')::int, match_duration_mins),
    format = coalesce(p->>'format', format),
    max_teams = coalesce((p->>'max_teams')::int, max_teams),
    min_players_per_team = coalesce((p->>'min_players_per_team')::int, min_players_per_team),
    max_players_per_team = coalesce((p->>'max_players_per_team')::int, max_players_per_team),
    substitute_limit = coalesce((p->>'substitute_limit')::int, substitute_limit),
    registration_mode = coalesce(p->>'registration_mode', registration_mode),
    gender_rule = coalesce(p->>'gender_rule', gender_rule),
    skill_category = coalesce(p->>'skill_category', skill_category),
    fee = coalesce((p->>'fee')::numeric, fee),
    payment_instructions = coalesce(p->>'payment_instructions', payment_instructions),
    refund_policy = coalesce(p->>'refund_policy', refund_policy),
    prize_winner = coalesce(p->>'prize_winner', prize_winner),
    prize_runner_up = coalesce(p->>'prize_runner_up', prize_runner_up),
    prize_mvp = coalesce(p->>'prize_mvp', prize_mvp),
    prize_other = coalesce(p->>'prize_other', prize_other),
    rules_text = coalesce(p->>'rules_text', rules_text),
    equipment_notes = coalesce(p->>'equipment_notes', equipment_notes),
    venue_rules = coalesce(p->>'venue_rules', venue_rules)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_tournament_draft(uuid,jsonb) to authenticated;

-- publish_tournament: draft -> pending_approval (vendor) or straight to
-- published (super_admin's own platform tournament) — mirrors "Super
-- Admin should have appropriate control over exceptional cases".
create or replace function public.publish_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;

  if v_row.name is null or v_row.sport is null or v_row.venue_id is null
     or v_row.max_teams is null or v_row.min_players_per_team is null or v_row.max_players_per_team is null
  then
    raise exception 'INCOMPLETE_TOURNAMENT';
  end if;

  update public.tournaments
    set status = case when public.is_super_admin() then 'published' else 'pending_approval' end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.publish_tournament(uuid) to authenticated;

-- approve_tournament / reject_tournament: super_admin-only, the
-- pending_approval -> published|draft step for a vendor's submission.
create or replace function public.approve_tournament(p_id uuid, p_approve boolean, p_reason text default null)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.status <> 'pending_approval' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments
    set status = case when p_approve then 'published' else 'draft' end,
        cancel_reason = case when p_approve then null else p_reason end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.approve_tournament(uuid,boolean,text) to authenticated;

create or replace function public.open_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'published' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_open' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.open_tournament_registration(uuid) to authenticated;

create or replace function public.close_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'registration_open' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_closed' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.close_tournament_registration(uuid) to authenticated;

-- Best-effort auto-close once the deadline passes (pg_cron, same
-- pattern as expire_stale_play_together_requests) — registration is
-- ALSO re-checked inline inside register_team() below, so a late
-- registration can never sneak through even if this hasn't ticked yet.
create or replace function public.auto_close_expired_tournament_registrations()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  update public.tournaments
    set status = 'registration_closed'
    where status = 'registration_open' and registration_closes_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.auto_close_expired_tournament_registrations() to authenticated;

-- Vendor-or-super_admin, not super_admin-only: once submitted, a
-- tournament's details are locked (update_tournament_draft only allows
-- 'draft'), so cancel-and-redraft is the vendor's only way to fix a
-- mistake after publishing. Restricting this to super_admin left a vendor
-- with no way out of a bad submission.
create or replace function public.cancel_tournament(p_id uuid, p_reason text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;

-- ── Team registration ────────────────────────────────────────────
create or replace function public.register_team(p_tournament_id uuid, p_name text, p_ack_terms boolean)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_count int;
  v_row public.tournament_teams;
begin
  if p_ack_terms is not true then raise exception 'TERMS_NOT_ACKNOWLEDGED'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'TEAM_NAME_REQUIRED'; end if;

  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;
  if now() >= v_t.registration_closes_at then
    update public.tournaments set status = 'registration_closed' where id = p_tournament_id;
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select count(*) into v_count from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_count >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status)
  values (p_tournament_id, trim(p_name), auth.uid(), true, case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end)
  on conflict (tournament_id, captain_id) do update
    set name = excluded.name, ack_terms = true,
        status = case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end
    where public.tournament_teams.status in ('rejected','withdrawn')
  returning * into v_row;

  if v_row.id is null then raise exception 'ALREADY_REGISTERED'; end if;

  -- The captain is always on their own roster.
  insert into public.tournament_team_players (team_id, user_id, role)
  values (v_row.id, auth.uid(), 'captain')
  on conflict (team_id, user_id) do nothing;

  return v_row;
end;
$$;
grant execute on function public.register_team(uuid,text,boolean) to authenticated;

create or replace function public.add_team_player(p_team_id uuid, p_user_id uuid, p_role text default 'player')
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_players int;
  v_subs    int;
  v_row  public.tournament_team_players;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_team.status not in ('pending','payment_pending') then raise exception 'ROSTER_LOCKED'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, user_id, role)
  values (p_team_id, p_user_id, coalesce(p_role, 'player'))
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_team_player(uuid,uuid,text) to authenticated;

create or replace function public.remove_team_player(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if p_user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;
  delete from public.tournament_team_players where team_id = p_team_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_team_player(uuid,uuid) to authenticated;

-- ================================================================
-- NOTIFICATIONS: tournament_id column + new kinds
-- ================================================================
alter table public.notifications add column if not exists tournament_id uuid references public.tournaments(id) on delete cascade;

select pg_temp.drop_check_constraints('notifications', 'kind');
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected',
                   'game_payment_required','game_payment_reminder',
                   'game_payment_submitted','game_payment_verified',
                   'game_payment_rejected','game_payment_expired',
                   'game_host_payment_submitted','game_host_payment_expired',
                   'game_payment_cash_selected',
                   'tournament_published','tournament_registration_submitted',
                   'tournament_payment_verified','tournament_payment_rejected',
                   'tournament_announcement',
                   'tournament_match_scheduled','tournament_venue_booking_updated',
                   'organizer_request_reviewed'));

drop function pg_temp.drop_check_constraints(text, text);

-- ── BEST-EFFORT SCHEDULING (pg_cron) ────────────────────────────────
do $$
begin
  perform cron.unschedule('tournaments-auto-close-registration');
exception
  when others then null;
end $$;
do $$
begin
  perform cron.schedule(
    'tournaments-auto-close-registration',
    '* * * * *',
    $cron$select public.auto_close_expired_tournament_registrations();$cron$
  );
exception
  when undefined_table then null;
  when insufficient_privilege then null;
  when others then null;
end $$;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_fixtures.sql ──
-- ================================================================

-- ================================================================
-- Sportonica — Tournaments Phase 2: fixtures, brackets, standings,
-- scheduling and announcements. Run AFTER tournaments.sql. Safe to
-- re-run.
--
-- Design notes:
--   * Seeding is manual (vendor sets tournament_teams.seed / .group_name
--     before generating fixtures) — no random draw.
--   * A fixture's court+time reuses the SAME conflict-checking pattern
--     as book_court() (admin_schema.sql / booking_phone.sql): lock the
--     court row, check overlap against court_bookings AND court_blocks,
--     raise SLOT_TAKEN / SLOT_BLOCKED. It reserves the slot via
--     court_blocks (tagged with tournament_match_id) rather than
--     court_bookings, because a tournament match has no payer/price —
--     it's the vendor blocking their own court, exactly what
--     court_blocks already models.
--   * Results are vendor-entered directly (record_match_result) — no
--     captain-submission/dispute flow.
--   * Standings use fixed points (win=3, draw=1, loss=0), derived on
--     read from tournament_matches — never stored.
-- ================================================================

-- ── FIXTURES ────────────────────────────────────────────────────────
alter table public.tournament_teams add column if not exists seed int;
alter table public.tournament_teams add column if not exists group_name text;

create table if not exists public.tournament_matches (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  stage           text not null check (stage in ('group','league','knockout')),
  group_name      text,
  round           int not null,
  round_label     text not null,
  team_a_id       uuid references public.tournament_teams(id),
  team_b_id       uuid references public.tournament_teams(id),
  next_match_id   uuid references public.tournament_matches(id),
  next_match_slot text check (next_match_slot in ('a','b')),
  court_id        uuid references public.courts(id),
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text not null default 'unscheduled' check (status in
                    ('unscheduled','scheduled','completed','walkover','cancelled')),
  score_a         int,
  score_b         int,
  winner_team_id  uuid references public.tournament_teams(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (team_a_id is null or team_b_id is null or team_a_id <> team_b_id)
);

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_next on public.tournament_matches(next_match_id);
create index if not exists idx_tournament_matches_court on public.tournament_matches(court_id);

drop trigger if exists tournament_matches_touch on public.tournament_matches;
create trigger tournament_matches_touch before update on public.tournament_matches
  for each row execute function public.set_updated_at();

alter table public.court_blocks add column if not exists tournament_match_id
  uuid references public.tournament_matches(id) on delete set null;
create index if not exists idx_court_blocks_tournament_match on public.court_blocks(tournament_match_id);

create table if not exists public.tournament_announcements (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  body          text,
  posted_by     uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_tournament_announcements_tournament on public.tournament_announcements(tournament_id);

-- ================================================================
-- RLS
-- ================================================================
alter table public.tournament_matches enable row level security;
alter table public.tournament_announcements enable row level security;

drop policy if exists tournament_matches_read_public on public.tournament_matches;
drop policy if exists tournament_matches_read_organizer on public.tournament_matches;
drop policy if exists tournament_matches_read_super on public.tournament_matches;
create policy tournament_matches_read_public on public.tournament_matches for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval')));
create policy tournament_matches_read_organizer on public.tournament_matches for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.has_venue_access(t.venue_id)));
create policy tournament_matches_read_super on public.tournament_matches for select
  using (public.is_super_admin());

drop policy if exists tournament_announcements_read_public on public.tournament_announcements;
drop policy if exists tournament_announcements_read_organizer on public.tournament_announcements;
drop policy if exists tournament_announcements_read_super on public.tournament_announcements;
create policy tournament_announcements_read_public on public.tournament_announcements for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval')));
create policy tournament_announcements_read_organizer on public.tournament_announcements for select
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and public.has_venue_access(t.venue_id)));
create policy tournament_announcements_read_super on public.tournament_announcements for select
  using (public.is_super_admin());

-- Teams were previously visible only to their own captain/roster, the
-- organizer, or a super_admin (tournaments.sql). Brackets/standings need
-- confirmed team names to be publicly visible once the tournament is —
-- same "not in draft/pending_approval" gate as everything else public.
drop policy if exists tournament_teams_read_public on public.tournament_teams;
create policy tournament_teams_read_public on public.tournament_teams for select
  using (
    status = 'confirmed'
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status not in ('draft','pending_approval'))
  );

-- ── Widen existing check constraints (court_blocks.reason, notifications.kind) ──
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

select pg_temp.drop_check_constraints('court_blocks', 'reason');
alter table public.court_blocks add constraint court_blocks_reason_check
  check (reason in ('manual','maintenance','walk_in','phone_booking','offline','tournament_match'));

select pg_temp.drop_check_constraints('notifications', 'kind');
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('joined','left','spots_needed','hosted','event',
                   'friend_request','friend_accepted',
                   'payment_submitted','payment_approved','payment_rejected',
                   'game_published','game_joined','game_left','game_cancelled',
                   'game_join_requested','game_join_rejected',
                   'game_payment_required','game_payment_reminder',
                   'game_payment_submitted','game_payment_verified',
                   'game_payment_rejected','game_payment_expired',
                   'game_host_payment_submitted','game_host_payment_expired',
                   'game_payment_cash_selected',
                   'tournament_published','tournament_registration_submitted',
                   'tournament_payment_verified','tournament_payment_rejected',
                   'tournament_announcement','tournament_match_scheduled',
                   'tournament_venue_booking_updated','organizer_request_reviewed'));

drop function pg_temp.drop_check_constraints(text, text);

-- ================================================================
-- Internal helpers (no grants — only ever called from the security
-- definer RPCs below, running as the function owner).
-- ================================================================

create or replace function public.tournament_round_label(p_round int, p_rounds int)
returns text language sql immutable as $$
  select case
    when p_round = p_rounds then 'Final'
    when p_round = p_rounds - 1 then 'Semifinal'
    when p_round = p_rounds - 2 then 'Quarterfinal'
    else 'Round ' || p_round
  end;
$$;

-- Builds a single-elimination bracket from an ordered (seeded) list of
-- team ids. Byes go to the top `pow2 - n` seeds (standard convention) —
-- guaranteed to be fewer than the number of round-1 pairs, so no pair
-- ever gets two byes. Round-1 byes auto-complete and propagate
-- immediately since only one bye level is ever possible this way.
create or replace function public.build_knockout_bracket(p_tournament_id uuid, p_team_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_team_ids, 1), 0);
  v_pow int := 1;
  v_rounds int := 0;
  v_byes int;
  v_cur_ids uuid[] := '{}';
  v_next_ids uuid[];
  v_round int;
  v_matches_in_round int;
  v_i int;
  v_match_id uuid;
  v_left uuid;
  v_right uuid;
  v_label text;
  v_bye record;
begin
  if v_n < 2 then raise exception 'NOT_ENOUGH_TEAMS'; end if;

  while v_pow < v_n loop
    v_pow := v_pow * 2;
    v_rounds := v_rounds + 1;
  end loop;
  v_byes := v_pow - v_n;

  for v_i in 1..v_byes loop
    v_label := public.tournament_round_label(1, v_rounds);
    insert into public.tournament_matches (tournament_id, stage, round, round_label, team_a_id, status, winner_team_id)
    values (p_tournament_id, 'knockout', 1, v_label, p_team_ids[v_i], 'completed', p_team_ids[v_i])
    returning id into v_match_id;
    v_cur_ids := v_cur_ids || v_match_id;
  end loop;

  v_i := v_byes + 1;
  while v_i < v_n loop
    v_label := public.tournament_round_label(1, v_rounds);
    insert into public.tournament_matches (tournament_id, stage, round, round_label, team_a_id, team_b_id, status)
    values (p_tournament_id, 'knockout', 1, v_label, p_team_ids[v_i], p_team_ids[v_i + 1], 'unscheduled')
    returning id into v_match_id;
    v_cur_ids := v_cur_ids || v_match_id;
    v_i := v_i + 2;
  end loop;

  for v_round in 2..v_rounds loop
    v_matches_in_round := array_length(v_cur_ids, 1) / 2;
    v_next_ids := '{}';
    for v_i in 1..v_matches_in_round loop
      v_label := public.tournament_round_label(v_round, v_rounds);
      insert into public.tournament_matches (tournament_id, stage, round, round_label, status)
      values (p_tournament_id, 'knockout', v_round, v_label, 'unscheduled')
      returning id into v_match_id;
      v_next_ids := v_next_ids || v_match_id;

      v_left := v_cur_ids[(v_i - 1) * 2 + 1];
      v_right := v_cur_ids[(v_i - 1) * 2 + 2];
      update public.tournament_matches set next_match_id = v_match_id, next_match_slot = 'a' where id = v_left;
      update public.tournament_matches set next_match_id = v_match_id, next_match_slot = 'b' where id = v_right;
    end loop;
    v_cur_ids := v_next_ids;
  end loop;

  for v_bye in
    select id, team_a_id from public.tournament_matches
    where tournament_id = p_tournament_id and stage = 'knockout' and round = 1 and status = 'completed'
  loop
    perform public.propagate_match_winner(v_bye.id, v_bye.team_a_id);
  end loop;
end;
$$;

-- Round-robin over an ordered team list using the standard "circle
-- method" so no team plays twice in the same round. Used for both
-- league (p_group_name null) and each group of a group_knockout
-- tournament (called once per group).
create or replace function public.build_round_robin(p_tournament_id uuid, p_stage text, p_group_name text, p_team_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_team_ids, 1), 0);
  v_arr uuid[] := p_team_ids;
  v_rounds int;
  v_round int;
  v_i int;
  v_home uuid;
  v_away uuid;
  v_label text;
begin
  if v_n < 2 then raise exception 'NOT_ENOUGH_TEAMS'; end if;
  if v_n % 2 = 1 then
    v_arr := v_arr || null::uuid;
    v_n := v_n + 1;
  end if;
  v_rounds := v_n - 1;

  for v_round in 1..v_rounds loop
    v_label := coalesce(p_group_name || ' · ', '') || 'Round ' || v_round;
    for v_i in 1..(v_n / 2) loop
      v_home := v_arr[v_i];
      v_away := v_arr[v_n - v_i + 1];
      if v_home is not null and v_away is not null then
        insert into public.tournament_matches (tournament_id, stage, group_name, round, round_label, team_a_id, team_b_id, status)
        values (p_tournament_id, p_stage, p_group_name, v_round, v_label, v_home, v_away, 'unscheduled');
      end if;
    end loop;
    v_arr := array[v_arr[1]] || v_arr[v_n] || v_arr[2:v_n - 1];
  end loop;
end;
$$;

create or replace function public.propagate_match_winner(p_match_id uuid, p_winner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if not found or v_match.next_match_id is null then return; end if;

  if v_match.next_match_slot = 'a' then
    update public.tournament_matches set team_a_id = p_winner_id where id = v_match.next_match_id;
  else
    update public.tournament_matches set team_b_id = p_winner_id where id = v_match.next_match_id;
  end if;
end;
$$;

-- ================================================================
-- Standings — always derived, fixed points (win=3, draw=1, loss=0).
-- Defined before generate_knockout_from_groups(), which reads from it.
-- ================================================================
-- Dropped unconditionally before the first create: this function's
-- OUT-parameter row shape widens later in this same file (adds goals_for/
-- goals_against/goal_diff) — replaying the file against a database that
-- already has the wide version live otherwise fails with "cannot change
-- return type of existing function" the moment this narrower version
-- below tries to redefine it without a preceding drop.
drop function if exists public.tournament_standings(uuid,text);
create or replace function public.tournament_standings(p_tournament_id uuid, p_group_name text default null)
returns table(team_id uuid, team_name text, played int, won int, drawn int, lost int, points int)
language sql stable as $$
  with relevant_matches as (
    select * from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and m.stage in ('league','group')
      and (p_group_name is null or m.group_name = p_group_name)
      and m.status in ('completed','walkover')
  )
  select
    t.id as team_id,
    t.name as team_name,
    count(rm.id)::int as played,
    count(rm.id) filter (where rm.winner_team_id = t.id)::int as won,
    count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b)::int as drawn,
    count(rm.id) filter (where rm.winner_team_id is not null and rm.winner_team_id <> t.id)::int as lost,
    (count(rm.id) filter (where rm.winner_team_id = t.id) * 3
     + count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b))::int as points
  from public.tournament_teams t
  left join relevant_matches rm on (rm.team_a_id = t.id or rm.team_b_id = t.id)
  where t.tournament_id = p_tournament_id and t.status = 'confirmed'
    and (p_group_name is null or t.group_name = p_group_name)
  group by t.id, t.name
  order by points desc, won desc, team_name asc;
$$;
grant execute on function public.tournament_standings(uuid,text) to anon, authenticated;

-- ================================================================
-- Seeding
-- ================================================================
create or replace function public.set_team_seed(p_team_id uuid, p_seed int, p_group_name text default null)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if v_team.status <> 'confirmed' then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  update public.tournament_teams
    set seed = p_seed, group_name = coalesce(p_group_name, group_name)
    where id = p_team_id
    returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.set_team_seed(uuid,int,text) to authenticated;

-- ================================================================
-- Fixture generation (registration_closed -> live)
-- ================================================================
create or replace function public.generate_knockout_bracket(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_knockout_bracket(p_tournament_id, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_knockout_bracket(uuid) to authenticated;

create or replace function public.generate_league_fixtures(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'league' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_round_robin(p_tournament_id, 'league', null, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_league_fixtures(uuid) to authenticated;

create or replace function public.generate_group_fixtures(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_group text;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'group_knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;
  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is null
  ) then
    raise exception 'TEAMS_NOT_GROUPED';
  end if;

  for v_group in
    select distinct group_name from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed'
    order by group_name
  loop
    select array_agg(id order by seed nulls last, created_at) into v_team_ids
      from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'confirmed' and group_name = v_group;
    perform public.build_round_robin(p_tournament_id, 'group', v_group, v_team_ids);
  end loop;

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_group_fixtures(uuid) to authenticated;

create or replace function public.generate_knockout_from_groups(p_tournament_id uuid, p_advance_per_group int default 2)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_group text;
  v_advancing uuid[] := '{}';
  v_group_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'group_knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'live' then raise exception 'INVALID_TRANSITION'; end if;
  if p_advance_per_group < 1 then raise exception 'INVALID_ADVANCE_COUNT'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id and stage = 'knockout') then
    raise exception 'ALREADY_GENERATED';
  end if;
  if exists (
    select 1 from public.tournament_matches
    where tournament_id = p_tournament_id and stage = 'group' and status not in ('completed','walkover','cancelled')
  ) then
    raise exception 'GROUP_STAGE_INCOMPLETE';
  end if;

  for v_group in
    select distinct group_name from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'confirmed' and group_name is not null
    order by group_name
  loop
    select array_agg(team_id) into v_group_ids from (
      select team_id from public.tournament_standings(p_tournament_id, v_group)
      order by points desc, won desc, team_name asc
      limit p_advance_per_group
    ) s;
    v_advancing := v_advancing || coalesce(v_group_ids, '{}'::uuid[]);
  end loop;

  perform public.build_knockout_bracket(p_tournament_id, v_advancing);

  return v_t;
end;
$$;
grant execute on function public.generate_knockout_from_groups(uuid,int) to authenticated;

-- ================================================================
-- Scheduling — reuses book_court()'s lock-then-check pattern
-- (admin_schema.sql / booking_phone.sql) but reserves the slot via
-- court_blocks, not court_bookings (no payer/price on a tournament
-- match).
-- ================================================================
create or replace function public.schedule_match(p_match_id uuid, p_court_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_court_venue uuid;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_TIME_RANGE'; end if;

  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status in ('completed','walkover','cancelled') then raise exception 'MATCH_ALREADY_DONE'; end if;

  select venue_id into v_court_venue from public.courts where id = p_court_id;
  if v_court_venue is null then raise exception 'COURT_NOT_FOUND'; end if;
  if v_court_venue <> v_t.venue_id then raise exception 'COURT_NOT_IN_VENUE'; end if;

  perform 1 from public.courts where id = p_court_id for update;

  if exists (
    select 1 from public.court_bookings
    where court_id = p_court_id
      and state not in ('dropped','no_show','refunded','cancelled')
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  if exists (
    select 1 from public.court_blocks
    where court_id = p_court_id
      and (tournament_match_id is null or tournament_match_id <> p_match_id)
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'SLOT_BLOCKED';
  end if;

  delete from public.court_blocks where tournament_match_id = p_match_id;

  insert into public.court_blocks (court_id, starts_at, ends_at, reason, note, created_by, tournament_match_id)
  values (p_court_id, p_starts_at, p_ends_at, 'tournament_match', v_t.name || ' — ' || v_match.round_label, auth.uid(), p_match_id);

  update public.tournament_matches
    set court_id = p_court_id, starts_at = p_starts_at, ends_at = p_ends_at, status = 'scheduled'
    where id = p_match_id
    returning * into v_match;

  insert into public.notifications (user_id, kind, title, body, tournament_id, actor_id)
  select captain_id, 'tournament_match_scheduled', v_t.name || ' — match scheduled',
         v_match.round_label || ' is scheduled for ' || to_char(p_starts_at, 'DD Mon, HH24:MI'),
         v_t.id, auth.uid()
  from public.tournament_teams where id in (v_match.team_a_id, v_match.team_b_id);

  return v_match;
end;
$$;
grant execute on function public.schedule_match(uuid,uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.unschedule_match(p_match_id uuid)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status <> 'scheduled' then raise exception 'INVALID_TRANSITION'; end if;

  delete from public.court_blocks where tournament_match_id = p_match_id;

  update public.tournament_matches
    set court_id = null, starts_at = null, ends_at = null, status = 'unscheduled'
    where id = p_match_id
    returning * into v_match;
  return v_match;
end;
$$;
grant execute on function public.unschedule_match(uuid) to authenticated;

-- ================================================================
-- Results — vendor-entered, trusted-organizer model.
-- ================================================================
-- Dropped unconditionally first: this function's parameter list grows
-- twice later in this file (extra time/penalties, then confirm_cascade)
-- — see the tournament_standings comment above for why replaying
-- against an already-current database needs this.
drop function if exists public.record_match_result(uuid,int,int,uuid);
create or replace function public.record_match_result(p_match_id uuid, p_score_a int default null, p_score_b int default null, p_winner_team_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner, score_a = null, score_b = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;
    if p_score_a = p_score_b and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;
    v_winner := case when p_score_a > p_score_b then v_match.team_a_id
                      when p_score_b > p_score_a then v_match.team_b_id
                      else null end;
    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b, winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid) to authenticated;

-- ================================================================
-- Lifecycle: live -> completed
-- ================================================================
create or replace function public.complete_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'live' then raise exception 'INVALID_TRANSITION'; end if;
  if exists (
    select 1 from public.tournament_matches
    where tournament_id = p_id and status not in ('completed','walkover','cancelled')
  ) then
    raise exception 'INCOMPLETE_MATCHES';
  end if;

  update public.tournaments set status = 'completed' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.complete_tournament(uuid) to authenticated;

-- ================================================================
-- Announcements
-- ================================================================
create or replace function public.post_tournament_announcement(p_tournament_id uuid, p_title text, p_body text default null)
returns public.tournament_announcements
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_row public.tournament_announcements;
begin
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.tournament_announcements (tournament_id, title, body, posted_by)
  values (p_tournament_id, trim(p_title), p_body, auth.uid())
  returning * into v_row;

  insert into public.notifications (user_id, kind, title, body, tournament_id, actor_id)
  select captain_id, 'tournament_announcement', v_t.name || ': ' || v_row.title, v_row.body, v_t.id, auth.uid()
  from public.tournament_teams
  where tournament_id = p_tournament_id and status = 'confirmed';

  return v_row;
end;
$$;
grant execute on function public.post_tournament_announcement(uuid,text,text) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_single_event.sql ──
-- ================================================================

-- ================================================================
-- Sportonica — Tournaments: 'single_event' format. Run AFTER
-- tournament_fixtures.sql. Safe to re-run.
--
-- Folds the old vendor "Events" feature (/admin/events, /platform/events —
-- venue_event/platform_event rows in the legacy `events` table) into
-- Tournaments as a lightweight format, instead of running two parallel
-- systems. A "single event" is structurally just a tournament where every
-- team's roster is capped at one player (captain-only, no bracket) — so
-- registration, payment, roster and notifications are already handled by
-- register_team()/the existing payment RPCs unchanged. The only new piece
-- is a lifecycle step that skips fixture generation entirely.
--
-- Explicitly NOT touched: the legacy `events`/`bookings` tables, the
-- "need players?" court-booking toggle (maybe_publish_hosted_event(),
-- payments.sql), and Play Together (games/game_players) — all unrelated
-- to this merge and left exactly as they are. Existing venue_event/
-- platform_event rows are not migrated; they keep showing wherever they
-- do today until they age past their date.
-- ================================================================

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

select pg_temp.drop_check_constraints('tournaments', 'format');
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('knockout','league','group_knockout','single_event'));

drop function pg_temp.drop_check_constraints(text, text);

-- registration_closed -> live, no fixtures — mirrors
-- close_tournament_registration()'s shape (tournaments.sql).
create or replace function public.start_single_event(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.format <> 'single_event' then raise exception 'WRONG_FORMAT'; end if;
  if v_row.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'live' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.start_single_event(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_banner_storage.sql ──
-- ================================================================

-- ================================================================
-- STORAGE: tournament banner images.
-- Public read (shown on public tournament cards/pages); owner-scoped
-- insert, keyed by the uploader's own auth.uid() folder — same shape as
-- payment-qr / host-qr in supabase/payments.sql & play_together.ts.
-- ================================================================
insert into storage.buckets (id, name, public)
  values ('tournament-banners', 'tournament-banners', true)
  on conflict (id) do nothing;

drop policy if exists tournament_banner_read on storage.objects;
drop policy if exists tournament_banner_owner_insert on storage.objects;

create policy tournament_banner_read on storage.objects for select
  using (bucket_id = 'tournament-banners');

create policy tournament_banner_owner_insert on storage.objects for insert
  with check (bucket_id = 'tournament-banners' and (storage.foldername(name))[1] = auth.uid()::text);


-- ================================================================
-- ── originally: tournament_vendor_cancel.sql ──
-- ================================================================

-- ================================================================
-- Fix: cancel_tournament() was super_admin-only, leaving a vendor with
-- no way to recover from a mistake after publishing (update_tournament_draft
-- only allows edits while status = 'draft', so cancel-and-redraft is the
-- only escape hatch). Widen it to match tournaments.sql's stated intent:
-- the tournament's own venue manager, or a super_admin. Safe to re-run.
-- ================================================================
create or replace function public.cancel_tournament(p_id uuid, p_reason text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;


-- ================================================================
-- ── originally: tournament_own_venue_maps_link.sql ──
-- ================================================================

-- ================================================================
-- Sportonica — own-venue tournaments get a location the same way real
-- venues do: paste a Google Maps link (parseMapsUrl() in
-- src/lib/admin/location.ts already parses it into lat/lng), not a
-- browser-geolocation pin. Run AFTER organizer_approval_and_own_venue.sql.
-- Safe to re-run.
-- ================================================================

alter table public.tournaments add column if not exists own_venue_map_url text;

create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := nullif(p->>'venue_id', '')::uuid;
  v_own_venue_name text := nullif(trim(p->>'own_venue_name'), '');
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  if v_venue_id is not null then
    select owner_id into v_vendor_id from public.venues where id = v_venue_id;
    if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;
    if not (
      public.is_organizer()
      and exists (
        select 1 from public.partnerships
        where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
      )
    ) then
      raise exception 'FORBIDDEN';
    end if;
  elsif v_own_venue_name is not null then
    if not public.is_organizer() then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.tournaments (
    venue_id, own_venue_name, own_venue_address, own_venue_map_url, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
    nullif(trim(p->>'own_venue_map_url'), ''),
    (p->>'own_venue_lat')::double precision, (p->>'own_venue_lng')::double precision,
    case when v_venue_id is null then 'confirmed' else 'pending' end,
    auth.uid(),
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules'
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_publish_own_venue_fix.sql ──
-- ================================================================

-- ================================================================
-- Fix: publish_tournament()'s completeness check required venue_id to
-- be non-null unconditionally — but an "own venue" tournament (see
-- organizer_approval_and_own_venue.sql) legitimately has venue_id = null
-- and uses own_venue_name instead, so it could never pass this check and
-- always failed with "Fill in the required fields before publishing"
-- regardless of what was actually filled in. Run any time. Safe to re-run.
-- ================================================================

create or replace function public.publish_tournament(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  if v_row.venue_booking_status <> 'confirmed' then raise exception 'VENUE_NOT_CONFIRMED'; end if;

  if v_row.name is null or v_row.sport is null
     or (v_row.venue_id is null and v_row.own_venue_name is null)
     or v_row.max_teams is null or v_row.min_players_per_team is null or v_row.max_players_per_team is null
  then
    raise exception 'INCOMPLETE_TOURNAMENT';
  end if;

  update public.tournaments
    set status = case when public.is_super_admin() then 'published' else 'pending_approval' end
    where id = p_id returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.publish_tournament(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_teams_rls_recursion_fix.sql ──
-- ================================================================

-- ================================================================
-- Fix: "infinite recursion detected in policy for relation
-- tournament_teams" — a genuine circular RLS dependency that's been
-- latent since tournaments.sql (Phase 1), not something introduced by
-- the later organizer/own-venue work:
--
--   tournament_teams_read_own (on tournament_teams) subqueries
--   tournament_team_players → tournament_team_players_read (on
--   tournament_team_players) subqueries tournament_teams → Postgres
--   has to re-enter tournament_teams' own RLS to evaluate that subquery,
--   which requires evaluating tournament_teams_read_own again, forever.
--
-- Standard Postgres fix (already used in this codebase for exactly this
-- reason — see has_venue_access()/is_super_admin() in admin_schema.sql/
-- payments.sql): move the cross-table check into a SECURITY DEFINER
-- function. Such a function runs as its owner (the Postgres superuser
-- role in Supabase), which bypasses RLS entirely — so calling it from
-- tournament_teams' policy no longer re-triggers
-- tournament_team_players' user-facing RLS at all, breaking the cycle
-- from every direction a query can enter it.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.user_on_team_roster(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_team_players
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

drop policy if exists tournament_teams_read_own on public.tournament_teams;
create policy tournament_teams_read_own on public.tournament_teams for select
  using (captain_id = auth.uid() or public.user_on_team_roster(id));

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_roster_edit_window.sql ──
-- ================================================================

-- ================================================================
-- Fix: a captain could only add teammates while their team was still
-- 'pending'/'payment_pending' — but a free tournament (fee = 0)
-- confirms a team immediately on registration (see register_team()),
-- so a solo captain in a free tournament had no window at all to add
-- anyone. The right boundary is the TOURNAMENT's registration window,
-- not the team's own payment/verification state — a captain should be
-- able to manage their roster any time registration is still open,
-- confirmed or not, and lose that ability once it closes (rosters need
-- to be stable before seeding/fixtures). remove_team_player had no
-- window check at all before this — added the same one for consistency
-- (a roster shouldn't be editable after registration closes either way).
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.add_team_player(p_team_id uuid, p_user_id uuid, p_role text default 'player')
returns public.tournament_team_players
language plpgsql security definer set search_path = public as $$
declare
  v_team public.tournament_teams;
  v_t    public.tournaments;
  v_players int;
  v_subs    int;
  v_row  public.tournament_team_players;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_team.status in ('rejected','withdrawn') then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  select count(*) filter (where role <> 'substitute'), count(*) filter (where role = 'substitute')
    into v_players, v_subs
    from public.tournament_team_players where team_id = p_team_id;

  if p_role = 'substitute' then
    if v_subs >= v_t.substitute_limit then raise exception 'SUBSTITUTE_LIMIT_REACHED'; end if;
  else
    if v_players >= v_t.max_players_per_team then raise exception 'ROSTER_FULL'; end if;
  end if;

  insert into public.tournament_team_players (team_id, user_id, role)
  values (p_team_id, p_user_id, coalesce(p_role, 'player'))
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.add_team_player(uuid,uuid,text) to authenticated;

create or replace function public.remove_team_player(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if v_team.captain_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if p_user_id = v_team.captain_id then raise exception 'CANNOT_REMOVE_CAPTAIN'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_t.status <> 'registration_open' then raise exception 'ROSTER_LOCKED'; end if;

  delete from public.tournament_team_players where team_id = p_team_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_team_player(uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_payment_playtogether_regression_fix.sql ──
-- ================================================================

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


-- ================================================================
-- ── originally: tournament_walkin_teams.sql ──
-- ================================================================

-- ================================================================
-- Walk-in teams: lets whoever manages a tournament (its Organizer,
-- the hosting venue's manager, or Super Admin) register a team on
-- behalf of people who signed up in person rather than through the
-- app — no Sportonica account needed for any of them. Each member
-- gets a name + phone (required) and an optional email, stored
-- directly on the roster row instead of a user_id.
--
-- Payment still gets tracked (per the existing "confirmed vs
-- payment_pending" team status), matching how every other paid
-- registration works — the difference is there's no online proof-of-
-- payment step for a walk-in (the admin collected cash/whatever in
-- person), so a dedicated mark_walkin_team_paid() RPC flips the
-- status directly instead of going through submit_payment()/
-- review_payment()'s screenshot-review flow.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_teams alter column captain_id drop not null;
alter table public.tournament_teams add column if not exists is_walkin boolean not null default false;
alter table public.tournament_teams add column if not exists created_by uuid references auth.users(id);

alter table public.tournament_team_players alter column user_id drop not null;
alter table public.tournament_team_players add column if not exists guest_name text;
alter table public.tournament_team_players add column if not exists guest_phone text;
alter table public.tournament_team_players add column if not exists guest_email text;

alter table public.tournament_team_players drop constraint if exists ttp_user_or_guest_check;
alter table public.tournament_team_players add constraint ttp_user_or_guest_check check (
  (user_id is not null and guest_name is null and guest_phone is null and guest_email is null)
  or (user_id is null and length(trim(coalesce(guest_name, ''))) > 0 and length(trim(coalesce(guest_phone, ''))) > 0)
);

-- ── Read access: is_tournament_organizer() (own-venue tournaments —
-- no vendor, so has_venue_access() alone can't see these) wasn't
-- included in the original read policies below, which means an
-- own-venue Organizer couldn't even see their own teams. Additive
-- policies (RLS OR's every permissive policy together), so this only
-- ever widens access, never narrows what already worked. ───────────
drop policy if exists tournament_teams_read_organizer2 on public.tournament_teams;
create policy tournament_teams_read_organizer2 on public.tournament_teams for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists tournament_team_players_read_organizer2 on public.tournament_team_players;
create policy tournament_team_players_read_organizer2 on public.tournament_team_players for select
  using (exists (
    select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id
    where tt.id = team_id and public.is_tournament_organizer(t)
  ));

-- ── create_walkin_team: p_members is a jsonb array of
-- {name, phone, email?}. First member becomes the roster's 'captain'
-- (display-only — there's no real captain_id/account behind it). ──
create or replace function public.create_walkin_team(
  p_tournament_id uuid,
  p_team_name     text,
  p_members       jsonb
) returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.tournaments;
  v_team    public.tournament_teams;
  v_member  jsonb;
  v_name    text;
  v_phone   text;
  v_email   text;
  v_count   int;
  v_existing int;
  i         int;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;

  if p_team_name is null or length(trim(p_team_name)) = 0 then raise exception 'TEAM_NAME_REQUIRED'; end if;

  v_count := coalesce(jsonb_array_length(p_members), 0);
  if v_count = 0 then raise exception 'AT_LEAST_ONE_MEMBER_REQUIRED'; end if;
  if v_count > v_t.max_players_per_team + v_t.substitute_limit then raise exception 'TOO_MANY_PLAYERS'; end if;

  select count(*) into v_existing from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_existing >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status, is_walkin, created_by)
  values (
    p_tournament_id, trim(p_team_name), null, true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    true, auth.uid()
  ) returning * into v_team;

  for i in 0 .. v_count - 1 loop
    v_member := p_members -> i;
    v_name  := trim(coalesce(v_member->>'name', ''));
    v_phone := trim(coalesce(v_member->>'phone', ''));
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    if v_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
    values (v_team.id, v_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb) to authenticated;

-- ── mark_walkin_team_paid: the walk-in equivalent of review_payment()
-- APPROVE — no payments row exists for these, so there's nothing for
-- the Payments console to review. ──────────────────────────────────
create or replace function public.mark_walkin_team_paid(p_team_id uuid)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  if not v_team.is_walkin then raise exception 'NOT_A_WALKIN_TEAM'; end if;

  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_team.status <> 'payment_pending' then raise exception 'NOT_PENDING_PAYMENT'; end if;

  update public.tournament_teams set status = 'confirmed' where id = p_team_id returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.mark_walkin_team_paid(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_player_stats.sql ──
-- ================================================================

-- ================================================================
-- Per-player match stats (goals, man-of-the-match) + linking a
-- walk-in roster spot to a real account once someone signs up or
-- logs in with the same phone/email a walk-in team member was
-- registered with — their goals/performance then show up on their
-- own profile automatically, no manual re-entry.
-- Run any time. Safe to re-run.
-- ================================================================

create table if not exists public.tournament_match_player_stats (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.tournament_matches(id) on delete cascade,
  team_player_id uuid not null references public.tournament_team_players(id) on delete cascade,
  goals          int not null default 0 check (goals >= 0),
  is_mom         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (match_id, team_player_id)
);
create index if not exists idx_tmps_match on public.tournament_match_player_stats(match_id);
create index if not exists idx_tmps_team_player on public.tournament_match_player_stats(team_player_id);

drop trigger if exists tmps_touch on public.tournament_match_player_stats;
create trigger tmps_touch before update on public.tournament_match_player_stats
  for each row execute function public.set_updated_at();

-- Same audience as the roster itself (tournament_team_players_read):
-- a player on the team, that team's own record via captain/roster,
-- whoever manages the tournament, or Super Admin. No wider public
-- exposure than what a team's roster already has.
alter table public.tournament_match_player_stats enable row level security;
drop policy if exists tmps_read on public.tournament_match_player_stats;
create policy tmps_read on public.tournament_match_player_stats for select
  using (exists (
    select 1 from public.tournament_team_players tp
    join public.tournament_teams tt on tt.id = tp.team_id
    where tp.id = team_player_id
      and (
        tp.user_id = auth.uid()
        or tt.captain_id = auth.uid()
        or exists (select 1 from public.tournaments t where t.id = tt.tournament_id and public.has_venue_access(t.venue_id))
        or exists (select 1 from public.tournaments t where t.id = tt.tournament_id and public.is_tournament_organizer(t))
        or public.is_super_admin()
      )
  ));

-- ── record_match_player_stats: organizer/venue-manager/admin only.
-- p_stats is a jsonb array of {team_player_id, goals, is_mom}. Upserts
-- every row it's given; doesn't touch stats for players not included. ──
create or replace function public.record_match_player_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t     public.tournaments;
  v_stat  jsonb;
  v_tp_id uuid;
  v_valid boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status <> 'completed' then raise exception 'MATCH_NOT_COMPLETED'; end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb))
  loop
    v_tp_id := (v_stat->>'team_player_id')::uuid;

    select exists (
      select 1 from public.tournament_team_players
      where id = v_tp_id and team_id in (v_match.team_a_id, v_match.team_b_id)
    ) into v_valid;
    if not v_valid then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, is_mom)
    values (p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'is_mom')::boolean, false))
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, is_mom = excluded.is_mom, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── get_player_scorecard: aggregate career stats for one linked
-- account, across every tournament they've actually played. Safe to
-- expose publicly on a profile page — no more revealing than a total
-- games-played counter already shown there. ────────────────────────
create or replace function public.get_player_scorecard(p_user_id uuid)
returns table (
  goals              bigint,
  matches_played     bigint,
  tournaments_played bigint,
  mom_count          bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(s.goals), 0)                          as goals,
    count(distinct s.match_id)                         as matches_played,
    count(distinct tt.tournament_id)                   as tournaments_played,
    count(*) filter (where s.is_mom)                   as mom_count
  from public.tournament_match_player_stats s
  join public.tournament_team_players tp on tp.id = s.team_player_id
  join public.tournament_teams tt on tt.id = tp.team_id
  where tp.user_id = p_user_id;
$$;
grant execute on function public.get_player_scorecard(uuid) to authenticated, anon;

-- ── claim_guest_tournament_entries: called after sign-in/sign-up (and
-- after saving a profile phone number) — links any walk-in roster spot
-- whose guest_phone/guest_email matches the caller's own auth phone/
-- email or profile phone, so their history becomes theirs. Phone
-- comparison uses the last 10 digits so a "98XXXXXXXX" entered by an
-- admin at the desk still matches a "+97798XXXXXXXX" account phone. ──
create or replace function public.claim_guest_tournament_entries()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_email text;
  v_count int;
begin
  select au.phone, au.email into v_phone, v_email from auth.users au where au.id = auth.uid();
  if v_phone is null or length(trim(v_phone)) = 0 then
    select phone into v_phone from public.profiles where id = auth.uid();
  end if;

  update public.tournament_team_players
  set user_id = auth.uid()
  where user_id is null
    and (
      (v_phone is not null and guest_phone is not null
        and right(regexp_replace(guest_phone, '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
        and length(regexp_replace(guest_phone, '\D', '', 'g')) >= 7)
      or (v_email is not null and guest_email is not null and lower(trim(guest_email)) = lower(trim(v_email)))
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.claim_guest_tournament_entries() to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_cards_fines.sql ──
-- ================================================================

-- ================================================================
-- Yellow/red card tracking + disciplinary fines, recorded alongside
-- goals in the existing per-match player stats system
-- (tournament_player_stats.sql). Fine amounts are per-tournament
-- (an organizer sets Rs/card once when creating it, defaulting to 0 —
-- untracked) rather than hardcoded, since different tournaments set
-- their own rates.
--
-- create_tournament()/update_tournament_draft() are redeclared here
-- with the two new fields added on top of their current bodies
-- (tournament_own_venue_maps_link.sql / organizer_partnerships.sql
-- respectively) — same "whichever ran last wins" reason flagged in
-- tournament_payment_playtogether_regression_fix.sql: `create or
-- replace` has no merge, so adding a column means re-declaring the
-- whole function, not just the new part.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournaments add column if not exists yellow_card_fine numeric(10,2) not null default 0 check (yellow_card_fine >= 0);
alter table public.tournaments add column if not exists red_card_fine numeric(10,2) not null default 0 check (red_card_fine >= 0);

alter table public.tournament_match_player_stats add column if not exists yellow_cards int not null default 0 check (yellow_cards between 0 and 2);
alter table public.tournament_match_player_stats add column if not exists red_card boolean not null default false;

create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := nullif(p->>'venue_id', '')::uuid;
  v_own_venue_name text := nullif(trim(p->>'own_venue_name'), '');
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  if v_venue_id is not null then
    select owner_id into v_vendor_id from public.venues where id = v_venue_id;
    if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;
    if not (
      public.is_organizer()
      and exists (
        select 1 from public.partnerships
        where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
      )
    ) then
      raise exception 'FORBIDDEN';
    end if;
  elsif v_own_venue_name is not null then
    if not public.is_organizer() then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.tournaments (
    venue_id, own_venue_name, own_venue_address, own_venue_map_url, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules, yellow_card_fine, red_card_fine
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
    nullif(trim(p->>'own_venue_map_url'), ''),
    (p->>'own_venue_lat')::double precision, (p->>'own_venue_lng')::double precision,
    case when v_venue_id is null then 'confirmed' else 'pending' end,
    auth.uid(),
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules',
    coalesce((p->>'yellow_card_fine')::numeric, 0), coalesce((p->>'red_card_fine')::numeric, 0)
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

create or replace function public.update_tournament_draft(p_id uuid, p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'draft' then raise exception 'NOT_A_DRAFT'; end if;

  update public.tournaments set
    name = coalesce(p->>'name', name),
    sport = coalesce(p->>'sport', sport),
    banner_url = coalesce(p->>'banner_url', banner_url),
    description = coalesce(p->>'description', description),
    contact_phone = coalesce(p->>'contact_phone', contact_phone),
    starts_at = coalesce((p->>'starts_at')::timestamptz, starts_at),
    ends_at = coalesce((p->>'ends_at')::timestamptz, ends_at),
    registration_opens_at = coalesce((p->>'registration_opens_at')::timestamptz, registration_opens_at),
    registration_closes_at = coalesce((p->>'registration_closes_at')::timestamptz, registration_closes_at),
    match_duration_mins = coalesce((p->>'match_duration_mins')::int, match_duration_mins),
    format = coalesce(p->>'format', format),
    max_teams = coalesce((p->>'max_teams')::int, max_teams),
    min_players_per_team = coalesce((p->>'min_players_per_team')::int, min_players_per_team),
    max_players_per_team = coalesce((p->>'max_players_per_team')::int, max_players_per_team),
    substitute_limit = coalesce((p->>'substitute_limit')::int, substitute_limit),
    registration_mode = coalesce(p->>'registration_mode', registration_mode),
    gender_rule = coalesce(p->>'gender_rule', gender_rule),
    skill_category = coalesce(p->>'skill_category', skill_category),
    fee = coalesce((p->>'fee')::numeric, fee),
    payment_instructions = coalesce(p->>'payment_instructions', payment_instructions),
    refund_policy = coalesce(p->>'refund_policy', refund_policy),
    prize_winner = coalesce(p->>'prize_winner', prize_winner),
    prize_runner_up = coalesce(p->>'prize_runner_up', prize_runner_up),
    prize_mvp = coalesce(p->>'prize_mvp', prize_mvp),
    prize_other = coalesce(p->>'prize_other', prize_other),
    rules_text = coalesce(p->>'rules_text', rules_text),
    equipment_notes = coalesce(p->>'equipment_notes', equipment_notes),
    venue_rules = coalesce(p->>'venue_rules', venue_rules),
    yellow_card_fine = coalesce((p->>'yellow_card_fine')::numeric, yellow_card_fine),
    red_card_fine = coalesce((p->>'red_card_fine')::numeric, red_card_fine)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.update_tournament_draft(uuid,jsonb) to authenticated;

-- ── record_match_player_stats: add yellow_cards/red_card alongside
-- goals/is_mom. Same body as tournament_player_stats.sql otherwise. ──
create or replace function public.record_match_player_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t     public.tournaments;
  v_stat  jsonb;
  v_tp_id uuid;
  v_valid boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status <> 'completed' then raise exception 'MATCH_NOT_COMPLETED'; end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb))
  loop
    v_tp_id := (v_stat->>'team_player_id')::uuid;

    select exists (
      select 1 from public.tournament_team_players
      where id = v_tp_id and team_id in (v_match.team_a_id, v_match.team_b_id)
    ) into v_valid;
    if not v_valid then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, is_mom, yellow_cards, red_card)
    values (
      p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'is_mom')::boolean, false),
      least(coalesce((v_stat->>'yellow_cards')::int, 0), 2), coalesce((v_stat->>'red_card')::boolean, false)
    )
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, is_mom = excluded.is_mom,
          yellow_cards = excluded.yellow_cards, red_card = excluded.red_card, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── get_tournament_team_fines: total disciplinary fine owed per team,
-- for whoever manages the tournament to collect. ───────────────────
create or replace function public.get_tournament_team_fines(p_tournament_id uuid)
returns table (team_id uuid, total_fine numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
    select tt.id,
      coalesce(sum(s.yellow_cards), 0) * v_t.yellow_card_fine
        + coalesce(sum(s.red_card::int), 0) * v_t.red_card_fine
    from public.tournament_teams tt
    left join public.tournament_team_players tp on tp.team_id = tt.id
    left join public.tournament_match_player_stats s on s.team_player_id = tp.id
    where tt.tournament_id = p_tournament_id
    group by tt.id;
end;
$$;
grant execute on function public.get_tournament_team_fines(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_extra_time_penalties.sql ──
-- ================================================================

-- ================================================================
-- Extra-time and penalty-shootout scores for knockout matches.
--
-- record_match_result() previously just rejected a tied knockout score
-- outright (KNOCKOUT_CANNOT_DRAW) — the only way around it was the
-- Walkover button, which is semantically wrong for a match that was
-- actually played and drawn, then settled in extra time or on
-- penalties. This redeclares the function to accept two more optional
-- score pairs and fall through: regulation decides the winner if it
-- isn't level, otherwise extra time if that isn't level either,
-- otherwise penalties. League/group matches are unaffected — a draw
-- there was always a valid result and still is.
--
-- Also folds in the is_tournament_organizer() check this function was
-- missing (same has_venue_access-only gap already fixed elsewhere in
-- this project for own-venue tournaments — a vendor-less Organizer
-- couldn't record their own match results before this).
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_matches add column if not exists score_a_et int;
alter table public.tournament_matches add column if not exists score_b_et int;
alter table public.tournament_matches add column if not exists score_a_pens int;
alter table public.tournament_matches add column if not exists score_b_pens int;

-- The new signature adds four more (all-default) parameters — Postgres
-- treats that as a different overload, not a replacement, and having
-- both the old 4-arg and new 8-arg versions live at once makes every
-- call ambiguous to PostgREST ("could not choose the best candidate
-- function"). Drop the old one explicitly first.
drop function if exists public.record_match_result(uuid,int,int,uuid);

create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;

    if p_score_a <> p_score_b then
      v_winner := case when p_score_a > p_score_b then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_et is not null and p_score_b_et is not null and p_score_a_et <> p_score_b_et then
      v_winner := case when p_score_a_et > p_score_b_et then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_pens is not null and p_score_b_pens is not null and p_score_a_pens <> p_score_b_pens then
      v_winner := case when p_score_a_pens > p_score_b_pens then v_match.team_a_id else v_match.team_b_id end;
    else
      v_winner := null;
    end if;

    if v_winner is null and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;

    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_unique_team_names.sql ──
-- ================================================================

-- ================================================================
-- No two active teams in the same tournament may share a name
-- (case/whitespace-insensitive) — covers both self-serve registration
-- (register_team) and admin-entered walk-in teams (create_walkin_team).
-- A rejected/withdrawn team's old name doesn't block reuse, matching
-- how re-registration already works for that same team.
-- Run any time. Safe to re-run.
-- ================================================================

drop index if exists tournament_teams_unique_name;
create unique index tournament_teams_unique_name
  on public.tournament_teams (tournament_id, lower(trim(name)))
  where status not in ('rejected', 'withdrawn');

create or replace function public.register_team(p_tournament_id uuid, p_name text, p_ack_terms boolean)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_count int;
  v_name text := trim(p_name);
  v_row public.tournament_teams;
begin
  if p_ack_terms is not true then raise exception 'TERMS_NOT_ACKNOWLEDGED'; end if;
  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;
  if now() >= v_t.registration_closes_at then
    update public.tournaments set status = 'registration_closed' where id = p_tournament_id;
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status not in ('rejected', 'withdrawn')
      and lower(name) = lower(v_name) and captain_id is distinct from auth.uid()
  ) then
    raise exception 'TEAM_NAME_TAKEN';
  end if;

  select count(*) into v_count from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_count >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status)
  values (p_tournament_id, v_name, auth.uid(), true, case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end)
  on conflict (tournament_id, captain_id) do update
    set name = excluded.name, ack_terms = true,
        status = case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end
    where public.tournament_teams.status in ('rejected','withdrawn')
  returning * into v_row;

  if v_row.id is null then raise exception 'ALREADY_REGISTERED'; end if;

  -- The captain is always on their own roster.
  insert into public.tournament_team_players (team_id, user_id, role)
  values (v_row.id, auth.uid(), 'captain')
  on conflict (team_id, user_id) do nothing;

  return v_row;
end;
$$;
grant execute on function public.register_team(uuid,text,boolean) to authenticated;

create or replace function public.create_walkin_team(
  p_tournament_id uuid,
  p_team_name     text,
  p_members       jsonb
) returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.tournaments;
  v_team    public.tournament_teams;
  v_name    text := trim(p_team_name);
  v_member  jsonb;
  v_member_name text;
  v_phone   text;
  v_email   text;
  v_count   int;
  v_existing int;
  i         int;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_open' then raise exception 'REGISTRATION_CLOSED'; end if;

  if v_name = '' then raise exception 'TEAM_NAME_REQUIRED'; end if;

  if exists (
    select 1 from public.tournament_teams
    where tournament_id = p_tournament_id and status not in ('rejected', 'withdrawn')
      and lower(name) = lower(v_name)
  ) then
    raise exception 'TEAM_NAME_TAKEN';
  end if;

  v_count := coalesce(jsonb_array_length(p_members), 0);
  if v_count = 0 then raise exception 'AT_LEAST_ONE_MEMBER_REQUIRED'; end if;
  if v_count > v_t.max_players_per_team + v_t.substitute_limit then raise exception 'TOO_MANY_PLAYERS'; end if;

  select count(*) into v_existing from public.tournament_teams
    where tournament_id = p_tournament_id and status <> 'rejected' and status <> 'withdrawn';
  if v_existing >= v_t.max_teams then raise exception 'TOURNAMENT_FULL'; end if;

  insert into public.tournament_teams (tournament_id, name, captain_id, ack_terms, status, is_walkin, created_by)
  values (
    p_tournament_id, v_name, null, true,
    case when v_t.fee > 0 then 'payment_pending' else 'confirmed' end,
    true, auth.uid()
  ) returning * into v_team;

  for i in 0 .. v_count - 1 loop
    v_member := p_members -> i;
    v_member_name := trim(coalesce(v_member->>'name', ''));
    v_phone := trim(coalesce(v_member->>'phone', ''));
    v_email := nullif(trim(coalesce(v_member->>'email', '')), '');
    if v_member_name = '' then raise exception 'MEMBER_NAME_REQUIRED'; end if;
    if v_phone = '' then raise exception 'MEMBER_PHONE_REQUIRED'; end if;

    insert into public.tournament_team_players (team_id, guest_name, guest_phone, guest_email, role)
    values (v_team.id, v_member_name, v_phone, v_email, case when i = 0 then 'captain' else 'player' end);
  end loop;

  return v_team;
end;
$$;
grant execute on function public.create_walkin_team(uuid,text,jsonb) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_event_page.sql ──
-- ================================================================

-- ================================================================
-- Backs the new public tournament event page (Overview / Table /
-- Knockout / Fixtures / Player Stats / Teams):
--   - assists, alongside goals/cards already tracked
--   - goals for/against/diff in standings (was points-only)
--   - a lightweight per-match date & time the organizer sets directly
--     (no court, no conflict-checking — venue is already fixed at the
--     tournament level; this is just "when", for the public Fixtures
--     list, replacing the court-scheduling flow removed earlier)
--   - a tournament-wide player stats leaderboard, public
-- Run any time. Safe to re-run.
-- ================================================================

-- yellow_cards/red_card should already exist from tournament_cards_fines.sql
-- — added defensively here too (idempotent) so this file doesn't depend
-- on migrations having been run in a particular order.
alter table public.tournament_match_player_stats add column if not exists yellow_cards int not null default 0 check (yellow_cards between 0 and 2);
alter table public.tournament_match_player_stats add column if not exists red_card boolean not null default false;
alter table public.tournament_match_player_stats add column if not exists assists int not null default 0 check (assists >= 0);

create or replace function public.record_match_player_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.tournament_matches;
  v_t     public.tournaments;
  v_stat  jsonb;
  v_tp_id uuid;
  v_valid boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status <> 'completed' then raise exception 'MATCH_NOT_COMPLETED'; end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb))
  loop
    v_tp_id := (v_stat->>'team_player_id')::uuid;

    select exists (
      select 1 from public.tournament_team_players
      where id = v_tp_id and team_id in (v_match.team_a_id, v_match.team_b_id)
    ) into v_valid;
    if not v_valid then raise exception 'PLAYER_NOT_IN_MATCH'; end if;

    insert into public.tournament_match_player_stats (match_id, team_player_id, goals, assists, is_mom, yellow_cards, red_card)
    values (
      p_match_id, v_tp_id, coalesce((v_stat->>'goals')::int, 0), coalesce((v_stat->>'assists')::int, 0),
      coalesce((v_stat->>'is_mom')::boolean, false),
      least(coalesce((v_stat->>'yellow_cards')::int, 0), 2), coalesce((v_stat->>'red_card')::boolean, false)
    )
    on conflict (match_id, team_player_id) do update
      set goals = excluded.goals, assists = excluded.assists, is_mom = excluded.is_mom,
          yellow_cards = excluded.yellow_cards, red_card = excluded.red_card, updated_at = now();
  end loop;
end;
$$;
grant execute on function public.record_match_player_stats(uuid,jsonb) to authenticated;

-- ── Standings: add goals for/against/diff, use GD then GF as the
-- standard football tiebreak after points. A wider return row (new
-- OUT columns) isn't something `create or replace` can do in place —
-- Postgres requires dropping the old signature first. ───────────────
drop function if exists public.tournament_standings(uuid,text);

create or replace function public.tournament_standings(p_tournament_id uuid, p_group_name text default null)
returns table(
  team_id uuid, team_name text, played int, won int, drawn int, lost int,
  goals_for int, goals_against int, goal_diff int, points int
)
language sql stable as $$
  with relevant_matches as (
    select * from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and m.stage in ('league','group')
      and (p_group_name is null or m.group_name = p_group_name)
      and m.status in ('completed','walkover')
  )
  select
    t.id as team_id,
    t.name as team_name,
    count(rm.id)::int as played,
    count(rm.id) filter (where rm.winner_team_id = t.id)::int as won,
    count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b)::int as drawn,
    count(rm.id) filter (where rm.winner_team_id is not null and rm.winner_team_id <> t.id)::int as lost,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_a when rm.team_b_id = t.id then rm.score_b end), 0)::int as goals_for,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_b when rm.team_b_id = t.id then rm.score_a end), 0)::int as goals_against,
    coalesce(sum(case when rm.team_a_id = t.id then rm.score_a when rm.team_b_id = t.id then rm.score_b end), 0)::int
      - coalesce(sum(case when rm.team_a_id = t.id then rm.score_b when rm.team_b_id = t.id then rm.score_a end), 0)::int as goal_diff,
    (count(rm.id) filter (where rm.winner_team_id = t.id) * 3
     + count(rm.id) filter (where rm.status = 'completed' and rm.score_a = rm.score_b))::int as points
  from public.tournament_teams t
  left join relevant_matches rm on (rm.team_a_id = t.id or rm.team_b_id = t.id)
  where t.tournament_id = p_tournament_id and t.status = 'confirmed'
    and (p_group_name is null or t.group_name = p_group_name)
  group by t.id, t.name
  order by points desc, goal_diff desc, goals_for desc, team_name asc;
$$;
grant execute on function public.tournament_standings(uuid,text) to anon, authenticated;

-- ── set_match_time: just "when", no court/conflict-checking — the
-- venue is already fixed for the whole tournament. ──────────────────
-- Dropped unconditionally first: this function's parameter list grows
-- later in this file (court_label/notes) — see the tournament_standings
-- comment above for why replaying against an already-current database
-- needs this.
drop function if exists public.set_match_time(uuid,timestamptz,timestamptz);
create or replace function public.set_match_time(p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set starts_at = p_starts_at, ends_at = p_ends_at, status = case
      when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
      when status = 'scheduled' and p_starts_at is null then 'unscheduled'
      else status
    end
    where id = p_match_id
    returning * into v_match;

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz) to authenticated;

-- ── get_tournament_player_stats: public leaderboard — name (from the
-- linked account or the walk-in guest_name) + team + totals, across
-- every completed match in the tournament. No phone/email exposed. ──
create or replace function public.get_tournament_player_stats(p_tournament_id uuid)
returns table (
  team_player_id uuid, player_name text, team_id uuid, team_name text,
  goals bigint, assists bigint, yellow_cards bigint, red_cards bigint, mom_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    tp.id as team_player_id,
    coalesce(p.full_name, p.name, p.username, tp.guest_name, 'Player') as player_name,
    tt.id as team_id,
    tt.name as team_name,
    coalesce(sum(s.goals), 0) as goals,
    coalesce(sum(s.assists), 0) as assists,
    coalesce(sum(s.yellow_cards), 0) as yellow_cards,
    coalesce(sum(s.red_card::int), 0) as red_cards,
    coalesce(count(*) filter (where s.is_mom), 0) as mom_count
  from public.tournament_team_players tp
  join public.tournament_teams tt on tt.id = tp.team_id
  left join public.profiles p on p.id = tp.user_id
  left join public.tournament_match_player_stats s on s.team_player_id = tp.id
  where tt.tournament_id = p_tournament_id and tt.status = 'confirmed'
  group by tp.id, p.full_name, p.name, p.username, tp.guest_name, tt.id, tt.name
  having coalesce(sum(s.goals), 0) + coalesce(sum(s.assists), 0)
    + coalesce(sum(s.yellow_cards), 0) + coalesce(sum(s.red_card::int), 0) > 0
  order by goals desc, assists desc, player_name asc;
$$;
grant execute on function public.get_tournament_player_stats(uuid) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_public_roster.sql ──
-- ================================================================

-- ================================================================
-- Fix: the public event page's Teams tab ("tap to view squad") always
-- showed "No roster on file yet." even when a roster genuinely
-- existed, because it called getTeamRoster() — the same function used
-- for the captain's own management view and the admin's match-stat
-- entry — which reads tournament_team_players directly under RLS.
-- That table has no public-read policy at all (deliberately: it holds
-- guest_phone/guest_email for walk-in players), so an anonymous
-- visitor's query is silently filtered down to zero rows by RLS —
-- no error, just an empty result.
--
-- Rather than widen the raw table's RLS (which would leak phone/email
-- to any visitor), add a security-definer function that returns only
-- what a public squad viewer needs — id, name, role — nothing else,
-- and only for confirmed teams. Run any time. Safe to re-run.
-- ================================================================

create or replace function public.get_team_roster_public(p_team_id uuid)
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select
    tp.id,
    coalesce(p.full_name, p.name, p.username, tp.guest_name, 'Player') as name,
    tp.role
  from public.tournament_team_players tp
  join public.tournament_teams tt on tt.id = tp.team_id
  left join public.profiles p on p.id = tp.user_id
  where tp.team_id = p_team_id and tt.status = 'confirmed'
  order by (tp.role = 'captain') desc, tp.joined_at asc;
$$;
grant execute on function public.get_team_roster_public(uuid) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_manual_fixtures.sql ──
-- ================================================================

-- ================================================================
-- Fully manual fixtures/bracket — replaces auto-seeding + auto-pairing
-- (generate_knockout_bracket/generate_league_fixtures/
-- generate_group_fixtures/generate_knockout_from_groups, all left in
-- place but no longer called from anywhere). The organizer now adds
-- each match by hand: pick both teams from the confirmed pool, a
-- stage, a round number, and a round label — then sets its date/time
-- separately via set_match_time() (already shipped). Scoring, extra
-- time/penalties, and player stats all work exactly as before —
-- nothing about record_match_result()/record_match_player_stats()
-- changes here.
--
-- create_match() flips the tournament to 'live' on the first match
-- created, same as auto-generation used to.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.create_match(
  p_tournament_id uuid,
  p_stage         text,
  p_round         int,
  p_round_label   text,
  p_team_a_id     uuid,
  p_team_b_id     uuid default null,
  p_group_name    text default null
) returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t   public.tournaments;
  v_row public.tournament_matches;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status not in ('registration_closed', 'live') then raise exception 'INVALID_TRANSITION'; end if;
  if p_stage not in ('group', 'league', 'knockout') then raise exception 'INVALID_STAGE'; end if;
  if p_round_label is null or length(trim(p_round_label)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = p_tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = p_tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  insert into public.tournament_matches (
    tournament_id, stage, round, round_label, group_name, team_a_id, team_b_id, status
  ) values (
    p_tournament_id, p_stage, p_round, trim(p_round_label), nullif(trim(coalesce(p_group_name, '')), ''),
    p_team_a_id, p_team_b_id, 'unscheduled'
  ) returning * into v_row;

  if v_t.status = 'registration_closed' then
    update public.tournaments set status = 'live' where id = p_tournament_id;
  end if;

  return v_row;
end;
$$;
grant execute on function public.create_match(uuid,text,int,text,uuid,uuid,text) to authenticated;

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_match_audit.sql ──
-- ================================================================

-- ================================================================
-- Match edit audit log — who changed what and when, for organizers/
-- admins reviewing a match's history. Pulled from the bracket-rebuild
-- spec's tournament_match_audit idea, adapted onto the existing
-- manual match system (no auto-cascade, no separate rounds table —
-- those were explicitly declined) rather than a parallel rebuild.
-- Logging is added directly inside the existing mutation RPCs
-- (create_match, delete_match, record_match_result, set_match_time)
-- rather than a trigger, so each entry can carry a clear change_type.
-- Run any time. Safe to re-run.
-- ================================================================

create table if not exists public.tournament_match_audit (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.tournament_matches(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  changed_by  uuid references auth.users(id),
  change_type text not null check (change_type in ('created','deleted','result','schedule')),
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_match_audit_match on public.tournament_match_audit(match_id, created_at desc);

-- Same audience as everything else match-related: whoever manages the
-- tournament. Not public — this is an internal accountability log.
alter table public.tournament_match_audit enable row level security;
drop policy if exists tournament_match_audit_read on public.tournament_match_audit;
create policy tournament_match_audit_read on public.tournament_match_audit for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id
      and (public.is_tournament_organizer(t) or public.has_venue_access(t.venue_id) or public.is_super_admin())
  ));

create or replace function public.get_match_audit(p_match_id uuid)
returns setof public.tournament_match_audit
language sql stable security definer set search_path = public as $$
  select * from public.tournament_match_audit where match_id = p_match_id order by created_at desc;
$$;
grant execute on function public.get_match_audit(uuid) to authenticated;

-- ── create_match: log the new row ───────────────────────────────
create or replace function public.create_match(
  p_tournament_id uuid,
  p_stage         text,
  p_round         int,
  p_round_label   text,
  p_team_a_id     uuid,
  p_team_b_id     uuid default null,
  p_group_name    text default null
) returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t   public.tournaments;
  v_row public.tournament_matches;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status not in ('registration_closed', 'live') then raise exception 'INVALID_TRANSITION'; end if;
  if p_stage not in ('group', 'league', 'knockout') then raise exception 'INVALID_STAGE'; end if;
  if p_round_label is null or length(trim(p_round_label)) = 0 then raise exception 'TITLE_REQUIRED'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = p_tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = p_tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  insert into public.tournament_matches (
    tournament_id, stage, round, round_label, group_name, team_a_id, team_b_id, status
  ) values (
    p_tournament_id, p_stage, p_round, trim(p_round_label), nullif(trim(coalesce(p_group_name, '')), ''),
    p_team_a_id, p_team_b_id, 'unscheduled'
  ) returning * into v_row;

  if v_t.status = 'registration_closed' then
    update public.tournaments set status = 'live' where id = p_tournament_id;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, new_value)
  values (v_row.id, p_tournament_id, auth.uid(), 'created', to_jsonb(v_row));

  return v_row;
end;
$$;
grant execute on function public.create_match(uuid,text,int,text,uuid,uuid,text) to authenticated;

-- ── delete_match: log the removed row ───────────────────────────
create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'deleted', to_jsonb(v_match));

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

-- ── record_match_result: log score/status change ────────────────
create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_before public.tournament_matches;
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;

    if p_score_a <> p_score_b then
      v_winner := case when p_score_a > p_score_b then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_et is not null and p_score_b_et is not null and p_score_a_et <> p_score_b_et then
      v_winner := case when p_score_a_et > p_score_b_et then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_pens is not null and p_score_b_pens is not null and p_score_a_pens <> p_score_b_pens then
      v_winner := case when p_score_a_pens > p_score_b_pens then v_match.team_a_id else v_match.team_b_id end;
    else
      v_winner := null;
    end if;

    if v_winner is null and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;

    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'result', to_jsonb(v_before), to_jsonb(v_match));

  if v_winner is not null and v_match.next_match_id is not null then
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int) to authenticated;

-- ── set_match_time: log schedule change ─────────────────────────
create or replace function public.set_match_time(p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set starts_at = p_starts_at, ends_at = p_ends_at, status = case
      when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
      when status = 'scheduled' and p_starts_at is null then 'unscheduled'
      else status
    end
    where id = p_match_id
    returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_edit_match_teams.sql ──
-- ================================================================

-- ================================================================
-- Edit an existing match's teams (only before it's played) — the one
-- gap in the manual fixtures system: today you can create, score,
-- schedule, or delete a match, but never fix a wrong team pick after
-- the fact. Audited like every other match edit.
--
-- Deliberately NOT building: next_match_id auto-wiring, cascade
-- propagation, or a cascade-confirmation flow. Those assume a fixed
-- bracket tree, which a fully-manual, admin-built fixture list
-- doesn't have — round 2 might not even be created yet when round 1
-- finishes, and its match count/shape is whatever the admin decides.
-- The client instead offers "winner of match X" as a one-click option
-- in the team pickers (pure UI, reads matches already on the page —
-- no new RPC needed for that part), so building round 2 from round
-- 1's results is fast without pretending the system knows the whole
-- tree in advance.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_match_audit drop constraint if exists tournament_match_audit_change_type_check;
alter table public.tournament_match_audit add constraint tournament_match_audit_change_type_check
  check (change_type in ('created','deleted','result','schedule','teams'));

create or replace function public.update_match_teams(p_match_id uuid, p_team_a_id uuid, p_team_b_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed', 'walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = v_match.tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = v_match.tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  update public.tournament_matches set team_a_id = p_team_a_id, team_b_id = p_team_b_id
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.update_match_teams(uuid,uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_bracket_pro.sql ──
-- ================================================================

-- ================================================================
-- Bracket system upgrade: optional auto-generate (coexists with the
-- manual match builder — generation only runs when zero matches exist
-- yet, so it can never clobber hand-built fixtures), true winner
-- auto-cascade with a confirm-before-overwrite safety net, richer
-- match status, and per-match notes/ground label.
--
-- Auto-cascade design (the important part): record_match_result()
-- already called propagate_match_winner() when next_match_id was set
-- — that plumbing was live but unused, since manual match creation
-- never wires next_match_id. This adds:
--   1. A way to WIRE it — generate_knockout_bracket() (already existed,
--      untouched logic, just a permission-check fix) pre-wires the
--      whole tree; set_match_advancement() lets a hand-built match opt
--      into the same mechanism one link at a time.
--   2. A DIFF CHECK before overwriting — if the next match's slot
--      already holds the same team the diff is a no-op, so routine
--      score corrections that don't change who advances never prompt
--      anything. If it holds a *different* team, the caller must pass
--      p_confirm_cascade=true or the RPC raises
--      CASCADE_CONFIRMATION_REQUIRED — the client checks this
--      proactively client-side first (it already has the full match
--      list in memory) so confirming is a single follow-up call, not
--      a failed-then-retried one.
--   3. A RECURSIVE RESET — confirmed cascades clear every match
--      downstream of the corrected one (scores, winner, status, and
--      the propagated team slot), not just the immediate next match,
--      so a result correction can never leave a stale team sitting
--      several rounds ahead of where they actually got knocked out.
-- Every one of these writes an audit row, same as every other match
-- edit already does.
-- Run any time. Safe to re-run.
-- ================================================================

alter table public.tournament_matches add column if not exists notes text;
alter table public.tournament_matches add column if not exists court_label text;

alter table public.tournament_matches drop constraint if exists tournament_matches_status_check;
alter table public.tournament_matches add constraint tournament_matches_status_check
  check (status in ('unscheduled','scheduled','live','postponed','completed','walkover','cancelled'));

-- ── set_team_seed / generate_knockout_bracket: same logic as before,
-- just adding is_tournament_organizer() — an own-venue Organizer
-- (no vendor, so has_venue_access() alone can't see them) couldn't
-- seed or generate for their own tournament before this. ────────────
create or replace function public.set_team_seed(p_team_id uuid, p_seed int, p_group_name text default null)
returns public.tournament_teams
language plpgsql security definer set search_path = public as $$
declare v_team public.tournament_teams; v_t public.tournaments;
begin
  select * into v_team from public.tournament_teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  if v_team.status <> 'confirmed' then raise exception 'TEAM_NOT_CONFIRMED'; end if;

  update public.tournament_teams
    set seed = p_seed, group_name = coalesce(p_group_name, group_name)
    where id = p_team_id
    returning * into v_team;
  return v_team;
end;
$$;
grant execute on function public.set_team_seed(uuid,int,text) to authenticated;

create or replace function public.generate_knockout_bracket(p_tournament_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_t public.tournaments;
  v_team_ids uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_t.format <> 'knockout' then raise exception 'WRONG_FORMAT'; end if;
  if v_t.status <> 'registration_closed' then raise exception 'INVALID_TRANSITION'; end if;
  -- The one safety rule that matters: generation only ever runs against
  -- an empty match list. Any matches already on the board — whether
  -- from a previous generation or hand-built — block it outright rather
  -- than silently merging or overwriting results.
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then
    raise exception 'ALREADY_GENERATED';
  end if;

  select array_agg(id order by seed nulls last, created_at) into v_team_ids
    from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed';

  perform public.build_knockout_bracket(p_tournament_id, v_team_ids);

  update public.tournaments set status = 'live' where id = p_tournament_id returning * into v_t;
  return v_t;
end;
$$;
grant execute on function public.generate_knockout_bracket(uuid) to authenticated;

-- ── set_match_advancement: opt a hand-built match into the same
-- auto-cascade mechanism generation uses, one link at a time. ──────
create or replace function public.set_match_advancement(p_match_id uuid, p_next_match_id uuid, p_next_match_slot text)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_next public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_next_match_slot not in ('a','b') then raise exception 'INVALID_SLOT'; end if;
  if p_next_match_id = p_match_id then raise exception 'SAME_MATCH'; end if;

  select * into v_next from public.tournament_matches where id = p_next_match_id and tournament_id = v_match.tournament_id;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  update public.tournament_matches set next_match_id = p_next_match_id, next_match_slot = p_next_match_slot
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_advancement(uuid,uuid,text) to authenticated;

-- ── set_match_status: direct status flip (Live/Postponed/Cancelled/
-- back to Scheduled) independent of entering a score — the reference
-- brief's status list beyond what a result/schedule edit already
-- implies. Blocked once a real result is recorded; use record_match_result
-- (or delete_match, for unplayed ones) to undo that instead. ────────
create or replace function public.set_match_status(p_match_id uuid, p_status text)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  if p_status not in ('unscheduled','scheduled','live','postponed','cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.status in ('completed','walkover') then raise exception 'MATCH_ALREADY_DONE'; end if;

  update public.tournament_matches set status = p_status where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_status(uuid,text) to authenticated;

-- ── set_match_time: adds ground/notes alongside the date/time it
-- already set. Same signature-widening reason as everywhere else in
-- this project — CREATE OR REPLACE can't add params to a function
-- PostgREST already resolved without a matching drop first. ────────
drop function if exists public.set_match_time(uuid,timestamptz,timestamptz);

create or replace function public.set_match_time(
  p_match_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_court_label text default null, p_notes text default null
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  update public.tournament_matches set
      starts_at = p_starts_at, ends_at = p_ends_at,
      court_label = coalesce(p_court_label, court_label),
      notes = coalesce(p_notes, notes),
      status = case
        when status = 'unscheduled' and p_starts_at is not null then 'scheduled'
        when status = 'scheduled' and p_starts_at is null then 'unscheduled'
        else status
      end
    where id = p_match_id
    returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'schedule', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.set_match_time(uuid,timestamptz,timestamptz,text,text) to authenticated;

-- ── reset_downstream_from: walks next_match_id forward from a
-- corrected match, clearing every match that had already advanced
-- from its (now-stale) old winner. ──────────────────────────────────
create or replace function public.reset_downstream_from(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_next public.tournament_matches;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if not found or v_match.next_match_id is null then return; end if;

  select * into v_next from public.tournament_matches where id = v_match.next_match_id;
  if not found then return; end if;

  -- Recurse first — if v_next had itself already advanced a winner
  -- further down the tree, that has to be unwound before v_next's own
  -- team slot changes underneath it.
  perform public.reset_downstream_from(v_next.id);

  if v_match.next_match_slot = 'a' then
    update public.tournament_matches set team_a_id = null where id = v_next.id;
  else
    update public.tournament_matches set team_b_id = null where id = v_next.id;
  end if;

  update public.tournament_matches set
      status = 'unscheduled', score_a = null, score_b = null,
      score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null,
      winner_team_id = null
    where id = v_next.id;
end;
$$;

-- ── record_match_result: adds the cascade diff-check + confirm gate
-- + recursive reset on top of the existing scoring/ET/pens logic.
-- One more parameter than the live signature (with a default, but
-- Postgres still treats that as a distinct overload) — drop the old
-- 8-arg version first so PostgREST isn't left choosing between two. ──
drop function if exists public.record_match_result(uuid,int,int,uuid,int,int,int,int);

create or replace function public.record_match_result(
  p_match_id uuid,
  p_score_a int default null,
  p_score_b int default null,
  p_winner_team_id uuid default null,
  p_score_a_et int default null,
  p_score_b_et int default null,
  p_score_a_pens int default null,
  p_score_b_pens int default null,
  p_confirm_cascade boolean default false
)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare
  v_before public.tournament_matches;
  v_match public.tournament_matches;
  v_t public.tournaments;
  v_winner uuid;
  v_current_next_team uuid;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t) or public.has_venue_access(v_t.venue_id, 'manager') or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_match.team_a_id is null or v_match.team_b_id is null then raise exception 'TEAMS_NOT_SET'; end if;
  if v_match.status = 'cancelled' then raise exception 'INVALID_TRANSITION'; end if;

  if p_winner_team_id is not null then
    if p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then raise exception 'INVALID_WINNER'; end if;
    v_winner := p_winner_team_id;
  else
    if p_score_a is null or p_score_b is null then raise exception 'SCORES_REQUIRED'; end if;

    if p_score_a <> p_score_b then
      v_winner := case when p_score_a > p_score_b then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_et is not null and p_score_b_et is not null and p_score_a_et <> p_score_b_et then
      v_winner := case when p_score_a_et > p_score_b_et then v_match.team_a_id else v_match.team_b_id end;
    elsif p_score_a_pens is not null and p_score_b_pens is not null and p_score_a_pens <> p_score_b_pens then
      v_winner := case when p_score_a_pens > p_score_b_pens then v_match.team_a_id else v_match.team_b_id end;
    else
      v_winner := null;
    end if;

    if v_winner is null and v_t.format <> 'league' and v_match.stage <> 'group' then
      raise exception 'KNOCKOUT_CANNOT_DRAW';
    end if;
  end if;

  -- Diff check, before touching anything: does this result actually
  -- change who's sitting in the next match's slot? If the slot's empty
  -- or already holds this exact team, there's nothing to cascade —
  -- proceed straight to a normal save, no confirmation needed.
  if v_winner is not null and v_match.next_match_id is not null then
    select (case when v_match.next_match_slot = 'a' then team_a_id else team_b_id end)
      into v_current_next_team
      from public.tournament_matches where id = v_match.next_match_id;

    if v_current_next_team is not null and v_current_next_team is distinct from v_winner and not p_confirm_cascade then
      raise exception 'CASCADE_CONFIRMATION_REQUIRED';
    end if;
  end if;

  if p_winner_team_id is not null then
    update public.tournament_matches
      set status = 'walkover', winner_team_id = v_winner,
          score_a = null, score_b = null, score_a_et = null, score_b_et = null, score_a_pens = null, score_b_pens = null
      where id = p_match_id returning * into v_match;
  else
    update public.tournament_matches
      set status = 'completed', score_a = p_score_a, score_b = p_score_b,
          score_a_et = p_score_a_et, score_b_et = p_score_b_et,
          score_a_pens = p_score_a_pens, score_b_pens = p_score_b_pens,
          winner_team_id = v_winner
      where id = p_match_id returning * into v_match;
  end if;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'result', to_jsonb(v_before), to_jsonb(v_match));

  if v_winner is not null and v_match.next_match_id is not null and v_current_next_team is distinct from v_winner then
    if v_current_next_team is not null then
      perform public.reset_downstream_from(p_match_id);
    end if;
    perform public.propagate_match_winner(p_match_id, v_winner);
  end if;

  return v_match;
end;
$$;
grant execute on function public.record_match_result(uuid,int,int,uuid,int,int,int,int,boolean) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── originally: tournament_fixtures_edit_anything.sql ──
-- ================================================================

-- ================================================================
-- "Edit anything, delete anything" — admin explicitly asked to be able
-- to delete or re-pick teams on a match regardless of its status
-- (completed, walkover, bye — doesn't matter, their call). Both RPCs
-- used to raise MATCH_ALREADY_DONE once a match was decided; that
-- guard is removed here, with the cascade/FK bookkeeping it existed to
-- avoid now handled explicitly instead:
--   - delete_match(): a match other matches point to via next_match_id
--     has no ON DELETE behavior on that FK, so deleting it first clears
--     every match's next_match_id/next_match_slot that pointed at it
--     (otherwise the delete would fail outright with a FK violation).
--     If the match being deleted had itself already propagated a
--     winner forward, reset_downstream_from() unwinds that first.
--   - update_match_teams(): swapping teams on an already-decided match
--     invalidates its old result (the old winner may not even be one
--     of the new teams anymore) — the match is reset to unscheduled
--     with the score/winner cleared, and reset_downstream_from() unwinds
--     anything that result had already fed forward.
-- Run any time. Safe to re-run.
-- ================================================================

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match public.tournament_matches; v_t public.tournaments;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_match.next_match_id is not null then
    perform public.reset_downstream_from(p_match_id);
  end if;

  -- Sever incoming links from any match that advances into this one —
  -- otherwise the delete below fails on the next_match_id FK.
  update public.tournament_matches set next_match_id = null, next_match_slot = null
    where next_match_id = p_match_id;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'deleted', to_jsonb(v_match));

  delete from public.tournament_matches where id = p_match_id;
end;
$$;
grant execute on function public.delete_match(uuid) to authenticated;

create or replace function public.update_match_teams(p_match_id uuid, p_team_a_id uuid, p_team_b_id uuid default null)
returns public.tournament_matches
language plpgsql security definer set search_path = public as $$
declare v_before public.tournament_matches; v_match public.tournament_matches; v_t public.tournaments; v_was_done boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_before := v_match;
  select * into v_t from public.tournaments where id = v_match.tournament_id;
  if not (
    public.is_tournament_organizer(v_t)
    or public.has_venue_access(v_t.venue_id, 'manager')
    or public.is_super_admin()
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.tournament_teams
    where id = p_team_a_id and tournament_id = v_match.tournament_id and status = 'confirmed'
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if p_team_b_id is not null then
    if p_team_a_id = p_team_b_id then raise exception 'SAME_TEAM'; end if;
    if not exists (
      select 1 from public.tournament_teams
      where id = p_team_b_id and tournament_id = v_match.tournament_id and status = 'confirmed'
    ) then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  end if;

  v_was_done := v_match.status in ('completed', 'walkover');
  if v_was_done and v_match.next_match_id is not null then
    perform public.reset_downstream_from(p_match_id);
  end if;

  update public.tournament_matches set
      team_a_id = p_team_a_id, team_b_id = p_team_b_id,
      status = case when v_was_done then 'unscheduled' else status end,
      score_a = case when v_was_done then null else score_a end,
      score_b = case when v_was_done then null else score_b end,
      score_a_et = case when v_was_done then null else score_a_et end,
      score_b_et = case when v_was_done then null else score_b_et end,
      score_a_pens = case when v_was_done then null else score_a_pens end,
      score_b_pens = case when v_was_done then null else score_b_pens end,
      winner_team_id = case when v_was_done then null else winner_team_id end
    where id = p_match_id returning * into v_match;

  insert into public.tournament_match_audit (match_id, tournament_id, changed_by, change_type, old_value, new_value)
  values (v_match.id, v_match.tournament_id, auth.uid(), 'teams', to_jsonb(v_before), to_jsonb(v_match));

  return v_match;
end;
$$;
grant execute on function public.update_match_teams(uuid,uuid,uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────


-- ================================================================
-- ── super admin: same tournament-creation access as an Organizer ──
--
-- The own-venue path already worked for a super admin (is_organizer()
-- returns true for super admins too — see organizer_partnerships.sql),
-- but picking any *listed* Sportonica venue from /platform/tournaments/new
-- required an active partnership row between the caller and that
-- venue's owner — a real gap, since a Platform-run tournament has no
-- Organizer↔Vendor relationship to check. Super admin now bypasses that
-- partnership requirement outright.
-- ================================================================
create or replace function public.create_tournament(p jsonb)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_venue_id uuid := nullif(p->>'venue_id', '')::uuid;
  v_own_venue_name text := nullif(trim(p->>'own_venue_name'), '');
  v_vendor_id uuid;
  v_row public.tournaments;
begin
  if v_venue_id is not null then
    select owner_id into v_vendor_id from public.venues where id = v_venue_id;
    if v_vendor_id is null then raise exception 'VENUE_NOT_FOUND'; end if;
    if not (
      public.is_super_admin()
      or (
        public.is_organizer()
        and exists (
          select 1 from public.partnerships
          where organizer_id = auth.uid() and vendor_id = v_vendor_id and status = 'active'
        )
      )
    ) then
      raise exception 'FORBIDDEN';
    end if;
  elsif v_own_venue_name is not null then
    if not public.is_organizer() then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'VENUE_NOT_FOUND';
  end if;

  insert into public.tournaments (
    venue_id, own_venue_name, own_venue_address, own_venue_map_url, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules, yellow_card_fine, red_card_fine
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
    nullif(trim(p->>'own_venue_map_url'), ''),
    (p->>'own_venue_lat')::double precision, (p->>'own_venue_lng')::double precision,
    case when v_venue_id is null then 'confirmed' else 'pending' end,
    auth.uid(),
    coalesce(p->>'organizer_type','venue'),
    p->>'organizer_name', p->>'name', p->>'sport', p->>'banner_url', p->>'description',
    p->>'contact_phone', (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
    (p->>'registration_opens_at')::timestamptz, (p->>'registration_closes_at')::timestamptz,
    (p->>'match_duration_mins')::int, p->>'format', (p->>'max_teams')::int,
    (p->>'min_players_per_team')::int, (p->>'max_players_per_team')::int,
    coalesce((p->>'substitute_limit')::int, 0), coalesce(p->>'registration_mode','team'),
    p->>'gender_rule', p->>'skill_category', coalesce((p->>'fee')::numeric, 0),
    p->>'payment_instructions', p->>'refund_policy', p->>'prize_winner', p->>'prize_runner_up',
    p->>'prize_mvp', p->>'prize_other', p->>'rules_text', p->>'equipment_notes', p->>'venue_rules',
    coalesce((p->>'yellow_card_fine')::numeric, 0), coalesce((p->>'red_card_fine')::numeric, 0)
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_tournament(jsonb) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── permission-check fixes: three RPCs never checked
--    is_tournament_organizer(), only has_venue_access() — broke for
--    an own-venue tournament's organizer (no venue to have access to),
--    and would have quietly excluded the new tournament_managers grant
--    below from working on these three actions too.
-- ================================================================
create or replace function public.open_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'published' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_open' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.open_tournament_registration(uuid) to authenticated;

create or replace function public.close_tournament_registration(p_id uuid)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status <> 'registration_open' then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'registration_closed' where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.close_tournament_registration(uuid) to authenticated;

create or replace function public.cancel_tournament(p_id uuid, p_reason text)
returns public.tournaments
language plpgsql security definer set search_path = public as $$
declare v_row public.tournaments;
begin
  select * into v_row from public.tournaments where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_tournament_organizer(v_row) or public.has_venue_access(v_row.venue_id, 'manager') or public.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('completed','cancelled') then raise exception 'INVALID_TRANSITION'; end if;

  update public.tournaments set status = 'cancelled', cancel_reason = p_reason where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.cancel_tournament(uuid,text) to authenticated;

-- ================================================================
-- ── Per-tournament delegated access ("tournament manager") ──
--
-- Distinct from the platform-wide Organizer role (profiles.role =
-- 'organizer' — self-serve, lets someone create tournaments anywhere,
-- see organizer_partnerships.sql). This is narrower and admin-granted:
-- a super admin hand-picks a specific person to run ONE tournament,
-- with the exact same capabilities that tournament's own owner/
-- organizer already has for it.
--
-- Implemented by teaching is_tournament_organizer() about this table,
-- rather than touching every RPC individually — every RPC in this
-- file already gates on is_tournament_organizer(v_row) (create_match,
-- record_match_result, set_match_time, publish_tournament,
-- generate_knockout_bracket, cancel_tournament, and everything else
-- above), so a granted manager picks up all of it at once.
-- ================================================================
create table if not exists public.tournament_managers (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  added_by      uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index if not exists idx_tournament_managers_tournament on public.tournament_managers(tournament_id);
create index if not exists idx_tournament_managers_user on public.tournament_managers(user_id);

alter table public.tournament_managers enable row level security;
drop policy if exists tournament_managers_read on public.tournament_managers;
create policy tournament_managers_read on public.tournament_managers for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t))
  );

create or replace function public.is_tournament_organizer(v_row public.tournaments)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      v_row.owner_id is not null
      and v_row.owner_id = auth.uid()
      and (
        v_row.venue_id is null
        or exists (
          select 1 from public.venues ve
          join public.partnerships p on p.vendor_id = ve.owner_id
          where ve.id = v_row.venue_id
            and p.organizer_id = auth.uid()
            and p.status = 'active'
        )
      )
    )
    or exists (
      select 1 from public.tournament_managers tm
      where tm.tournament_id = v_row.id and tm.user_id = auth.uid()
    );
$$;

-- Look up an existing account by email, so a super admin can grant
-- access without knowing a user's internal id.
create or replace function public.find_user_by_email(p_email text)
returns table(id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select u.id, p.full_name, u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
    limit 1;
end;
$$;
grant execute on function public.find_user_by_email(text) to authenticated;

create or replace function public.grant_tournament_manager(p_tournament_id uuid, p_user_id uuid)
returns public.tournament_managers
language plpgsql security definer set search_path = public as $$
declare v_row public.tournament_managers;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.tournaments where id = p_tournament_id) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.tournament_managers (tournament_id, user_id, added_by)
  values (p_tournament_id, p_user_id, auth.uid())
  on conflict (tournament_id, user_id) do nothing;

  select * into v_row from public.tournament_managers
    where tournament_id = p_tournament_id and user_id = p_user_id;
  return v_row;
end;
$$;
grant execute on function public.grant_tournament_manager(uuid,uuid) to authenticated;

create or replace function public.revoke_tournament_manager(p_tournament_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  delete from public.tournament_managers where tournament_id = p_tournament_id and user_id = p_user_id;
end;
$$;
grant execute on function public.revoke_tournament_manager(uuid,uuid) to authenticated;

create or replace function public.list_tournament_managers(p_tournament_id uuid)
returns table(id uuid, user_id uuid, full_name text, email text, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    public.is_super_admin()
    or exists (select 1 from public.tournaments t where t.id = p_tournament_id and public.is_tournament_organizer(t))
  ) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select tm.id, tm.user_id, p.full_name, u.email::text, tm.created_at
    from public.tournament_managers tm
    join public.profiles p on p.id = tm.user_id
    join auth.users u on u.id = tm.user_id
    where tm.tournament_id = p_tournament_id
    order by tm.created_at asc;
end;
$$;
grant execute on function public.list_tournament_managers(uuid) to authenticated;

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── RLS fix: reading a tournament never checked is_tournament_organizer() ──
--
-- tournaments_read_owner only checked has_venue_access(venue_id) —
-- which is false for an own-venue tournament (no venue row at all) and
-- for a granted tournament_managers entry (no venue staff role either).
-- Both would load the tournament's admin page and immediately get
-- nothing back from getTournament(), since RLS silently filters the
-- row out rather than erroring. Every RPC-based mutation already
-- worked (they run as SECURITY DEFINER, bypassing RLS) — only the
-- plain client .select() used to load the page was affected.
-- ================================================================
drop policy if exists tournaments_read_owner on public.tournaments;
create policy tournaments_read_owner on public.tournaments for select
  using (public.has_venue_access(venue_id) or public.is_tournament_organizer(tournaments));

-- ── DONE ─────────────────────────────────────────────────────────

-- ================================================================
-- ── RLS: same is_tournament_organizer() gap in three more read
--    policies — matches, announcements, and registration payments all
--    only checked has_venue_access(), same story as tournaments_read_
--    owner above. Added as supplemental policies (same pattern as the
--    existing tournament_teams_read_organizer2 /
--    tournament_team_players_read_organizer2), not replacements —
--    Postgres RLS policies for the same command OR together.
-- ================================================================
drop policy if exists tournament_matches_read_organizer2 on public.tournament_matches;
create policy tournament_matches_read_organizer2 on public.tournament_matches for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists tournament_announcements_read_organizer2 on public.tournament_announcements;
create policy tournament_announcements_read_organizer2 on public.tournament_announcements for select
  using (exists (
    select 1 from public.tournaments t where t.id = tournament_id and public.is_tournament_organizer(t)
  ));

drop policy if exists pay_tournament_organizer_read on public.payments;
create policy pay_tournament_organizer_read on public.payments for select
  using (
    booking_type = 'tournament_registration'
    and exists (
      select 1 from public.tournament_teams tt
      join public.tournaments t on t.id = tt.tournament_id
      where tt.id = payments.tournament_registration_id and public.is_tournament_organizer(t)
    )
  );

-- ── DONE ─────────────────────────────────────────────────────────
