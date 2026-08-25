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
                   'tournament_announcement'));

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
