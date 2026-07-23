"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

// Set your own role once, from the welcome step after a Google sign-in.
// Deliberately cannot grant super_admin — only the platform console does that.
export async function setMyRole(role: "player" | "venue_owner") {
  const { sb, user } = await requireUser();

  const { error } = await sb.from("profiles").update({ role }).eq("id", user.id);
  if (error) throw new Error(error.message);

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
  bio?: string;
  city?: string;
  sports?: string[];
  is_public?: boolean;
}) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").update(patch).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

// Claim a custom username. Lowercase, letters/numbers/hyphens, must be free.
export async function claimUsername(raw: string) {
  const { sb, user } = await requireUser();
  const username = raw.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(username)) {
    throw new Error("3–24 characters, letters, numbers and hyphens only.");
  }
  const reserved = ["admin", "api", "login", "signup", "discover", "create", "league", "profile", "p", "settings"];
  if (reserved.includes(username)) throw new Error("That name is reserved. Try another.");

  const { data: taken } = await sb
    .from("profiles").select("id").ilike("username", username).neq("id", user.id).maybeSingle();
  if (taken) throw new Error("That username is already taken.");

  const { error } = await sb.from("profiles").update({ username }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  return username;
}

export async function uploadAvatar(file: File) {
  const { sb, user } = await requireUser();

  // Only formats that render everywhere (incl. the shareable card image).
  // AVIF/HEIC/SVG break Satori, so we reject them at the door.
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!okTypes.includes(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image (AVIF and HEIC aren't supported).");
  }

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  };
  const ext = extMap[file.type];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage.from("avatars").upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const { error } = await sb.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  return pub.publicUrl;
}
