import { createClient } from "@/lib/supabase/server";
import type { Venue, Court, CourtHours } from "@/lib/admin/types";

// Public browsing — venues + courts are world-readable (RLS allows select).

export async function browseVenues(): Promise<(Venue & { courts: Court[] })[]> {
  const sb = await createClient();
  const { data: venues } = await sb
    .from("venues")
    .select("*")
    .eq("status", "open")
    .eq("verification_status", "verified") // approval gate: only approved venues reach players
    .order("created_at", { ascending: false })
    .limit(100);

  if (!venues?.length) return [];

  const ids = venues.map((v) => v.id);
  const { data: courts } = await sb.from("courts").select("*").in("venue_id", ids).eq("status", "active");

  return (venues as Venue[]).map((v) => ({
    ...v,
    courts: ((courts as Court[]) ?? []).filter((c) => c.venue_id === v.id),
  }));
}

export async function getVenueForBooking(id: string): Promise<{
  venue: Venue | null;
  courts: Court[];
  hoursByCourt: Record<string, CourtHours[]>;
}> {
  const sb = await createClient();
  const { data: venue } = await sb.from("venues").select("*").eq("id", id).single();
  if (!venue) return { venue: null, courts: [], hoursByCourt: {} };
  // Approval gate: an unverified venue can't be booked even via direct link.
  if (venue.verification_status !== "verified") return { venue: null, courts: [], hoursByCourt: {} };

  const { data: courts } = await sb.from("courts").select("*").eq("venue_id", id).eq("status", "active");
  const courtIds = (courts ?? []).map((c) => c.id);

  const { data: hours } = courtIds.length
    ? await sb.from("court_hours").select("*").in("court_id", courtIds)
    : { data: [] as CourtHours[] };

  const hoursByCourt: Record<string, CourtHours[]> = {};
  (hours ?? []).forEach((h) => { (hoursByCourt[h.court_id] ??= []).push(h); });

  return { venue: venue as Venue, courts: (courts as Court[]) ?? [], hoursByCourt };
}
