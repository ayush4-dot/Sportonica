"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeActionError, type ActionError } from "@/lib/actionError";

const SUPPORT_EMAIL = "support@sportonica.com";

// Machine codes the UI switches on. Never leak raw Postgres/GoTrue text.
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "NOT_SIGNED_IN" | "DELETE_BLOCKED" | "UNAVAILABLE" | "UNKNOWN"; message: string };

// In-process guard against a double-submit hammering the delete path within a
// single server instance.
const inFlight = new Map<string, number>();

/**
 * Permanently delete the signed-in user's own account and data.
 *
 * Security model:
 *  - the user id comes from the verified server session, never from the client;
 *  - only a server-side service-role client can touch the auth admin API — the
 *    key is never sent to the browser or the mobile shell.
 *
 * Primary path is the `public.delete_own_account()` RPC (runs as the caller,
 * clears every FK, deletes the auth row). Falls back to the service-role admin
 * delete when that RPC isn't installed yet.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const sb = await createClient();
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user || user.is_anonymous) {
    return { ok: false, code: "NOT_SIGNED_IN", message: "Your session has expired. Please sign in again." };
  }

  const last = inFlight.get(user.id);
  if (last && Date.now() - last < 60_000) {
    return { ok: true }; // a delete for this user is already running; let the first finish
  }
  inFlight.set(user.id, Date.now());

  try {
    const jar = await cookies();
    jar.set("sxn_del", user.id, { httpOnly: true, sameSite: "lax", maxAge: 60, path: "/" });
  } catch {
    /* cookies() is writable in a server action; ignore if the runtime disagrees */
  }

  // ── Primary: the self-serve RPC (db/delete_own_account.sql). Runs as
  // auth.uid(), clears every referencing table, deletes the auth row. No
  // service-role key needed. ──
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
