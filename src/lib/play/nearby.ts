"use server";

import { createClient } from "@/lib/supabase/server";

export interface NearbyVenue {
  id: string; name: string; venue_type: string;
  sports: string[] | null; km: number;
}
export interface NearbyGame {
  id: string; title: string; sport: string; venue: string;
  event_date: string; slots_remaining: number; km: number;
}
export interface NearbyResult { venues: NearbyVenue[]; games: NearbyGame[] }

const R = 6371;
const toRad = (v: number) => (v * Math.PI) / 180;
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Closest approved venues + closest upcoming games to a point.
export async function nearbyVenuesAndGames(lat: number, lng: number): Promise<NearbyResult> {
  const sb = await createClient();

  const [{ data: venues }, { data: games }] = await Promise.all([
    sb.from("venues")
      .select("id, name, venue_type, sports, lat, lng")
      .eq("verification_status", "verified")
      .eq("status", "open")
      .not("lat", "is", null)
      .limit(60),
    sb.from("events_with_counts")
      .select("id, title, sport, venue, event_date, slots_remaining, venue_lat, venue_lng")
      .gte("event_date", new Date().toISOString())
      .not("venue_lat", "is", null)
      .order("event_date", { ascending: true })
      .limit(60),
  ]);

  return {
    venues: (venues ?? [])
      .map((v) => ({
        id: v.id, name: v.name, venue_type: v.venue_type,
        sports: v.sports,
        km: km(lat, lng, v.lat as number, v.lng as number),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8),
    games: (games ?? [])
      .map((g) => ({
        id: g.id, title: g.title, sport: g.sport, venue: g.venue,
        event_date: g.event_date,
        slots_remaining: Number(g.slots_remaining) || 0,
        km: km(lat, lng, g.venue_lat as number, g.venue_lng as number),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8),
  };
}
