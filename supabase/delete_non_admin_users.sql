-- Pre-launch user purge.
-- KEEP ONLY:
--   022d3389-5e5e-4d31-8ea1-d6f083573a36  admin        (super_admin)
--   dd72aad2-c163-48a1-9f57-d34fc2c591dc  river.itops1  (venue_owner)
-- Delete all 13 other accounts and cascade-erase their data.
--
-- Verified before running:
--   * 4 tournaments, all owned by super_admin        -> untouched (NO ACTION FK).
--   * 0 tournament team / roster / manager rows reference a deleted user.
--   * 5 play-together games hosted by kept accounts   -> untouched.
--   * river's venues / courts / staff / payments (3) / court bookings (4) -> untouched.
--   * river's 'active' self-partnership              -> untouched (both sides kept).
--   * Kept-account data removed, by explicit decision:
--       - river's 4 pending friend requests (all with deleted test accounts)
--       - river's 'joined' row in game 41bd870c (hosted by mail2deepeshk; game deleted)
--   * Blockers cleared first: mail2deepeshk's 1 game (host_id NO ACTION),
--     its notifications (game_id NO ACTION), and 1 payment (user_id NO ACTION;
--     payment_audit_logs cascade).
--
-- Run in the Supabase SQL editor against production. Review counts, then commit.

begin;

-- ── Preview: the 13 accounts to delete ───────────────────────
select u.id, u.email, p.role
from auth.users u
left join public.profiles p on p.id = u.id
where u.id <> all('{022d3389-5e5e-4d31-8ea1-d6f083573a36,dd72aad2-c163-48a1-9f57-d34fc2c591dc}'::uuid[])
order by p.role, u.email;

-- ── 1. Notifications tied to games hosted by deleted users ────
delete from public.notifications n
using public.games g
where n.game_id = g.id
  and g.host_id <> all('{022d3389-5e5e-4d31-8ea1-d6f083573a36,dd72aad2-c163-48a1-9f57-d34fc2c591dc}'::uuid[]);

-- ── 2. Games hosted by deleted users (game_players cascade) ───
delete from public.games
where host_id <> all('{022d3389-5e5e-4d31-8ea1-d6f083573a36,dd72aad2-c163-48a1-9f57-d34fc2c591dc}'::uuid[]);
-- expect: DELETE 1

-- ── 3. Payments of deleted users (payment_audit_logs cascade) ─
delete from public.payments
where user_id is not null
  and user_id <> all('{022d3389-5e5e-4d31-8ea1-d6f083573a36,dd72aad2-c163-48a1-9f57-d34fc2c591dc}'::uuid[]);
-- expect: DELETE 1

-- ── 4. Delete the users (all remaining data cascades) ────────
delete from auth.users
where id <> all('{022d3389-5e5e-4d31-8ea1-d6f083573a36,dd72aad2-c163-48a1-9f57-d34fc2c591dc}'::uuid[]);
-- expect: DELETE 13

-- ── Confirm ─────────────────────────────────────────────────
select id, full_name, role from public.profiles;   -- expect exactly 2 rows
select count(*) from public.tournaments;            -- expect 4
select count(*) from public.games;                  -- expect 5

-- All correct? then:
commit;
-- else:
-- rollback;
