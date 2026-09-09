-- ────────────────────────────────────────────────────────────────
-- Notifications: let a user mark their own rows read, and dismiss
-- (delete) them. The /notifications page needs both; inserts still
-- only happen server-side (service role), so no INSERT policy here.
--
-- Apply once in the Supabase SQL editor. Idempotent.
-- ────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

-- Read own
drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Update own (used to flip a single row's `read` flag)
drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete own (the "dismiss" / X action)
drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own"
  on public.notifications for delete
  using (auth.uid() = user_id);
