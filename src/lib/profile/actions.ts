"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, type ActionError } from "@/lib/actionError";
import { isValidLocalPhone, normalizePhone, PHONE_ERROR } from "@/lib/validation/identity";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// Set your own role once, from the welcome step after a Google sign-in.
// Deliberately cannot grant super_admin — only the platform console does that.
export async function setMyRole(role: "player" | "venue_owner"): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const { error } = await sb.from("profiles").update({ role }).eq("id", user.id);
  if (error) return actionError(error.message);

  // Middleware gates /admin on user_metadata, so keep the two in step.
  // If this fails the role is still saved — don't block the user on it.
  try {
    await sb.auth.updateUser({ data: { role } });
  } catch (e) {
    console.error("[setMyRole] metadata sync failed:", e);
  }

  revalidatePath("/profile");
  revalidatePath("/welcome");
}

export async function updateProfile(patch: {
  full_name?: string;
  phone?: string;
  bio?: string;
  city?: string;
  sports?: string[];
  is_public?: boolean;
}): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // Explicit allowlist — the action is reachable by direct POST, so a
  // spread `patch` could otherwise carry role / trust_score / stat
  // columns (the DB trigger in rls_hardening.sql also blocks those, this
  // is defence-in-depth).
  const clean: Record<string, unknown> = {};
  if (typeof patch.full_name === "string") clean.full_name = patch.full_name.trim().slice(0, 80);
  if (typeof patch.bio === "string") clean.bio = patch.bio.trim().slice(0, 500);
  if (typeof patch.city === "string") clean.city = patch.city.trim().slice(0, 80);
  if (Array.isArray(patch.sports)) clean.sports = patch.sports.slice(0, 20).map((s) => String(s).slice(0, 40));
  if (typeof patch.is_public === "boolean") clean.is_public = patch.is_public;
  if (typeof patch.phone === "string") {
    const raw = patch.phone.trim();
    if (raw === "") {
      clean.phone = null; // clearing it is allowed
    } else if (!isValidLocalPhone(raw)) {
      return actionError(PHONE_ERROR);
    } else {
      clean.phone = normalizePhone(raw);
    }
  }
  if (Object.keys(clean).length === 0) return actionError("Nothing to update.");

  const { error } = await sb.from("profiles").update(clean).eq("id", user.id);
  if (error) {
    // profiles_phone_unique partial index (supabase/identity_validation.sql)
    if (error.code === "23505" || /profiles_phone_unique|duplicate/i.test(error.message)) {
      return actionError("An account with this phone number already exists.");
    }
    console.error("[updateProfile]", error.message);
    return actionError("Could not save your profile.");
  }
  revalidatePath("/profile");
}

// Claim a custom username. Lowercase, letters/numbers/hyphens, must be free.
export async function claimUsername(raw: string): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const username = raw.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(username)) {
    return actionError("3–24 characters, letters, numbers and hyphens only.");
  }
  const reserved = ["admin", "api", "login", "signup", "discover", "create", "league", "profile", "p", "settings"];
  if (reserved.includes(username)) return actionError("That name is reserved. Try another.");

  const { data: taken } = await sb
    .from("profiles").select("id").ilike("username", username).neq("id", user.id).maybeSingle();
  if (taken) return actionError("That username is already taken.");

  const { error } = await sb.from("profiles").update({ username }).eq("id", user.id);
  if (error) return actionError(error.message);

  revalidatePath("/profile");
  return username;
}

export async function uploadAvatar(file: File): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // Only formats that render everywhere (incl. the shareable card image).
  // AVIF/HEIC/SVG break Satori, so we reject them at the door.
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!okTypes.includes(file.type)) {
    return actionError("Use a JPG, PNG or WebP image (AVIF and HEIC aren't supported).");
  }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  };
  if (file.size > 5 * 1024 * 1024) {
    return actionError("Image must be under 5 MB.");
  }

  const ext = extMap[file.type];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage.from("avatars").upload(path, file, { upsert: false });
  if (upErr) return actionError(upErr.message);

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const { error } = await sb.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
  if (error) return actionError(error.message);

  revalidatePath("/profile");
  return pub.publicUrl;
}
