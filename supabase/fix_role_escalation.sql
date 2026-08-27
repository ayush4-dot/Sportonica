-- ================================================================
-- BLOCKING PRE-LAUNCH FIX: profiles.role privilege escalation
--
-- Corrected version of a fix drafted against an older assumption of
-- the role model (plain player/venue_owner self-service only) — this
-- codebase already added an `organizer_pending` self-service
-- transition (organizer_approval_and_own_venue.sql, for "Request
-- organizer access"), which the original draft's whitelist didn't
-- know about. Running that version as-is would have silently broken
-- organizer access requests: every one would hit ROLE_CHANGE_FORBIDDEN
-- since a plain player isn't is_super_admin(). This version keeps that
-- draft's better security posture (default-deny + is_super_admin()
-- escape hatch, so a genuine admin action via a plain update still
-- works, not just via a dedicated RPC) but whitelists every
-- self-service transition the app actually performs today:
--   - player <-> venue_owner   (setMyRole(), /welcome RolePicker)
--   - player -> organizer_pending  (requestOrganizerAccess())
--
-- Two real problems, independent of each other:
--   1. profiles' only UPDATE policy is `using (id = auth.uid())` with
--      no column restriction — a client can PATCH their own row and
--      set role = 'super_admin' directly. The existing
--      guard_profile_role_change trigger already blocks most of this
--      (only allows player -> organizer_pending self-service) but
--      doesn't fall back to is_super_admin() for anything else, and
--      doesn't cover player <-> venue_owner either — meaning
--      setMyRole('venue_owner') may already be broken today if
--      organizer_approval_and_own_venue.sql is the live version. This
--      fix restores that transition explicitly.
--   2. handle_new_user() copies raw_user_meta_data->>'role' straight
--      into profiles on signup, and that metadata is client-supplied
--      to supabase.auth.signUp() directly from the browser (see
--      src/app/(auth)/signup/page.tsx) — bypassing the UI's
--      player/venue_owner dropdown and signing up with
--      { data: { role: 'super_admin' } } in the request body creates
--      an already-privileged account with no trigger involved at all,
--      since this only fires on UPDATE, not the initial INSERT.
--
-- Run this in the Supabase SQL editor. Safe to re-run.
-- ================================================================

-- ── 1. Audit first: who currently holds elevated roles? ──────────
-- Review this output BEFORE running the rest. Anyone unexpected
-- here may already have escalated.
select id, full_name, role, created_at
from public.profiles
where role in ('super_admin', 'admin')
order by created_at;

-- ── 2. Block role changes from the client ────────────────────────
-- Self-service stays allowed for the transitions the app actually
-- makes (RolePicker/setMyRole, requestOrganizerAccess). Anything else
-- requires an existing super_admin (checked via is_super_admin(), same
-- function every other privileged RPC in this codebase already uses).
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if coalesce(old.role, 'player') in ('player', 'venue_owner')
       and coalesce(new.role, '') in ('player', 'venue_owner') then
      return new;                                    -- setMyRole() toggle
    end if;
    if old.role = 'player' and new.role = 'organizer_pending' then
      return new;                                     -- requestOrganizerAccess()
    end if;
    if not public.is_super_admin() then
      raise exception 'ROLE_CHANGE_NOT_ALLOWED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role_change_trg on public.profiles;
create trigger guard_profile_role_change_trg
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- ── 3. Stop signup metadata from seeding a privileged role ───────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'player');
  if v_role not in ('player', 'venue_owner') then
    v_role := 'player';                -- never honour a claimed admin/organizer role at signup
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 4. Verify ────────────────────────────────────────────────────
-- Sign in as an ordinary test user and confirm each of these:
--   update public.profiles set role = 'super_admin' where id = auth.uid();
--     -> ERROR ROLE_CHANGE_NOT_ALLOWED
--   update public.profiles set role = 'venue_owner' where id = auth.uid();
--     -> succeeds (if that test account started as 'player')
--   update public.profiles set role = 'organizer_pending' where id = auth.uid();
--     -> succeeds only if that test account is currently 'player'

-- ── DONE ─────────────────────────────────────────────────────────
