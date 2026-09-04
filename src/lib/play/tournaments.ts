import { createAnonClient } from "@/lib/supabase/anonServer";
import { sportColor } from "@/lib/sports";
import type { Tournament } from "@/lib/tournaments/types";
import type { RailEvent } from "@/lib/play/homeRails";

// A browse-page row is either a simple official event (events_full,
// event_type venue_event/platform_event) or a real team-based tournament
// (the new `tournaments` table) — same blending pattern Discover already
// uses for events + Play Together games.
export type TournamentBrowseItem =
  | { kind: "event"; id: string; sport: string; sportColor: string; title: string; organizerName: string | null; venue: string; when: string; slotsRemaining: number; fee: number; badge: "official" | "platform"; bannerUrl: string | null }
  | { kind: "tournament"; id: string; sport: string; sportColor: string; title: string; organizerName: string | null; venue: string; when: string; maxTeams: number | null; fee: number; bannerUrl: string | null; completed: boolean };

// Cookie-free so /tournaments can be edge-cached (revalidate) instead of
// re-rendered against Sydney every request. Both queries are the same
// public data the browser reads on /discover — anon RLS covers them.
async function listOfficialEvents(): Promise<RailEvent[]> {
  const sb = createAnonClient();
  const { data } = await sb
    .from("events_full")
    .select("*")
    .in("event_type", ["venue_event", "platform_event"])
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true })
    .limit(100);
  return (data ?? []) as RailEvent[];
}

// Inlined copy of listPublicTournaments() (src/lib/tournaments/actions.ts)
// using the cookie-free client — that one is a "use server" action bound
// to the request-scoped cookie client.
async function listPublicTournamentRows(): Promise<(Tournament & { venue_name: string })[]> {
  const sb = createAnonClient();
  const nowIso = new Date().toISOString();
  const { data } = await sb
    .from("tournaments")
    .select("*, venues(name)")
    .in("status", ["published", "registration_open", "registration_closed", "live", "completed"])
    .or(`ends_at.gte.${nowIso},status.eq.completed`)
    .order("starts_at", { ascending: true })
    .limit(100);
  return ((data ?? []) as unknown as (Tournament & { venues: { name: string } | null })[]).map((t) => {
    const { venues, ...rest } = t;
    return { ...rest, venue_name: venues?.name ?? t.own_venue_name ?? "—" };
  });
}

export async function listTournaments(): Promise<TournamentBrowseItem[]> {
  const [events, tournaments] = await Promise.all([listOfficialEvents(), listPublicTournamentRows()]);

  const eventItems: TournamentBrowseItem[] = events.map((e) => ({
    kind: "event", id: e.id, sport: e.sport, sportColor: e.sport_color ?? sportColor(e.sport),
    title: e.title, organizerName: e.organizer_name, venue: e.venue, when: e.event_date,
    slotsRemaining: e.slots_remaining, fee: Number(e.fee), badge: e.event_type === "platform_event" ? "platform" : "official",
    bannerUrl: e.banner_url ?? null,
  }));

  const tournamentItems: TournamentBrowseItem[] = tournaments.map((t) => ({
    kind: "tournament", id: t.id, sport: t.sport, sportColor: sportColor(t.sport),
    title: t.name, organizerName: t.organizer_name, venue: t.venue_name, when: t.starts_at,
    maxTeams: t.max_teams, fee: Number(t.fee), bannerUrl: t.banner_url ?? null,
    completed: t.status === "completed",
  }));

  // Upcoming/live first (soonest first); completed tournaments sink to
  // the bottom, most-recently-finished first, so the browse page reads
  // as "what's on" rather than a mixed timeline of past and future.
  const isDone = (i: TournamentBrowseItem) => i.kind === "tournament" && i.completed;
  const active = [...eventItems, ...tournamentItems].filter((i) => !isDone(i)).sort((a, b) => a.when.localeCompare(b.when));
  const done = tournamentItems.filter(isDone).sort((a, b) => b.when.localeCompare(a.when));
  return [...active, ...done];
}
