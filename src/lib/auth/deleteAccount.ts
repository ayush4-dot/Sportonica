"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeActionError, type ActionError } from "@/lib/actionError";

const SUPPORT_EMAIL = "support@sportonica.com";

// How recently the user must have signed in for a delete to go through.
// The dialog always makes them re-authenticate; this is the server-side
// enforcement of that (see REAUTH_REQUIRED below).
const REAUTH_MAX_AGE_MS = 5 * 60 * 1000;

// Machine codes the dialog switches on. Never leak raw Postgres/GoTrue text.
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "NOT_SIGNED_IN" | "BAD_CONFIRMATION" | "REAUTH_REQUIRED" | "DELETE_BLOCKED" | "UNAVAILABLE" | "UNKNOWN"; message: string };

export interface DeletionContext {
  /** The account can re-authenticate with a password (email/phone identity). */
  hasPassword: boolean;
  /** Only Google identity — re-auth must go through a fresh Google sign-in. */
  googleOnly: boolean;
  /** `user.email` — for phone accounts this is the synthetic address, which is
   *  exactly what `signInWithPassword` expects. */
  email: string | null;
  /** Best-effort count of the user's own future court bookings. */
  upcomingBookings: number;
}

/**
 * Read-only context the Security page passes to <DeleteAccountDialog>. Decides
 * which re-auth UI to show and lets the warning step mention pending bookings.
 */
export async function getDeletionContext(): Promise<DeletionContext | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || user.is_anonymous) return null;

  const providers: string[] = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata!.providers as string[])
    : user.app_metadata?.provider
      ? [user.app_metadata.provider as string]
      : [];
  const hasPassword = providers.includes("email") || providers.includes("phone");
  const googleOnly = providers.length > 0 && providers.every((p) => p === "google");

  let upcomingBookings = 0;
  try {
    const { count } = await sb
      .from("court_bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("starts_at", new Date().toISOString())
      .not("state", "in", "(cancelled,dropped,no_show,refunded)");
    upcomingBookings = count ?? 0;
  } catch {
    /* non-fatal — the warning copy just omits the count */
  }

  return { hasPassword, googleOnly, email: user.email ?? null, upcomingBookings };
}

// In-process guard against a double-submit hammering the delete path within a
// single server instance. A DB-backed lock replaces this in Phase 2.
const inFlight = new Map<string, number>();

/**
 * Permanently delete the caller's own account.
 *
 * Security model:
 *  - the user id is taken from the verified server session, never from the client;
 *  - the "type DELETE" confirmation is re-checked here;
 *  - the session must be freshly authenticated (the dialog forces a re-auth);
 *  - only a server-side service-role client can call the auth admin API — the
 *    key is never sent to the browser or the mobile shell.
 *
 * Phase 1 relies on `profiles.id … on delete cascade` for profile cleanup and
 * returns DELETE_BLOCKED (→ "email support") when another table still
 * references the user with RESTRICT/NO ACTION. Phase 2 adds a
 * `delete_own_account()` RPC that releases bookings and anonymizes payments so
 * this always succeeds.
 */
export async function deleteMyAccount(input: { confirmText: string }): Promise<DeleteAccountResult> {
  if (input?.confirmText !== "DELETE") {
    return { ok: false, code: "BAD_CONFIRMATION", message: "Type DELETE to confirm." };
  }

  const sb = await createClient();
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user || user.is_anonymous) {
    return { ok: false, code: "NOT_SIGNED_IN", message: "Your session has expired. Please sign in again." };
  }

  // Freshly-authenticated check. `last_sign_in_at` moves only on a real
  // sign-in, not on a background token refresh, so it's a sound "you
  // re-authenticated just now" signal.
  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  if (!lastSignIn || Date.now() - lastSignIn > REAUTH_MAX_AGE_MS) {
    return { ok: false, code: "REAUTH_REQUIRED", message: "For your security, confirm it's you to continue." };
  }

  const last = inFlight.get(user.id);
  if (last && Date.now() - last < 60_000) {
    return { ok: true }; // a delete for this user is already running; let the first one finish
  }
  inFlight.set(user.id, Date.now());

  try {
    const jar = await cookies();
    jar.set("sxn_del", user.id, { httpOnly: true, sameSite: "lax", maxAge: 60, path: "/" });
  } catch {
    /* cookies() is writable in a server action; ignore if the runtime disagrees */
  }

  // ── Primary path: the self-serve RPC. `public.delete_own_account()` runs
  // as the caller (auth.uid()), clears every table that references the user,
  // and deletes the auth row itself — no service-role key, no support step.
  // (supabase/auth/delete_own_account.sql) ──
  const { error: rpcErr } = await sb.rpc("delete_own_account");
  if (!rpcErr) {
    await bestEffortStorageCleanup(user.id);
    inFlight.delete(user.id);
    return { ok: true };
  }

  const rpcCode = (rpcErr as { code?: string }).code ?? "";
  const rpcMissing = /PGRST202|PGRST203/.test(rpcCode)
    || /could not find the function|does not exist|schema cache/i.test(rpcErr.message);

  if (!rpcMissing) {
    // The RPC is installed but failed for a real reason — don't paper over it
    // with the admin API (which would hit the same DB state). Log, generic message.
    console.error("[deleteMyAccount] delete_own_account failed:", rpcErr.message);
    inFlight.delete(user.id);
    return { ok: false, code: "UNKNOWN", message: "We couldn't delete your account right now. Please try again." };
  }

  // ── Fallback: RPC not installed yet → service-role admin delete. ──
  console.warn("[deleteMyAccount] delete_own_account RPC missing — using admin API fallback");
  let admin;
  try {
    admin = createServiceClient();
  } catch {
    inFlight.delete(user.id);
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "Account deletion is temporarily unavailable. Please try again in a few minutes.",
    };
  }

  await bestEffortStorageCleanup(user.id, admin);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    const raw = `${error.message} ${(error as { code?: string }).code ?? ""}`.toLowerCase();
    console.error("[deleteMyAccount] admin deleteUser failed:", error.message);
    inFlight.delete(user.id);
    if (raw.includes("23503") || raw.includes("foreign key") || raw.includes("still referenced") || raw.includes("violates")) {
      return {
        ok: false,
        code: "DELETE_BLOCKED",
        message: `We couldn't finish deleting your account automatically. Email ${SUPPORT_EMAIL} and we'll complete it for you.`,
      };
    }
    return safeActionErrorResult(error);
  }

  inFlight.delete(user.id);
  return { ok: true };
}

// Remove the user's uploaded files. Needs a service-role client; when one
// isn't available the `delete_own_account()` RPC has already nulled the
// storage rows' owner, so at worst a few blobs are left orphaned.
async function bestEffortStorageCleanup(
  userId: string,
  admin?: ReturnType<typeof createServiceClient>,
): Promise<void> {
  try {
    const client = admin ?? createServiceClient();
    const { data: files } = await client.storage.from("avatars").list(userId);
    if (files?.length) {
      await client.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (e) {
    console.error("[deleteMyAccount] storage cleanup skipped:", e instanceof Error ? e.message : e);
  }
}

function safeActionErrorResult(error: unknown): DeleteAccountResult {
  const e: ActionError = safeActionError(error, "We couldn't delete your account right now. Please try again.");
  return { ok: false, code: "UNKNOWN", message: e.message };
}
