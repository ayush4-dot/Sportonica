import { createClient } from "@/lib/supabase/server";

export interface RailEvent {
  id: string;
  title: string;
  sport: string;
  venue: string;
  event_date: string;
  fee: number;
  max_players: number;
  slots_remaining: number;
  event_type: string | null;
  organizer_name: string | null;
  skill_level: string | null;
  sport_color: string | null;
  host_name: string | null;
  host_avatar: string | null;
  host_trust: number | null;
}

export interface RailVenue {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  photos: string[] | null;
  sports: string[] | null;
  lat: number | null;
  lng: number | null;
  from_price: number | null;
}

/**
 * Everything the homepage rails need, in one round trip.
 * Official events = venue_event | platform_event — the organised stuff,
 * which is the highest-value thing to surface first.
 */
export async function getHomeRails() {
  const sb = await createClient();
  const nowIso = new Date().toISOString();

  // The venues query used to come back with just the 8 rows, then a
  // second query looked up courts for those specific venue IDs to find
  // the cheapest one — a genuine data dependency (needs the IDs first),
  // so it couldn't join the Promise.all above and always cost a full
  // extra sequential DB round trip on every homepage load. Embedding
  // courts directly in this select gets everything in one round trip
  // instead, at the cost of over-fetching a little more court data than
  // needed (fine at this scale — 8 venues' worth of courts).
  const [officialRes, gamesRes, venuesRes] = await Promise.all([
    sb.from("events_full")
      .select("*")
      .in("event_type", ["venue_event", "platform_event"])
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(8),
    sb.from("events_full")
      .select("*")
      .eq("event_type", "pickup")
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(8),
    sb.from("venues")
      .select("id, name, venue_type, address, photos, sports, lat, lng, courts(base_price, status)")
      .eq("verification_status", "verified")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    official: (officialRes.data ?? []) as RailEvent[],
    games: (gamesRes.data ?? []) as RailEvent[],
    venues: (venuesRes.data ?? []).map((v) => {
      const { courts, ...venue } = v as typeof v & {
        courts: { base_price: number; status: string }[] | null;
      };
      const prices = (courts ?? [])
        .filter((c) => c.status === "active")
        .map((c) => Number(c.base_price) || 0)
        .filter((p) => p > 0);
      return { ...venue, from_price: prices.length ? Math.min(...prices) : null };
    }) as RailVenue[],
  };
}
