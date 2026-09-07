"use server";

import { createAnonClient } from "@/lib/supabase/anonServer";
import { sportColor } from "@/lib/sports";

/* ────────────────────────────────────────────────────────────────
   Global search — one query, every public surface of the app.

   Venues, upcoming Play Together games, tournaments and players,
   all matched with a case-insensitive substring and returned in
   named groups. Uses the cookie-free anon client: this is exactly
   the public data /discover, /tournaments and /players already
   show, so anon RLS covers it and the call stays fast.
   ──────────────────────────────────────────────────────────────── */

export type SearchKind = "venue" | "game" | "tournament" | "player";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  /** one line under the title — address, date, sport, @handle … */
  subtitle: string;
  href: string;
  sport?: string;
  color?: string;
  image?: string | null;
};

export type SearchResults = {
  query: string;
  venues: SearchHit[];
  games: SearchHit[];
  tournaments: SearchHit[];
  players: SearchHit[];
  total: number;
};

const EMPTY = (q: string): SearchResults => ({
  query: q, venues: [], games: [], tournaments: [], players: [], total: 0,
});

const TOURNAMENT_LIVE = ["published", "registration_open", "registration_closed", "live", "completed"];

function whenLabel(iso: string | null): string {
  if (!iso) return "Dates TBD";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kathmandu",
  });
}

// PostgREST `.or()` values can't contain commas/parens unescaped — a
// user typing "5-a-side, indoor" would break the filter. Strip anything
// that isn't a letter, number, space or hyphen and collapse whitespace.
function clean(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

export async function searchEverything(rawQuery: string, perGroup = 6): Promise<SearchResults> {
  const q = clean(rawQuery).slice(0, 64);
  if (q.length < 2) return EMPTY(rawQuery);

  const sb = createAnonClient();
  const like = `%${q}%`;
  const nowIso = new Date().toISOString();
  // Sport names are title-cased ("Futsal"); a text[] `contains` is
  // case-sensitive, so match the query against that shape too.
  const titled = q.replace(/\b\w/g, (c) => c.toUpperCase());

  const [venuesRes, gamesRes, tournamentsRes, playersRes] = await Promise.all([
    sb.from("venues")
      .select("id, name, address, sports, photos, status")
      .eq("status", "open")
      .or(`name.ilike.${like},address.ilike.${like},sports.cs.{${titled}}`)
      .limit(perGroup),

    sb.from("games")
      .select("id, sport, game_format, starts_at, status, venues(name)")
      .eq("status", "published")
      .gt("starts_at", nowIso)
      .ilike("sport", like)
      .order("starts_at", { ascending: true })
      .limit(perGroup),

    sb.from("tournaments")
      .select("id, name, sport, starts_at, status, own_venue_name, venues(name)")
      .in("status", TOURNAMENT_LIVE)
      .or(`name.ilike.${like},sport.ilike.${like}`)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(perGroup),

    sb.from("profiles")
      .select("id, full_name, name, username, avatar_url")
      .or(`full_name.ilike.${like},username.ilike.${like},name.ilike.${like}`)
      .limit(perGroup),
  ]);

  type VenueRow = { id: string; name: string; address: string | null; sports: string[] | null; photos: string[] | null };
  type GameRow = { id: string; sport: string; game_format: string | null; starts_at: string; venues: { name: string } | null };
  type TournRow = { id: string; name: string; sport: string; starts_at: string | null; own_venue_name: string | null; venues: { name: string } | null };
  type PlayerRow = { id: string; full_name: string | null; name: string | null; username: string | null; avatar_url: string | null };

  const venues: SearchHit[] = ((venuesRes.data ?? []) as VenueRow[]).map((v) => ({
    kind: "venue",
    id: v.id,
    title: v.name,
    subtitle: [v.address, (v.sports ?? []).slice(0, 3).join(" · ")].filter(Boolean).join("  ·  ") || "Venue",
    href: `/create/${v.id}`,
    sport: v.sports?.[0],
    color: v.sports?.[0] ? sportColor(v.sports[0]) : undefined,
    image: v.photos?.[0] ?? null,
  }));

  const games: SearchHit[] = ((gamesRes.data ?? []) as unknown as GameRow[]).map((g) => ({
    kind: "game",
    id: g.id,
    title: g.game_format ? `${g.sport} · ${g.game_format}` : `${g.sport} game`,
    subtitle: `${whenLabel(g.starts_at)}  ·  ${g.venues?.name ?? "Venue"}`,
    href: `/play-together/${g.id}`,
    sport: g.sport,
    color: sportColor(g.sport),
  }));

  const tournaments: SearchHit[] = ((tournamentsRes.data ?? []) as unknown as TournRow[]).map((t) => ({
    kind: "tournament",
    id: t.id,
    title: t.name,
    subtitle: `${whenLabel(t.starts_at)}  ·  ${t.venues?.name ?? t.own_venue_name ?? t.sport}`,
    href: `/tournaments/${t.id}`,
    sport: t.sport,
    color: sportColor(t.sport),
  }));

  const players: SearchHit[] = ((playersRes.data ?? []) as PlayerRow[]).map((p) => {
    const nm = p.full_name ?? p.name ?? p.username ?? "Player";
    return {
      kind: "player",
      id: p.id,
      title: nm,
      subtitle: p.username ? `@${p.username}` : "Player",
      href: p.username ? `/p/${p.username}` : "/players",
      image: p.avatar_url,
    };
  });

  return {
    query: rawQuery,
    venues, games, tournaments, players,
    total: venues.length + games.length + tournaments.length + players.length,
  };
}
