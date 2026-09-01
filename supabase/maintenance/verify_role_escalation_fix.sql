-- ================================================================
-- READ-ONLY VERIFICATION: is fix_role_escalation.sql applied?
--
-- Run this in the Supabase SQL editor against any environment to
-- check whether supabase/maintenance/fix_role_escalation.sql has
-- actually landed. It creates/reads nothing — every statement is a
-- SELECT. Each row is one check; STATUS is PASS / FAIL / INFO / WARN.
--
-- A clean run is: every check PASS, the two INFO rows reviewed by a
-- human, and no WARN rows.
-- ================================================================

with checks as (

  -- 1. guard function exists and is SECURITY DEFINER with a pinned search_path
  select
    1 as ord,
    'guard_profile_role_change() exists + SECURITY DEFINER' as check_name,
    case
      when p.oid is null then 'FAIL'
      when not p.prosecdef then 'FAIL'
      when not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%'
      ) then 'FAIL'
      else 'PASS'
    end as status,
    coalesce(
      case
        when p.oid is null then 'function not found'
        when not p.prosecdef then 'exists but is SECURITY INVOKER'
        else 'security definer, search_path pinned'
      end,
      'function not found'
    ) as detail
  from (select 1) _
  left join pg_proc p
    on p.pronamespace = 'public'::regnamespace
   and p.proname = 'guard_profile_role_change'

  union all

  -- 2. guard function body whitelists the transitions the app performs
  --    and falls back to is_super_admin() for everything else
  select 2,
    'guard body: self-service whitelist + is_super_admin() fallback',
    case
      when d.def is null then 'FAIL'
      when d.def ilike '%organizer_pending%'
       and d.def ilike '%is_super_admin()%'
       and (d.def ilike '%player%' and d.def ilike '%venue_owner%')
       and d.def ilike '%raise exception%'
        then 'PASS'
      else 'FAIL'
    end,
    case
      when d.def is null then 'function not found'
      when d.def not ilike '%organizer_pending%'
        then 'missing player -> organizer_pending branch (this is the broken draft)'
      when d.def not ilike '%is_super_admin()%'
        then 'missing is_super_admin() fallback'
      else 'whitelists player<->venue_owner, player->organizer_pending, else super_admin only'
    end
  from (
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'guard_profile_role_change'
    limit 1
  ) d
  right join (select 1) _ on true

  union all

  -- 3. trigger is present, BEFORE UPDATE, FOR EACH ROW, and enabled
  select 3,
    'guard_profile_role_change_trg on public.profiles (BEFORE UPDATE, row, enabled)',
    case
      when t.tgname is null then 'FAIL'
      when t.tgenabled = 'D' then 'FAIL'
      when (t.tgtype & 2) = 0 then 'FAIL'        -- bit 1 (value 2) = BEFORE
      when (t.tgtype & 1) = 0 then 'FAIL'        -- bit 0 (value 1) = FOR EACH ROW
      when (t.tgtype & 16) = 0 then 'FAIL'       -- bit 4 (value 16) = UPDATE
      else 'PASS'
    end,
    coalesce(
      case
        when t.tgname is null then 'trigger not found'
        when t.tgenabled = 'D' then 'trigger exists but is DISABLED'
        else 'enabled, timing/level/event ok -> ' || pg_get_triggerdef(t.oid)
      end,
      'trigger not found'
    )
  from (select 1) _
  left join pg_trigger t
    on t.tgrelid = 'public.profiles'::regclass
   and t.tgname = 'guard_profile_role_change_trg'
   and not t.tgisinternal

  union all

  -- 4. handle_new_user() sanitizes a client-claimed role on signup
  select 4,
    'handle_new_user() rejects a privileged role from signup metadata',
    case
      when d.def is null then 'FAIL'
      when d.def ilike '%raw_user_meta_data%role%'
       and d.def ilike '%not in%(%''player''%,%''venue_owner''%)%'
        then 'PASS'
      when d.def ilike '%not in%(%''player''%,%''venue_owner''%)%'
        then 'PASS'
      else 'FAIL'
    end,
    case
      when d.def is null then 'function not found'
      when d.def ilike '%not in%(%''player''%,%''venue_owner''%)%'
        then 'clamps unknown/elevated role to player'
      else 'copies raw_user_meta_data->>''role'' without a whitelist'
    end
  from (
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'handle_new_user'
    limit 1
  ) d
  right join (select 1) _ on true

  union all

  -- 5. the old / broken-draft object names must NOT be present
  select 5,
    'no leftover objects from the superseded draft',
    case
      when exists (
        select 1 from pg_trigger
        where tgrelid = 'public.profiles'::regclass
          and tgname = 'profiles_guard_role_trg'
      )
      or exists (
        select 1 from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname = 'profiles_guard_role'
      )
      then 'WARN' else 'PASS'
    end,
    case
      when exists (
        select 1 from pg_trigger
        where tgrelid = 'public.profiles'::regclass
          and tgname = 'profiles_guard_role_trg'
      )
      or exists (
        select 1 from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname = 'profiles_guard_role'
      )
      then 'found profiles_guard_role / profiles_guard_role_trg -- the broken draft was run; drop them'
      else 'clean'
    end

  union all

  -- 6. INFO: current holders of elevated roles (review by hand)
  select 6,
    'elevated-role holders (review manually)',
    'INFO',
    'super_admin=' || count(*) filter (where role = 'super_admin')
      || ', admin=' || count(*) filter (where role = 'admin')
      || ' -- run the audit query below to list them'
  from public.profiles

  union all

  -- 7. INFO: profiles UPDATE policy is still the permissive self-only one
  --    (the trigger is what actually guards role; this is context)
  select 7,
    'profiles UPDATE RLS policy (context only)',
    'INFO',
    coalesce(
      string_agg(polname || ': ' || pg_get_expr(polqual, polrelid), ' | '),
      'no UPDATE policy found'
    )
  from pg_policy
  where polrelid = 'public.profiles'::regclass
    and polcmd in ('w', '*')
)
select check_name, status, detail
from checks
order by
  case status when 'FAIL' then 0 when 'WARN' then 1 when 'INFO' then 2 else 3 end,
  ord;


-- ── Audit query: list every elevated account ─────────────────────
-- select id, full_name, role, created_at
-- from public.profiles
-- where role in ('super_admin', 'admin')
-- order by created_at;


-- ── Live functional test (optional, needs a throwaway player account) ──
-- Sign in as an ordinary test user in a separate session, then:
--   update public.profiles set role = 'super_admin' where id = auth.uid();
--     -> expected: ERROR  ROLE_CHANGE_NOT_ALLOWED
--   update public.profiles set role = 'venue_owner'  where id = auth.uid();
--     -> expected: succeeds (if the account started as 'player')
--   update public.profiles set role = 'organizer_pending' where id = auth.uid();
--     -> expected: succeeds (only from 'player')
