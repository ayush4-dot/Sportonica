# Delete Account

Self-serve, permanent account deletion. No support step, no service-role key
required on the request path.

## Flow

`Profile → Login & Security → Delete Account` opens
[`DeleteAccountDialog`](../src/app/profile/security/DeleteAccountDialog.tsx):

1. **Warning** — what happens to each data category; links the
   [policy page](../src/app/(legal)/account-deletion/page.tsx).
2. **Strong confirmation** — type `DELETE` exactly.
3. **Re-authentication** — password re-entry (email/phone accounts) or a fresh
   Google sign-in (Google-only; returns to `/profile/security?reauth=1`).
4. **Deleting → Done** → `signOut({ scope: 'global' })`, clear storage,
   hard-redirect to `/`.

## Server action

[`deleteMyAccount`](../src/lib/auth/deleteAccount.ts) (`"use server"`):

- user id from the verified session only;
- re-checks the `DELETE` confirmation and `last_sign_in_at` freshness (5 min);
- in-process double-submit guard;
- **calls `sb.rpc('delete_own_account')`** — the caller's own session, no
  service-role key. This is the whole deletion.
- Fallback, only if that RPC isn't installed yet: service-role
  `admin.auth.admin.deleteUser()`.
- Best-effort avatar-file cleanup (needs the service key; the RPC nulls the
  storage rows' owner regardless, so at worst a few blobs are orphaned).

## Database — `db/delete_own_account.sql`

**Run this once in the Supabase SQL editor** (idempotent). It:

1. Makes `payments.user_id` nullable + FK `ON DELETE SET NULL` — financial rows
   are retained, unlinked from the person.
2. Creates `public.delete_own_account()` — `SECURITY DEFINER`, granted to
   `authenticated` only, acts on `auth.uid()`. In one transaction it:
   - cancels the user's upcoming `court_bookings` (frees the slot) and deletes
     their event `bookings`;
   - anonymises all their `court_bookings` (`user_id → null`, name/phone cleared)
     and `payments` (`user_id → null`);
   - sweeps **every** FK that references `auth.users(id)` or `public.profiles(id)`
     — discovered from `pg_constraint` at run time — nulling nullable columns,
     deleting non-nullable rows, over several passes for nested FKs;
   - `delete from auth.users where id = auth.uid()` (cascades `profiles`,
     `auth.sessions`, …). If a blocker somehow remains this raises and the whole
     call rolls back — the account is never left half-deleted.

Until this file is run, deletion uses the service-role fallback (needs
`SUPABASE_SERVICE_ROLE_KEY`, and can be blocked by a RESTRICT FK for users with
payment/hosting history — that's exactly what the RPC fixes).

## Optional follow-ups

- [`docs/db/account-deletion-introspection.sql`](db/account-deletion-introspection.sql)
  — read-only queries to review exactly which tables the sweep touches, and to
  confirm nothing unexpected has a RESTRICT FK.
- DB-backed idempotency lock (replacing the in-process guard).
- If any table needs "anonymise, don't null" (e.g. keep a display name on public
  reviews), add an explicit step in `delete_own_account()` before the generic
  sweep, like the `payments` / `court_bookings` steps.
