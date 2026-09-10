-- ================================================================
-- Sportonica — self-serve account deletion
-- Run this whole file in the Supabase SQL editor. Safe to re-run.
--
-- Creates public.delete_own_account(): a SECURITY DEFINER function the
-- signed-in user calls to permanently erase their own account with NO
-- service-role key and NO support step. It:
--   1. releases the user's upcoming court/game slots,
--   2. anonymises records that must be retained (payments, past court
--      bookings),
--   3. clears every other table that references the user — nulling the
--      column where it's nullable, deleting the row where it isn't,
--      discovered from the live foreign-key catalog so no table is
--      missed,
--   4. deletes the auth.users row (cascades profiles, sessions, …).
--
-- The whole thing runs in the caller's transaction: it either completes
-- fully or rolls back — the account never ends up half-deleted.
-- ================================================================

begin;

-- ── 1. payments.user_id: keep the financial row, drop the link ────
-- The row is needed for accounting / fraud / disputes; the person is not.
-- Make the column nullable and the FK ON DELETE SET NULL so step 3's
-- generic sweep (and any direct auth.users delete) anonymises instead of
-- deleting.
do $$
declare v_con text;
begin
  if to_regclass('public.payments') is null then
    raise notice 'payments table not present — skipping FK adjustment';
    return;
  end if;

  begin
    alter table public.payments alter column user_id drop not null;
  exception when others then
    raise notice 'payments.user_id already nullable or not alterable: %', sqlerrm;
  end;

  select con.conname into v_con
  from pg_constraint con
  join pg_class c       on c.oid = con.conrelid
  join pg_namespace n   on n.oid = c.relnamespace
  join pg_attribute a   on a.attrelid = c.oid and a.attnum = con.conkey[1]
  where con.contype = 'f'
    and n.nspname = 'public' and c.relname = 'payments'
    and con.confrelid = 'auth.users'::regclass
    and a.attname = 'user_id';

  if v_con is not null then
    execute format('alter table public.payments drop constraint %I', v_con);
  end if;

  alter table public.payments
    add constraint payments_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
exception when others then
  raise notice 'payments FK adjustment skipped: %', sqlerrm;
end $$;


-- ── 2. The deletion function ─────────────────────────────────────
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r     record;
  pass  int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- 2a. Release upcoming reservations so the slots free up immediately.
  begin
    update public.court_bookings
       set state = 'cancelled'
     where user_id = v_uid
       and starts_at > now()
       and state not in ('cancelled','dropped','no_show','refunded');
  exception when undefined_table or undefined_column then null;
  end;

  begin
    delete from public.bookings where user_id = v_uid;   -- event joins: free future game slots
  exception when undefined_table or undefined_column then null;
  end;

  -- 2b. Anonymise records a venue keeps for its own books.
  begin
    update public.court_bookings
       set user_id = null,
           customer_name = 'Deleted user',
           phone = null
     where user_id = v_uid;
  exception when undefined_table or undefined_column then null;
  end;

  begin
    update public.payments set user_id = null where user_id = v_uid;
  exception when undefined_table or undefined_column then null;
  end;

  -- 2c. Generic sweep. For every FK pointing at auth.users(id) or
  -- public.profiles(id): null the column if it's nullable, else delete
  -- the referencing rows. Several passes so child-of-child rows that
  -- aren't ON DELETE CASCADE also clear.
  for pass in 1..6 loop
    for r in
      select n.nspname                                   as sch,
             c.relname                                    as tbl,
             a.attname                                    as col,
             a.attnotnull                                 as required
      from pg_constraint con
      join pg_class c        on c.oid = con.conrelid
      join pg_namespace n    on n.oid = c.relnamespace
      join pg_class fc       on fc.oid = con.confrelid
      join pg_namespace fn   on fn.oid = fc.relnamespace
      join lateral unnest(con.conkey) as k(attnum) on true
      join pg_attribute a    on a.attrelid = c.oid and a.attnum = k.attnum
      where con.contype = 'f'
        and n.nspname = 'public'
        and (
          (fn.nspname = 'auth'   and fc.relname = 'users') or
          (fn.nspname = 'public' and fc.relname = 'profiles')
        )
        -- payments already handled above (retain the row)
        and not (c.relname = 'payments' and a.attname = 'user_id')
    loop
      begin
        if r.required then
          execute format('delete from %I.%I where %I = $1', r.sch, r.tbl, r.col) using v_uid;
        else
          execute format('update %I.%I set %I = null where %I = $1 and %I is not null',
                         r.sch, r.tbl, r.col, r.col, r.col) using v_uid;
        end if;
      exception when others then
        -- a later pass, or the final cascade, may clear this — keep going
        null;
      end;
    end loop;
  end loop;

  -- 2d. Remove the auth user. Cascades public.profiles (profiles.id
  -- references auth.users on delete cascade), auth.identities,
  -- auth.sessions, and anything else defined ON DELETE CASCADE. If a
  -- blocker remains this RAISES and the whole call rolls back — the
  -- account is never left half-deleted.
  delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_own_account() is
  'Permanently deletes the calling user''s own account and associated data. SECURITY DEFINER; callable only by authenticated users on their own account (auth.uid()).';

revoke all     on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;

commit;

-- ── Verify (optional) ───────────────────────────────────────────
-- select proname, prosecdef from pg_proc where proname = 'delete_own_account';
-- select conname, confdeltype from pg_constraint
--   where conrelid = 'public.payments'::regclass and contype = 'f';

-- ── Manual test (in a throwaway account's session) ──────────────
-- select public.delete_own_account();
-- Then: the auth.users row is gone, profiles cascaded, court_bookings
-- for that user show user_id IS NULL, payments rows retained with
-- user_id IS NULL.
