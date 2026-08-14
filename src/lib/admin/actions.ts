"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyCourtBooked } from "@/lib/mail/notify";
import { actionError, type ActionError } from "@/lib/actionError";

// Every server action re-checks auth. Server Functions are reachable by
// direct POST, so we never trust the client (per Next.js data-security guide).
async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// ── VENUES ───────────────────────────────────────────────────────
export async function createVenue(input: {
  name: string;
  venue_type?: string;
  address?: string;
  phone?: string;
  sports?: string[];
  amenities?: string[];
  lat?: number | null;
  lng?: number | null;
  description?: string;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("venues")
    .insert({ ...input, owner_id: user.id })
    .select()
    .single();
  if (error) return actionError(error.message);
  revalidatePath("/admin/venues");
  return data;
}

export async function updateVenue(id: string, patch: Record<string, unknown>) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.from("venues").update(patch).eq("id", id).select().single();
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${id}`);
  revalidatePath("/admin/venues");
  return data;
}

// Upload a venue photo to Supabase Storage and append its public URL to the
// venue's photos array. Expects a 'venue-photos' storage bucket (public).
export async function uploadVenuePhoto(venueId: string, file: File): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${venueId}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage.from("venue-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (upErr) return actionError(upErr.message);

  const { data: pub } = sb.storage.from("venue-photos").getPublicUrl(path);
  const url = pub.publicUrl;

  // Append to the venue's photos array
  const { data: venue } = await sb.from("venues").select("photos").eq("id", venueId).single();
  const photos = [...(venue?.photos ?? []), url];
  const { error } = await sb.from("venues").update({ photos }).eq("id", venueId);
  if (error) return actionError(error.message);

  revalidatePath(`/admin/venues/${venueId}`);
  return url;
}

// Add a photo by URL (fallback when not uploading a file).
export async function addVenuePhotoUrl(venueId: string, url: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data: venue } = await sb.from("venues").select("photos").eq("id", venueId).single();
  const photos = [...(venue?.photos ?? []), url];
  const { error } = await sb.from("venues").update({ photos }).eq("id", venueId);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venueId}`);
}

// Remove a photo from the venue's array.
export async function removeVenuePhoto(venueId: string, url: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data: venue } = await sb.from("venues").select("photos").eq("id", venueId).single();
  const photos = (venue?.photos ?? []).filter((p: string) => p !== url);
  const { error } = await sb.from("venues").update({ photos }).eq("id", venueId);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venueId}`);
}

// ── COURTS ───────────────────────────────────────────────────────
export async function createCourt(input: {
  venue_id: string;
  name: string;
  sport: string;
  surface?: string;
  capacity?: number;
  base_price?: number;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.from("courts").insert(input).select().single();
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${input.venue_id}`);
  return data;
}

export async function updateCourt(id: string, venue_id: string, patch: Record<string, unknown>) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("courts").update(patch).eq("id", id);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venue_id}`);
}

// ── OPENING HOURS ────────────────────────────────────────────────
// Replace the whole weekly template for a court in one shot.
export async function setCourtHours(
  court_id: string,
  venue_id: string,
  rows: { dow: number; open_time: string; close_time: string }[]
) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  await sb.from("court_hours").delete().eq("court_id", court_id);
  if (rows.length) {
    const { error } = await sb.from("court_hours").insert(rows.map((r) => ({ ...r, court_id })));
    if (error) return actionError(error.message);
  }
  revalidatePath(`/admin/venues/${venue_id}/courts/${court_id}`);
}

// ── BLOCKS (the one-tap "block slot" for walk-ins/maintenance) ───
export async function createBlock(input: {
  court_id: string;
  venue_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string;
  note?: string;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { court_id, starts_at, ends_at, reason = "manual", note } = input;
  const { data, error } = await sb
    .from("court_blocks")
    .insert({ court_id, starts_at, ends_at, reason, note, created_by: user.id })
    .select()
    .single();
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${input.venue_id}/calendar`);
  return data;
}

export async function deleteBlock(id: string, venue_id: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("court_blocks").delete().eq("id", id);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venue_id}/calendar`);
}

// ── BOOKINGS via the atomic RPC (never read-check-write) ─────────
export async function bookCourt(input: {
  court_id: string;
  venue_id: string;
  starts_at: string;
  ends_at: string;
  customer_name?: string;
  phone?: string;
  source?: "platform" | "walk_in" | "phone";
  // "Open this slot to other players" — captured here, not acted on
  // until payment is approved (see book_court()/maybe_publish_hosted_event()
  // in supabase/payments.sql). Only meaningful for source:"platform".
  need_players?: boolean;
  spots_needed?: number;
  skill_level?: string;
  bring_own_gear?: boolean;
  notes?: string;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("book_court", {
    p_court_id: input.court_id,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_user_id: input.source && input.source !== "platform" ? null : user.id,
    p_customer: input.customer_name ?? null,
    p_source: input.source ?? "walk_in",
    p_host_spots_needed: input.need_players ? input.spots_needed ?? null : null,
    p_host_skill_level: input.need_players ? input.skill_level ?? null : null,
    p_host_bring_gear: input.need_players ? input.bring_own_gear ?? null : null,
    p_host_notes: input.need_players ? input.notes ?? null : null,
    p_phone: input.phone?.trim() || null,
  });
  if (error) {
    if (error.message.includes("SLOT_TAKEN")) return actionError("That time is already booked.");
    if (error.message.includes("SLOT_BLOCKED")) return actionError("That time is blocked.");
    return actionError(error.message);
  }
  revalidatePath(`/admin/venues/${input.venue_id}/calendar`);

  const price = Number(data?.price) || 0;
  const isPendingPlatformPayment = (input.source ?? "walk_in") === "platform" && price > 0;

  // Walk-in/phone bookings (staff-entered, already 'confirmed', no
  // payment flow applies) and free platform bookings still get the
  // immediate "booked" email. A paid platform booking isn't real until
  // admin approves the payment — notifyPaymentReviewed() sends the
  // "confirmed" email then; sending this one too would tell the
  // customer it's already paid when it isn't. Never let email failure
  // undo a successful booking — notify() swallows its own errors.
  if (!isPendingPlatformPayment) {
    const { data: court } = await sb.from("courts").select("name").eq("id", input.court_id).maybeSingle();
    await notifyCourtBooked({
      playerId: input.source === "platform" ? user.id : null,
      venueId: input.venue_id,
      courtName: court?.name ?? "Court",
      startsAt: input.starts_at,
      endsAt: input.ends_at,
      price,
      customerName: input.customer_name ?? null,
    });
  }

  return data;
}

export async function setBookingState(id: string, venue_id: string, state: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("court_bookings").update({ state }).eq("id", id);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venue_id}/bookings`);
}

// ── PRICING RULES ────────────────────────────────────────────────
export async function createPricingRule(input: {
  court_id: string;
  venue_id: string;
  label: string;
  kind: string;
  amount: number;
  days: number[];
  start_time?: string | null;
  end_time?: string | null;
  priority?: number;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { venue_id, ...row } = input;
  const { data, error } = await sb.from("pricing_rules").insert(row).select().single();
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venue_id}/pricing`);
  return data;
}

export async function togglePricingRule(id: string, venue_id: string, active: boolean) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("pricing_rules").update({ active }).eq("id", id);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${venue_id}/pricing`);
}

// ── STAFF ────────────────────────────────────────────────────────
export async function addStaff(input: { venue_id: string; user_id: string; role: string }) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("venue_staff").insert(input);
  if (error) return actionError(error.message);
  revalidatePath(`/admin/venues/${input.venue_id}/staff`);
}
