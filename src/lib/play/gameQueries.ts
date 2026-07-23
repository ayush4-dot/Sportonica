import { createClient } from "@/lib/supabase/server";

export interface GamePlayer {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  trust_score: number;
  joined_at: string;
}

export interface GameFull {
  id: string;
  host_id: string;
  sport: string;
  title: string;
  venue: string;
  venue_id: string | null;
  event_date: string;
  duration_mins: number | null;
  max_players: number;
  fee: number;
  description: string | null;
  notes: string | null;
  skill_level: string | null;
  bring_own_gear: boolean | null;
  venue_lat: number | null;
  venue_lng: number | null;
  sport_color: string | null;
  event_type: string | null;
  organizer_name: string | null;
  flash: boolean | null;
  status: string | null;
  confirmed_count: number;
  slots_remaining: number;
  host_name: string | null;
  host_username: string | null;
  host_avatar: string | null;
  host_trust: number;
}

export const SKILL_LABEL: Record<string, string> = {
  any: "All levels",
  beginner: "Beginner friendly",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export async function getGame(id: string): Promise<GameFull | null> {
  const sb = await createClient();
  const { data } = await sb.from("events_full").select("*").eq("id", id).maybeSingle();
  return (data as GameFull) ?? null;
}

export async function getGamePlayers(eventId: string): Promise<GamePlayer[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("event_players")
    .select("*")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: true });
  return (data as GamePlayer[]) ?? [];
}

// Other upcoming games in the same sport — the "similar games" rail.
export async function getSimilarGames(game: GameFull, limit = 6): Promise<GameFull[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("events_full")
    .select("*")
    .eq("sport", game.sport)
    .neq("id", game.id)
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true })
    .limit(limit);
  return (data as GameFull[]) ?? [];
}

// Venues near this game, for the "venues nearby" panel.
export async function getNearbyVenues(game: GameFull, limit = 4) {
  if (game.venue_lat == null || game.venue_lng == null) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("venues")
    .select("id, name, address, photos, lat, lng, maps_url")
    .eq("verification_status", "verified")
    .not("lat", "is", null)
    .limit(40);

  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  return (data ?? [])
    .map((v) => {
      const dLat = toRad((v.lat as number) - game.venue_lat!);
      const dLng = toRad((v.lng as number) - game.venue_lng!);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(game.venue_lat!)) * Math.cos(toRad(v.lat as number)) * Math.sin(dLng / 2) ** 2;
      return { ...v, km: 2 * R * Math.asin(Math.sqrt(a)) };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
