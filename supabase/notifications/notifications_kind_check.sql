-- ================================================================
-- AUTHORITATIVE: public.notifications.kind CHECK constraint
--
-- Why this file exists: the notifications_kind_check constraint is
-- (re)declared in ~8 different feature files, each with its own
-- `drop constraint if exists` + `add constraint` pair listing only
-- the kinds that file happened to care about. Whichever file runs
-- LAST wins. In particular social/friends_and_dms.sql historically
-- narrowed it back down to 7 kinds, silently breaking every
-- payment_* / game_* / tournament_* notification if it was applied
-- after payments/ or play-together/.
--
-- This file is the single source of truth for the full set. It is
-- idempotent and order-independent — run it LAST, any time the
-- constraint might have drifted, or after adding a new kind here.
--
-- Keep this list in sync with:
--   - kind: "…" inserts in src/lib/mail/notify.ts and elsewhere in src/
--   - `insert into public.notifications (… kind …)` in the SQL files
-- If you add a new notification kind anywhere, add it here and re-run
-- this file.
-- ================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    -- group / event bell (original notifications.sql set)
    'joined', 'left', 'spots_needed', 'hosted', 'event',
    -- friends + DMs (social/friends_and_dms.sql)
    'friend_request', 'friend_accepted',
    -- court-booking payments (payments/payments.sql)
    'payment_submitted', 'payment_approved', 'payment_rejected',
    -- Play Together games (play-together/play_together.sql)
    'game_published', 'game_joined', 'game_left', 'game_cancelled',
    'game_join_requested', 'game_join_rejected',
    -- Play Together join-request payments (play-together/play_together_payments.sql)
    'game_payment_required', 'game_payment_reminder',
    'game_payment_submitted', 'game_payment_verified',
    'game_payment_rejected', 'game_payment_expired',
    'game_host_payment_submitted', 'game_host_payment_expired',
    -- Play Together cash option (play-together/play_together_cash_payment.sql)
    'game_payment_cash_selected',
    -- tournaments (tournaments/tournaments.sql) + organizer flow
    'tournament_published', 'tournament_registration_submitted',
    'tournament_payment_verified', 'tournament_payment_rejected',
    'tournament_announcement', 'tournament_match_scheduled',
    'tournament_venue_booking_updated', 'organizer_request_reviewed'
  ));

-- ── Verify: any existing rows the new constraint would reject? ────
-- Run BEFORE trusting the ALTER above on a live DB. If this returns
-- rows, add those kinds to the list rather than letting the ALTER
-- fail (Postgres validates existing rows unless you add NOT VALID).
-- select kind, count(*)
-- from public.notifications
-- where kind not in (
--   'joined','left','spots_needed','hosted','event',
--   'friend_request','friend_accepted',
--   'payment_submitted','payment_approved','payment_rejected',
--   'game_published','game_joined','game_left','game_cancelled',
--   'game_join_requested','game_join_rejected',
--   'game_payment_required','game_payment_reminder',
--   'game_payment_submitted','game_payment_verified',
--   'game_payment_rejected','game_payment_expired',
--   'game_host_payment_submitted','game_host_payment_expired',
--   'game_payment_cash_selected',
--   'tournament_published','tournament_registration_submitted',
--   'tournament_payment_verified','tournament_payment_rejected',
--   'tournament_announcement','tournament_match_scheduled',
--   'tournament_venue_booking_updated','organizer_request_reviewed'
-- )
-- group by kind;

-- ── Confirm the constraint is what we expect ─────────────────────
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.notifications'::regclass
--   and conname = 'notifications_kind_check';
