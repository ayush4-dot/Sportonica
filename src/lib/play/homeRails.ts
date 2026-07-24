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
      .select("id, name, venue_type, address, photos, sports, lat, lng")
      .eq("verification_status", "verified")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Cheapest court per venue, for the "from Rs X/hr" line.
  const venueIds = (venuesRes.data ?? []).map((v) => v.id);
  const { data: courts } = venueIds.length
    ? await sb.from("courts").select("venue_id, base_price").in("venue_id", venueIds).eq("status", "active")
    : { data: [] as { venue_id: string; base_price: number }[] };

  const cheapest = new Map<string, number>();
  (courts ?? []).forEach((c) => {
    const p = Number(c.base_price) || 0;
    if (p <= 0) return;
    const cur = cheapest.get(c.venue_id);
    if (cur == null || p < cur) cheapest.set(c.venue_id, p);
  });

  return {
    official: (officialRes.data ?? []) as RailEvent[],
    games: (gamesRes.data ?? []) as RailEvent[],
    venues: (venuesRes.data ?? []).map((v) => ({
      ...v,
      from_price: cheapest.get(v.id) ?? null,
    })) as RailVenue[],
  };
}
