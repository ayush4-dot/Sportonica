"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

const SPORT_COLOR: Record<string, string> = {
  Futsal: "#2E7D5B", Football: "#22c55e", Basketball: "#A78BFA", Cricket: "#f97316",
  Volleyball: "#3b82f6", Badminton: "#a855f7", Tennis: "#ec4899", Running: "#60a5fa",
};

// Create an official event. `kind` is venue_event or platform_event.
// Venue owners can only attach to venues they own; super admin can do anything.
export async function createOfficialEvent(input: {
  kind: "venue_event" | "platform_event";
  title: string;
  sport: string;
  venue_name: string;
  venue_id?: string | null;
  event_date: string;     // ISO (Kathmandu)
  max_players: number;
  fee: number;
  description?: string;
  organizer_name: string;
  venue_lat?: number | null;
  venue_lng?: number | null;
  skill_level?: string;
}) {
  const { sb, user } = await requireUser();

  // If a platform event, verify caller is super admin
  if (input.kind === "platform_event") {
    const { data: ok } = await sb.rpc("is_super_admin");
    if (!ok) throw new Error("FORBIDDEN");
  }

  // Venue events inherit the venue's saved location automatically.
  let lat = input.venue_lat ?? null;
  let lng = input.venue_lng ?? null;
  if (input.kind === "venue_event" && input.venue_id && (lat == null || lng == null)) {
    const { data: v } = await sb.from("venues").select("lat, lng").eq("id", input.venue_id).maybeSingle();
    lat = v?.lat ?? null;
    lng = v?.lng ?? null;
  }

  const { data, error } = await sb.from("events").insert({
    host_id: user.id,
    event_type: input.kind,
    organizer_name: input.organizer_name,
    title: input.title,
    sport: input.sport,
    venue: input.venue_name,
    venue_id: input.venue_id ?? null,
    event_date: input.event_date,
    max_players: input.max_players,
    min_players: 2,
    fee: input.fee,
    description: input.description ?? null,
    status: "open",
    flash: false,
    sport_color: SPORT_COLOR[input.sport] ?? "#006241",
    venue_lat: lat,
    venue_lng: lng,
    skill_level: input.skill_level ?? "any",
  }).select().single();

  if (error) throw new Error(error.message);
  revalidatePath("/discover");
  return data;
}

// Delete/cancel an event (moderation — super admin, or the host).
export async function cancelEvent(eventId: string) {
  const { sb } = await requireUser();
  const { error } = await sb.from("events").update({ status: "cancelled" }).eq("id", eventId);
  if (error) throw new Error(error.message);
  revalidatePath("/discover");
}
