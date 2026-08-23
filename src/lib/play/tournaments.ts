import { createClient } from "@/lib/supabase/server";
import { listPublicTournaments } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { sportColor } from "@/lib/sports";
import type { RailEvent } from "@/lib/play/homeRails";

// A browse-page row is either a simple official event (events_full,
// event_type venue_event/platform_event) or a real team-based tournament
// (the new `tournaments` table) — same blending pattern Discover already
// uses for events + Play Together games.
export type TournamentBrowseItem =
  | { kind: "event"; id: string; sport: string; sportColor: string; title: string; organizerName: string | null; venue: string; when: string; slotsRemaining: number; fee: number; badge: "official" | "platform" }
  | { kind: "tournament"; id: string; sport: string; sportColor: string; title: string; organizerName: string | null; venue: string; when: string; maxTeams: number; fee: number };

async function listOfficialEvents(): Promise<RailEvent[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("events_full")
    .select("*")
    .in("event_type", ["venue_event", "platform_event"])
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true })
    .limit(100);
  return (data ?? []) as RailEvent[];
}

export async function listTournaments(): Promise<TournamentBrowseItem[]> {
  const [events, tournaments] = await Promise.all([listOfficialEvents(), listPublicTournaments()]);

  const eventItems: TournamentBrowseItem[] = events.map((e) => ({
    kind: "event", id: e.id, sport: e.sport, sportColor: e.sport_color ?? sportColor(e.sport),
    title: e.title, organizerName: e.organizer_name, venue: e.venue, when: e.event_date,
    slotsRemaining: e.slots_remaining, fee: Number(e.fee), badge: e.event_type === "platform_event" ? "platform" : "official",
  }));

  const tournamentItems: TournamentBrowseItem[] = isActionError(tournaments) ? [] : tournaments.map((t) => ({
    kind: "tournament", id: t.id, sport: t.sport, sportColor: sportColor(t.sport),
    title: t.name, organizerName: t.organizer_name, venue: t.venue_name, when: t.starts_at,
    maxTeams: t.max_teams, fee: Number(t.fee),
  }));

  return [...eventItems, ...tournamentItems].sort((a, b) => a.when.localeCompare(b.when));
}
