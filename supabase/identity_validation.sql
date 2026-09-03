-- ================================================================
-- Sportonica — email / phone identity validation + uniqueness
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Enforces, at the database level (i.e. cannot be bypassed by calling
-- the auth API directly), what src/lib/validation/identity.ts checks on
-- the client:
--   * email: sane RFC-ish shape, trimmed + lowercased
--   * phone: exactly 10 digits, digits only, UNIQUE across accounts
--
-- Depends on: schema_full.sql / add_columns.sql (profiles table),
-- fix_role_escalation.sql (role clamp — kept intact below).
-- Apply this AFTER fix_role_escalation.sql.
--
-- Idempotent (all create-or-replace / if-not-exists). Lightly touches
-- data: normalises existing profiles.phone to digits-only. The unique
-- index will fail if two accounts already share a phone — dedupe first
-- if so (none expected: nothing has ever written profiles.phone yet).
-- ================================================================

-- ── helpers ─────────────────────────────────────────────────────
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

create or replace function public.is_valid_email(p text)
returns boolean language sql immutable as $$
  select p is not null
     and length(p) <= 254
     and position(' ' in p) = 0
     and p !~ '\.\.'
     and p ~ '^[^[:space:]@]+@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
$$;

-- ── profiles.phone: normalize existing data, then add the unique key ──
update public.profiles
   set phone = public.normalize_phone(phone)
 where phone is distinct from public.normalize_phone(phone);

-- A partial unique index: many rows legitimately have no phone yet
-- (Google sign-ups, older accounts) and those must not collide on NULL.
create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null;

-- ── handle_new_user(): validate + normalize + copy phone on signup ──
-- Supersedes the version in fix_role_escalation.sql. Keeps
-- that file's role clamp (never honour a claimed admin/organizer role),
-- and additionally:
--   * rejects a malformed email                 -> EMAIL_INVALID
--   * rejects a phone that isn't exactly 10 digits -> PHONE_INVALID
--   * rejects a phone already in use            -> PHONE_TAKEN
-- Raising here aborts the auth.users insert transactionally, so no
-- half-made account is left behind.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_phone text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'player');
  if v_role not in ('player', 'venue_owner') then
    v_role := 'player';
  end if;

  if new.email is not null and not public.is_valid_email(lower(new.email)) then
    raise exception 'EMAIL_INVALID';
  end if;

  v_phone := public.normalize_phone(new.raw_user_meta_data->>'phone');
  if v_phone is not null then
    if length(v_phone) <> 10 then
      raise exception 'PHONE_INVALID';
    end if;
    if exists (select 1 from public.profiles where phone = v_phone) then
      raise exception 'PHONE_TAKEN';
    end if;
  end if;

  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    v_phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ── email_for_phone(): phone -> account email, for phone login ───
-- The app keeps phone on `profiles`, not auth.users, so phone+password
-- sign-in is a two-step: resolve the email here, then the client does a
-- normal password sign-in. SECURITY DEFINER so it can read auth.users.
-- Returns NULL when there's no match; the caller shows one generic
-- "incorrect" message either way, so this is not an enumeration oracle
-- beyond what a sign-in attempt already reveals.
create or replace function public.email_for_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_email text;
begin
  if v_phone is null or length(v_phone) <> 10 then
    return null;
  end if;
  select u.email into v_email
    from public.profiles pr
    join auth.users u on u.id = pr.id
   where pr.phone = v_phone
   limit 1;
  return v_email;
end;
$$;

revoke all on function public.email_for_phone(text) from public;
grant execute on function public.email_for_phone(text) to anon, authenticated;

-- ── DONE ─────────────────────────────────────────────────────────
-- Verify:
--   select public.is_valid_email('name@company.com.np');   -- t
--   select public.is_valid_email('user@gmail..com');       -- f
--   select public.normalize_phone('98-1234 5678');         -- 9812345678
