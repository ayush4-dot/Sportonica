# Delete Account

Self-serve permanent account deletion. **Phase 1** (this) ships the full
user-facing flow and a hardened server action. **Phase 2** adds the database
migration that makes a hard delete always succeed.

## Flow (Phase 1)

`Profile → Login & Security → Delete Account` opens
[`DeleteAccountDialog`](../src/app/profile/security/DeleteAccountDialog.tsx):

1. **Warning** — lists what happens to each data category, links the
   [policy page](../src/app/(legal)/account-deletion/page.tsx). Cancel / Continue.
2. **Strong confirmation** — type `DELETE` exactly (case-sensitive); the
   button stays disabled otherwise.
3. **Re-authentication**
   - password / phone accounts → re-enter password
     (`supabase.auth.signInWithPassword`);
   - Google-only accounts → fresh `signInWithOAuth('google')`, which returns to
     `/profile/security?reauth=1` and re-opens the dialog at the final step.
4. **Deleting** → **Done** → `signOut({ scope: 'global' })`, clear
   local/session storage, hard-redirect to `/`.

## Server action

[`deleteMyAccount`](../src/lib/auth/deleteAccount.ts) (`"use server"`):

- user id comes from the verified session (`sb.auth.getUser()`), never the client;
- re-checks the `DELETE` confirmation;
- requires `user.last_sign_in_at` within 5 minutes (the re-auth enforcement) →
  `REAUTH_REQUIRED` otherwise;
- in-process `Map` guard against double-submit;
- service-role client (server-only) deletes the auth user; `profiles` cascades;
- **FK violation → `DELETE_BLOCKED`** → UI tells the user to email support. This
  is the known Phase 1 gap: `payments.user_id`, `games.host_id`,
  `tournaments.owner_id`, etc. reference the user with RESTRICT/NO ACTION, so a
  user with payment or hosting history can't be hard-deleted yet.

`SUPABASE_SERVICE_ROLE_KEY` must be set on the server (already required for phone
signup). It is never exposed to the browser or the Capacitor shell.

## Phase 2 — TODO

1. Run [`docs/db/account-deletion-introspection.sql`](db/account-deletion-introspection.sql)
   against production, paste results back.
2. Write `supabase/auth/delete_own_account.sql`: a `SECURITY DEFINER` function
   run as `auth.uid()` that, in one transaction —
   - cancels future `court_bookings` (`state = 'cancelled'`, releases the slot)
     and deletes future event `bookings`;
   - anonymises + retains `payments` (`user_id → null`, drop screenshot; needs
     an FK change to `ON DELETE SET NULL`);
   - cascades / anonymises every other user-referencing table from the
     introspection output;
   - `delete from auth.users where id = auth.uid()`.
3. Server action calls `rpc('delete_own_account')` then only falls back to
   `admin.auth.admin.deleteUser()`; drop the "contact support" path for handled
   cases.
4. Replace the in-process guard with a DB-backed lock.
5. Tighten the policy page with final retention wording.
