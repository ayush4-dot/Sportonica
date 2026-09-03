-- ================================================================
-- Sportonica — RLS / privilege hardening (from the security review).
-- Run once in the Supabase SQL editor, AFTER admin_schema.sql,
-- schema_full.sql/add_columns.sql and maintenance/fix_role_escalation.sql.
-- Safe to re-run.
--
-- Closes these holes:
--   #2  court_bookings INSERT policy only checked user_id -> a browser
--       could insert price:0 / state:'confirmed' / payment_status:'paid'
--       with no conflict check. Fix: no direct client INSERT at all;
--       book_court() (SECURITY DEFINER) is the only way in.
--   #3  profiles UPDATE had no WITH CHECK / column guard -> self-serve
--       trust_score and game-stat tampering. Fix: guard trigger.
--   #4  venues UPDATE had no WITH CHECK -> owner self-sets
--       verification_status:'verified' / payout_cap:null. Fix: guard trigger.
--   bookings (legacy event-join) UPDATE let a user set their own row to
--       payment_status:'paid'. Fix: drop client UPDATE (RPCs handle edits).
--   #7  venue_daily_stats view was granted to every authenticated user,
--       exposing every venue's revenue. Fix: revoke.
--   tournament_teams captain UPDATE had no WITH CHECK. Fix: add one.
-- ================================================================

-- ── #2  court_bookings: RPC-only inserts ────────────────────────
drop policy if exists bk_user_ins on public.court_bookings;
-- (bk_user_read + bk_staff_all stay. book_court() is SECURITY DEFINER so
--  it bypasses RLS for the insert; no client path inserts directly.)

-- ── bookings (legacy event-join): no client UPDATE ─────────────
drop policy if exists "Users can update own bookings" on public.bookings;
drop policy if exists "Venue owners can update bookings" on public.bookings;
-- Venue owners still manage event bookings through the self-service RPCs
-- (edit_game_join / cancel_game_join, SECURITY DEFINER). Re-add a scoped
-- owner UPDATE with a matching WITH CHECK only if a non-RPC path needs it:
-- create policy "Venue owners update event bookings" on public.bookings
--   for update
--   using  (venue_id in (select id from public.venues where owner_id = auth.uid()))
--   with check (venue_id in (select id from public.venues where owner_id = auth.uid()));

-- ── #3  profiles: block self-update of trust/stat/role columns ──
create or replace function public.guard_profile_stats_change()
returns trigger language plpgsql as $$
begin
  -- auth.uid() is null for a Studio / service-role change, so admins are
  -- unaffected. Only a client session editing its OWN row is constrained.
  if auth.uid() is not null and auth.uid() = old.id then
    if new.trust_score   is distinct from old.trust_score
    or new.games_played  is distinct from old.games_played
    or new.games_hosted  is distinct from old.games_hosted
    or new.cancellations is distinct from old.cancellations then
      raise exception 'PROFILE_FIELD_NOT_EDITABLE';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_stats_change_trg on public.profiles;
create trigger guard_profile_stats_change_trg before update on public.profiles
  for each row execute function public.guard_profile_stats_change();

-- ── #4  venues: block owner self-grant of platform-controlled fields ──
create or replace function public.guard_venue_privileged_change()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if tg_op = 'INSERT' then
      -- a fresh venue is always unverified, uncapped, owned by its creator
      if coalesce(new.verification_status, 'unverified') not in ('unverified', 'pending') then
        new.verification_status := 'unverified';
      end if;
      new.payout_cap := null;
      new.owner_id := auth.uid();
    elsif tg_op = 'UPDATE' then
      -- allow only the owner-initiated "submit for review" transition;
      -- never a self-grant to 'verified', never a payout-cap or owner change.
      if new.verification_status is distinct from old.verification_status
         and not (old.verification_status = 'unverified' and new.verification_status = 'pending') then
        raise exception 'VENUE_FIELD_NOT_EDITABLE';
      end if;
      if new.payout_cap is distinct from old.payout_cap
      or new.owner_id   is distinct from old.owner_id then
        raise exception 'VENUE_FIELD_NOT_EDITABLE';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_venue_privileged_change_trg on public.venues;
create trigger guard_venue_privileged_change_trg
  before insert or update on public.venues
  for each row execute function public.guard_venue_privileged_change();

-- ── #7  venue_daily_stats: not for every authenticated user ────
do $$
begin
  if exists (select 1 from pg_class where relname = 'venue_daily_stats'
             and relnamespace = 'public'::regnamespace) then
    execute 'revoke select on public.venue_daily_stats from authenticated';
    -- keep it available to service-role / super-admin dashboards only.
  end if;
end$$;

-- ── tournament_teams: captain UPDATE needs a WITH CHECK ────────
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'tournament_teams'
               and policyname = 'tournament_teams_update_captain') then
    drop policy "tournament_teams_update_captain" on public.tournament_teams;
    create policy "tournament_teams_update_captain" on public.tournament_teams
      for update
      using  (captain_id = auth.uid())
      with check (captain_id = auth.uid());
  end if;
end$$;

-- ── DONE ─────────────────────────────────────────────────────────
