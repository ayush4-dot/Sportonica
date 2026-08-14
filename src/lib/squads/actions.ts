"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, type ActionError } from "@/lib/actionError";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

export async function createSquad(input: {
  name: string;
  sport: string;
  area?: string;
  schedule?: string;
  description?: string;
  color?: string;
  cap?: number;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.from("squads").insert({
    creator_id: user.id,
    name: input.name.trim(),
    sport: input.sport,
    area: input.area?.trim() || null,
    schedule: input.schedule?.trim() || null,
    description: input.description?.trim() || null,
    color: input.color ?? "#2E7D5B",
    cap: input.cap ?? 20,
  }).select().single();
  if (error) return actionError(error.message);
  // creator auto-joins via DB trigger
  revalidatePath("/league");
  return data;
}

export async function joinSquad(squadId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // capacity check
  const { data: sq } = await sb.from("squads_with_counts")
    .select("member_count, cap").eq("id", squadId).maybeSingle();
  if (sq && sq.cap && sq.member_count >= sq.cap) return actionError("SQUAD_FULL");

  const { error } = await sb.from("squad_members").insert({
    squad_id: squadId, user_id: user.id, role: "member",
  });
  if (error && !error.message.includes("duplicate")) return actionError(error.message);
  revalidatePath("/league");
  revalidatePath(`/league/${squadId}`);
}

export async function leaveSquad(squadId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("squad_members")
    .delete().eq("squad_id", squadId).eq("user_id", user.id);
  if (error) return actionError(error.message);
  revalidatePath("/league");
  revalidatePath(`/league/${squadId}`);
}

// ── Member management (creator only) ────────────────────────────
// Remove someone from your squad.
export async function removeMember(squadId: string, userId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // Only the squad creator can remove others.
  const { data: sq } = await sb.from("squads").select("creator_id").eq("id", squadId).maybeSingle();
  if (!sq || sq.creator_id !== user.id) return actionError("FORBIDDEN");
  if (userId === user.id) return actionError("Can't remove yourself — leave the squad instead.");

  const { error } = await sb.from("squad_members")
    .delete().eq("squad_id", squadId).eq("user_id", userId);
  if (error) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
}

// Search players to invite (by name or username).
export async function searchPlayers(q: string, squadId: string): Promise<
  { id: string; name: string; username: string | null; avatar_url: string | null }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const term = q.trim();
  if (term.length < 2) return [];

  const { data: existing } = await sb
    .from("squad_members").select("user_id").eq("squad_id", squadId);
  const already = new Set((existing ?? []).map((m) => m.user_id));

  const { data } = await sb
    .from("profiles")
    .select("id, full_name, name, username, avatar_url")
    .or(`full_name.ilike.%${term}%,username.ilike.%${term}%,name.ilike.%${term}%`)
    .limit(10);

  return (data ?? [])
    .filter((p) => !already.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.full_name ?? p.name ?? p.username ?? "Player",
      username: p.username,
      avatar_url: p.avatar_url,
    }));
}

// Add a player directly to the squad (creator invites them in).
export async function addMember(squadId: string, userId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const { data: sq } = await sb.from("squads").select("creator_id").eq("id", squadId).maybeSingle();
  if (!sq || sq.creator_id !== user.id) return actionError("FORBIDDEN");

  const { error } = await sb.from("squad_members").insert({
    squad_id: squadId, user_id: userId, role: "member",
  });
  if (error && !error.message.includes("duplicate")) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
}

// Post a chat message. RLS guarantees only members can insert.
export async function sendSquadMessage(squadId: string, body: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const text = body.trim();
  if (!text) return;
  if (text.length > 1000) return actionError("Message too long.");
  const { error } = await sb.from("squad_messages").insert({
    squad_id: squadId, user_id: user.id, body: text,
  });
  if (error) return actionError(error.message);
}

// ── Squad settings (creator only, enforced by RLS) ──────────────
export async function setSquadLocked(squadId: string, locked: boolean) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("squads").update({ locked }).eq("id", squadId);
  if (error) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
  revalidatePath("/league");
}

export async function setSquadUnlisted(squadId: string, unlisted: boolean) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("squads").update({ unlisted }).eq("id", squadId);
  if (error) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
  revalidatePath("/league");
}

// ── Reporting (goes to the super admin's moderation queue) ──────
export async function fileReport(input: {
  target_type: "message" | "squad" | "user";
  target_id: string;
  reason: string;
  details?: string;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("reports").insert({
    reporter_id: user.id,
    target_type: input.target_type,
    target_id: input.target_id,
    reason: input.reason,
    details: input.details ?? null,
  });
  if (error) return actionError(error.message);
}

// ================================================================
// Join requests — for groups that need the owner's approval
// ================================================================

/** Ask to join. The owner gets a notification. */
export async function requestToJoin(squadId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("squad_requests").insert({
    squad_id: squadId,
    user_id: user.id,
  });
  if (error && !error.message.includes("duplicate")) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
}

/** Owner approves or declines. Triggers add the member and notify them. */
export async function decideRequest(
  requestId: string,
  squadId: string,
  decision: "approved" | "denied"
) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb
    .from("squad_requests")
    .update({ status: decision })
    .eq("id", requestId);
  if (error) return actionError(error.message);
  revalidatePath(`/league/${squadId}`);
}

/** Pending requests for a group the caller owns. */
export async function pendingRequests(squadId: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data } = await sb
    .from("squad_requests")
    .select("id, user_id, created_at, profiles:user_id(full_name, avatar_url)")
    .eq("squad_id", squadId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return data ?? [];
}
