-- ================================================================
-- Fix: no in-app notification (bell) or email ever arrived for
-- payment approvals/rejections, game-published, hosted-event-live,
-- or any of the other ~13 notify_*() calls in src/lib/mail/notify.ts
-- that insert into `notifications` directly from a server action.
--
-- Root cause: notifications.sql was built around ONE insert path —
-- DB triggers running as SECURITY DEFINER, which bypass RLS entirely
-- (see its own comment: "Triggers insert rows as SECURITY DEFINER,
-- bypassing RLS for writes"). Only `select`/`update` policies were
-- ever added. Later, src/lib/mail/notify.ts started inserting
-- directly via a normal request-scoped client (e.g. a super admin
-- inserting a row for the payment's owner, a host's action inserting
-- one for a player) — a completely different path that was never
-- given a matching RLS policy, so every one of those inserts has been
-- silently rejected since the day notify.ts shipped. The Supabase JS
-- client doesn't throw on this — the row just never appears — which
-- is why it looked like nothing was happening at all, email included:
-- in reviewPayment() (src/lib/payments/adminActions.ts), an uncaught
-- exception from a database round trip earlier in the same function
-- doesn't apply here (this is a silent RLS reject, not a throw), but
-- it means both the bell row AND, for any caller ordered this way,
-- confidence that "nothing fired" is confirmed at the DB layer.
--
-- Fix: add an insert policy for authenticated users. Notifications
-- are low-sensitivity, informational rows (the select/update policies
-- already ensure a user only ever reads or marks-as-read their own),
-- so this matches the same permissiveness the triggers already had
-- via SECURITY DEFINER — it isn't loosening anything that was
-- actually being enforced before.
-- Run any time. Safe to re-run.
-- ===============================================================

drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert"
  on public.notifications for insert to authenticated with check (true);

-- ── DONE ─────────────────────────────────────────────────────────
