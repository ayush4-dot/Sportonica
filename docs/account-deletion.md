# Delete Account

Direct, self-serve account deletion. No service-role key or support step on the
request path.

## Flow

`Profile → Login & Security` → the red **Delete Account** card
([`SecuritySettings.tsx`](../src/app/profile/security/SecuritySettings.tsx)):

1. Click **Delete Account** → the button arms (shows **Yes, delete my account** +
   **Cancel**).
2. Click **Yes, delete my account** → calls `deleteMyAccount()`, then
   `signOut({ scope: 'global' })`, clears local/session storage, and
   hard-redirects to `/`.

A one-tap confirm is the only friction — no modal, no "type DELETE", no
re-authentication. The [`/account-deletion`](../src/app/(legal)/account-deletion/page.tsx)
page explains what's removed vs. anonymised.

## Server action

[`deleteMyAccount`](../src/lib/auth/deleteAccount.ts) (`"use server"`):

- user id from the verified session only (`sb.auth.getUser()`);
- in-process double-submit guard;
- **calls `sb.rpc('delete_own_account')`** — the caller's own session, no
  service-role key. This is the whole deletion.
- Fallback, only if that RPC isn't installed: service-role
  `admin.auth.admin.deleteUser()`.
- Best-effort avatar-file cleanup (service key; the RPC nulls the storage rows'
  owner regardless).

Result codes: `NOT_SIGNED_IN`, `DELETE_BLOCKED` (FK — pre-RPC only),
`UNAVAILABLE` (RPC missing + no key), `UNKNOWN`.

## Database — `db/delete_own_account.sql`

**Run once in the Supabase SQL editor** (idempotent). Creates
`public.delete_own_account()` — `SECURITY DEFINER`, granted to `authenticated`,
acts on `auth.uid()`. In one transaction: cancels upcoming `court_bookings`
(frees the slot) and deletes event `bookings`; anonymises `court_bookings` +
`payments` (`user_id → null`); sweeps every FK referencing `auth.users(id)` /
`public.profiles(id)` (discovered at run time); `delete from auth.users`. Also
flips `payments.user_id` → nullable + `ON DELETE SET NULL`.

Until this runs, deletion uses the service-role fallback (needs
`SUPABASE_SERVICE_ROLE_KEY`).

## Optional

- [`docs/db/account-deletion-introspection.sql`](db/account-deletion-introspection.sql)
  — read-only queries to verify which tables the sweep touches.
- DB-backed idempotency lock (replacing the in-process guard).
