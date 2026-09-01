-- ================================================================
-- Sportonica — two corrections to the Organizer feature shipped in
-- organizer_partnerships.sql. Run AFTER that file. Safe to re-run.
--
-- 1. Becoming an Organizer is now request + Super Admin approval,
--    not instant self-serve.
-- 2. An Organizer can list their own venue (name + location pin) with
--    no Sportonica venue and no vendor partnership at all, alongside
--    the existing search-a-venue-and-partner path.
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

-- ================================================================
-- PART 1 — Organizer access: request + approval
-- ================================================================

select pg_temp.drop_check_constraints('profiles', 'role');
alter table public.profiles add constraint profiles_role_check
  check (role in ('player','venue_owner','admin','super_admin','organizer','organizer_pending'));

-- The only self-serve transition a client session can make is now
-- player -> organizer_pending, not organizer directly. is_organizer()
-- (organizer_partnerships.sql) still checks strictly for role =
-- 'organizer', so a pending requester has no extra access while waiting.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    if not (old.role = 'player' and new.role = 'organizer_pending') then
      raise exception 'ROLE_CHANGE_NOT_ALLOWED';
    end if;
  end if;
  return new;
end;
$$;

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

-- Super-admin-only, security definer — a plain client update can't do
-- this (profiles' only update policy is "id = auth.uid()", and there's
-- no committed super-admin bypass policy on that table).
create or replace function public.approve_organizer_request(p_user_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN'; end if;
  select role into v_role from public.profiles where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_role <> 'organizer_pending' then raise exception 'INVALID_TRANSITION'; end if;

  update public.profiles set role = case when p_approve then 'organizer' else 'player' end
    where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body, actor_id)
  values (
    p_user_id, 'organizer_request_reviewed',
    case when p_approve then 'You can now organize tournaments' else 'Organizer request declined' end,
    case when p_approve then 'Sportonica approved your request — head to /organize to get started.'
         else 'Sportonica declined your request to become an organizer.' end,
    auth.uid()
  );
end;
$$;
grant execute on function public.approve_organizer_request(uuid,boolean) to authenticated;

-- ================================================================
-- PART 2 — "Own venue" tournaments
-- ================================================================

alter table public.tournaments alter column venue_id drop not null;
alter table public.tournaments add column if not exists own_venue_name text;
alter table public.tournaments add column if not exists own_venue_address text;
alter table public.tournaments add column if not exists own_venue_lat double precision;
alter table public.tournaments add column if not exists own_venue_lng double precision;

select pg_temp.drop_check_constraints('tournaments', 'venue_id');
alter table public.tournaments add constraint tournaments_venue_xor_check
  check ((venue_id is not null) <> (own_venue_name is not null));

-- Collapses to plain ownership when there's no real venue to check a
-- partnership against — an own-venue tournament needs no vendor consent.
create or replace function public.is_tournament_organizer(v_row public.tournaments)
returns boolean language sql stable security definer set search_path = public as $$
  select
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
    );
$$;

-- create_tournament: branches on whether the payload names a real venue
-- (existing partnered-venue path, unchanged) or an own venue (just needs
-- is_organizer() — no partnership, no vendor consent, since there's no
-- venue owner to consent). An own-venue tournament's venue_booking_status
-- is inserted already 'confirmed' — there's no vendor to confirm it.
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
    venue_id, own_venue_name, own_venue_address, own_venue_lat, own_venue_lng,
    venue_booking_status, owner_id, organizer_type, organizer_name, name, sport, banner_url, description,
    contact_phone, starts_at, ends_at, registration_opens_at, registration_closes_at,
    match_duration_mins, format, max_teams, min_players_per_team, max_players_per_team,
    substitute_limit, registration_mode, gender_rule, skill_category, fee,
    payment_instructions, refund_policy, prize_winner, prize_runner_up, prize_mvp, prize_other,
    rules_text, equipment_notes, venue_rules
  ) values (
    v_venue_id, v_own_venue_name, nullif(trim(p->>'own_venue_address'), ''),
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
