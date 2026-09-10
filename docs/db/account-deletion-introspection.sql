-- ================================================================
-- Account deletion — schema introspection (READ-ONLY)
--
-- Phase 1 of the Delete Account feature ships the UI + a hardened
-- server action, but the full `delete_own_account()` migration (Phase 2)
-- needs the *real* production schema, which has drifted from the
-- committed supabase/*.sql.
--
-- Run each block below in the Supabase SQL editor and paste the results
-- back. Everything here is a plain SELECT — it changes nothing.
-- ================================================================


-- ── 1. Every FK that references auth.users or public.profiles ─────
-- confdeltype: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT
select
  con.conname                                   as constraint_name,
  child_ns.nspname || '.' || child.relname       as child_table,
  att.attname                                    as child_column,
  parent_ns.nspname || '.' || parent.relname     as parent_table,
  case con.confdeltype
    when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
    when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint con
join pg_class child       on child.oid  = con.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
join pg_class parent      on parent.oid = con.confrelid
join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute att on att.attrelid = child.oid and att.attnum = k.attnum
where con.contype = 'f'
  and (
    (parent_ns.nspname = 'auth'   and parent.relname = 'users') or
    (parent_ns.nspname = 'public' and parent.relname = 'profiles')
  )
order by on_delete, child_table, child_column;


-- ── 2. Every public column that looks like a user reference ──────
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name ~ '^(user_id|owner_id|host_id|created_by|updated_by|performed_by|reviewed_by|claimed_by|manager_id|captain_id|sender_id|recipient_id|recipient|added_by|invited_by|from_user|to_user|from_user_id|to_user_id|requester_id|target_id|player_id|member_id|actor_id)$'
order by c.table_name, c.column_name;


-- ── 3. RLS policies on every table that has such a column ────────
with user_tables as (
  select distinct c.table_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.column_name ~ '^(user_id|owner_id|host_id|created_by|updated_by|performed_by|reviewed_by|claimed_by|manager_id|captain_id|sender_id|recipient_id|player_id|member_id)$'
)
select p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
from pg_policies p
join user_tables ut on ut.table_name = p.tablename
where p.schemaname = 'public'
order by p.tablename, p.cmd, p.policyname;


-- ── 4. Triggers on public tables (SECURITY DEFINER side effects) ─
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by table_name, trigger_name;


-- ── 5. SECURITY DEFINER functions already in the DB ─────────────
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;


-- ── 6. Does an account-deletion path already exist? ─────────────
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'auth')
  and p.proname ~* 'delete.*(account|user)|purge.*user|anonymi[sz]e';


-- ── 7. What a real deletion would touch — counts for one user ───
-- Replace the uuid with a genuine test account's id first.
-- (Comment back in / extend once query 2 shows the full table list.)
/*
with u as (select '00000000-0000-0000-0000-000000000000'::uuid as id)
select 'profiles'         as t, count(*) from public.profiles         p, u where p.id = u.id
union all select 'bookings',        count(*) from public.bookings        b, u where b.user_id = u.id
union all select 'court_bookings',  count(*) from public.court_bookings  b, u where b.user_id = u.id
union all select 'payments',        count(*) from public.payments        p, u where p.user_id = u.id
union all select 'games (host)',    count(*) from public.games           g, u where g.host_id = u.id
union all select 'events (host)',   count(*) from public.events          e, u where e.host_id = u.id
union all select 'notifications',   count(*) from public.notifications   n, u where n.user_id = u.id
union all select 'friend_requests', count(*) from public.friend_requests f, u where f.from_user = u.id or f.to_user = u.id
union all select 'tournaments',     count(*) from public.tournaments     x, u where x.owner_id = u.id
union all select 'venues (owner)',  count(*) from public.venues          v, u where v.owner_id = u.id;
*/
