import { createClient } from "@/lib/supabase/server";
import type { RailEvent } from "@/lib/play/homeRails";

// The full "tournaments" list — everything the homepage's EventsRail
// teases (see getHomeRails' "official" query) but unbounded instead of
// capped at 8. Same event_type filter: venue_event | platform_event,
// the organised stuff run by venues and by Sportonica, as opposed to a
// regular player's pickup game.
export async function listTournaments(): Promise<RailEvent[]> {
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
