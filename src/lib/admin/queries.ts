import { createClient } from "@/lib/supabase/server";
import type { Venue, Court, CourtBooking, CourtBlock, PricingRule, Payout } from "./types";

// All queries run server-side under the caller's RLS context, so they
// automatically scope to venues the user owns or staffs.

export async function getMyVenues(): Promise<Venue[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  // venues I own OR am staff on
  const { data: staffRows } = await sb.from("venue_staff").select("venue_id").eq("user_id", user.id);
  const ids = (staffRows ?? []).map((r) => r.venue_id);
  const { data } = await sb
    .from("venues")
    .select("*")
    .or(`owner_id.eq.${user.id}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`)
    .order("created_at", { ascending: true });
  return (data as Venue[]) ?? [];
}

export async function getVenue(id: string): Promise<Venue | null> {
  const sb = await createClient();
  const { data } = await sb.from("venues").select("*").eq("id", id).single();
  return (data as Venue) ?? null;
}

export async function getCourts(venueId: string | null): Promise<Court[]> {
  // An "own venue" tournament (no real venues row) has no courts to
  // schedule against — nothing to look up.
  if (!venueId) return [];
  const sb = await createClient();
  const { data } = await sb.from("courts").select("*").eq("venue_id", venueId).order("name");
  return (data as Court[]) ?? [];
}

export async function getCourtsForVenues(venueIds: string[]): Promise<Court[]> {
  if (!venueIds.length) return [];
  const sb = await createClient();
  const { data } = await sb.from("courts").select("*").in("venue_id", venueIds);
  return (data as Court[]) ?? [];
}

export async function getUpcomingBookings(venueIds: string[], limit = 50): Promise<CourtBooking[]> {
  if (!venueIds.length) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("court_bookings")
    .select("*")
    .in("venue_id", venueIds)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data as CourtBooking[]) ?? [];
}

export async function getBookingsInRange(
  courtIds: string[],
  from: string,
  to: string
): Promise<CourtBooking[]> {
  if (!courtIds.length) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("court_bookings")
    .select("*")
    .in("court_id", courtIds)
    .lt("starts_at", to)
    .gt("ends_at", from);
  return (data as CourtBooking[]) ?? [];
}

export async function getBlocksInRange(
  courtIds: string[],
  from: string,
  to: string
): Promise<CourtBlock[]> {
  if (!courtIds.length) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("court_blocks")
    .select("*")
    .in("court_id", courtIds)
    .lt("starts_at", to)
    .gt("ends_at", from);
  return (data as CourtBlock[]) ?? [];
}

export async function getPricingRules(courtIds: string[]): Promise<PricingRule[]> {
  if (!courtIds.length) return [];
  const sb = await createClient();
  const { data } = await sb.from("pricing_rules").select("*").in("court_id", courtIds).order("priority", { ascending: false });
  return (data as PricingRule[]) ?? [];
}

export async function getPayouts(venueIds: string[]): Promise<Payout[]> {
  if (!venueIds.length) return [];
  const sb = await createClient();
  const { data } = await sb.from("payouts").select("*").in("venue_id", venueIds).order("created_at", { ascending: false });
  return (data as Payout[]) ?? [];
}
