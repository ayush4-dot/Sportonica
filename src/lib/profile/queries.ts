import { createClient } from "@/lib/supabase/server";

export interface PlayerProfile {
  id: string;
  username: string;
  full_name: string | null;
  name: string | null;
  bio: string | null;
  city: string | null;
  avatar_url: string | null;
  sports: string[] | null;
  trust_score: number;
  is_public: boolean;
  created_at: string;
}

export interface PlayerStats {
  games_played: number;
  no_shows: number;
  upcoming: number;
  games_hosted: number;
  sports_count: number;
  last_played: string | null;
  reliability: number | null;
}

export interface SportCount { sport: string; games: number }

export interface RecentGame {
  id: string;
  title: string;
  sport: string;
  venue: string;
  event_date: string;
  sport_color: string | null;
}

export async function getProfileByUsername(username: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle();
  return (data as PlayerProfile) ?? null;
}

export async function getMyProfile() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as PlayerProfile) ?? null;
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const sb = await createClient();
  const { data } = await sb.from("player_stats").select("*").eq("user_id", userId).maybeSingle();
  return (data as PlayerStats) ?? {
    games_played: 0, no_shows: 0, upcoming: 0, games_hosted: 0,
    sports_count: 0, last_played: null, reliability: null,
  };
}

export async function getPlayerSports(userId: string): Promise<SportCount[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("player_sports")
    .select("sport, games")
    .eq("user_id", userId)
    .order("games", { ascending: false });
  return (data as SportCount[]) ?? [];
}

export async function getRecentGames(userId: string, limit = 5): Promise<RecentGame[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("bookings")
    .select("event_id, status, events(id, title, sport, venue, event_date, sport_color)")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as { events: RecentGame | null }[])
    .map((r) => r.events)
    .filter((e): e is RecentGame => !!e);
}

// ── Badges: computed, no storage needed ─────────────────────────
export interface Badge { key: string; label: string; note: string; color: string }

export function computeBadges(stats: PlayerStats, sports: SportCount[]): Badge[] {
  const out: Badge[] = [];
  if (stats.games_played >= 1)  out.push({ key: "first",   label: "First game",   note: "Played their first match", color: "#2E7D5B" });
  if (stats.games_played >= 10) out.push({ key: "ten",     label: "Ten games",    note: "10 games and counting",    color: "#FFC93C" });
  if (stats.games_played >= 50) out.push({ key: "fifty",   label: "Fifty club",   note: "50 games played",          color: "#DE3163" });
  if (stats.games_hosted >= 1)  out.push({ key: "host",    label: "Host",         note: "Organised a game",         color: "#f97316" });
  if (stats.games_hosted >= 5)  out.push({ key: "host5",   label: "Ringleader",   note: "Hosted 5+ games",          color: "#a855f7" });
  if (sports.length >= 3)       out.push({ key: "allrnd",  label: "All-rounder",  note: "Plays 3+ sports",          color: "#3b82f6" });
  if (stats.reliability !== null && stats.reliability >= 90 && stats.games_played >= 5)
                                out.push({ key: "solid",   label: "Rock solid",   note: "90%+ show-up rate",        color: "#22c55e" });
  return out;
}

export function trustLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Rock solid", color: "#22c55e" };
  if (score >= 65) return { label: "Reliable",   color: "#2E7D5B" };
  if (score >= 45) return { label: "Building trust", color: "#FFC93C" };
  if (score >= 25) return { label: "Shaky",      color: "#f97316" };
  return { label: "Unreliable", color: "#DE3163" };
}

// ── Anonymous variants for the OG image route ───────────────────
// The OG route renders with no cookies/session, so it reads over Supabase's
// REST endpoint with the anon key. RLS keeps it to public profiles only.
export async function getProfileByUsernameAnon(username: string) {
  const { anonSelect } = await import("@/lib/supabase/anon");
  const rows = await anonSelect<PlayerProfile>(
    "profiles",
    `username=ilike.${encodeURIComponent(username)}&select=*&limit=1`
  );
  return rows[0] ?? null;
}

export async function getPlayerStatsAnon(userId: string): Promise<PlayerStats> {
  const { anonSelect } = await import("@/lib/supabase/anon");
  const rows = await anonSelect<PlayerStats>(
    "player_stats",
    `user_id=eq.${userId}&select=*&limit=1`
  );
  return rows[0] ?? {
    games_played: 0, no_shows: 0, upcoming: 0, games_hosted: 0,
    sports_count: 0, last_played: null, reliability: null,
  };
}

export async function getPlayerSportsAnon(userId: string): Promise<SportCount[]> {
  const { anonSelect } = await import("@/lib/supabase/anon");
  const rows = await anonSelect<SportCount>(
    "player_sports",
    `user_id=eq.${userId}&select=sport,games&order=games.desc`
  );
  return rows ?? [];
}
