"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sportColor, normalizeSport } from "@/lib/sports";
import type { EventRow } from "./useEvents";

interface RawTournament {
  id: string;
  owner_id: string | null;
  organizer_type: "venue" | "platform";
  organizer_name: string | null;
  name: string;
  sport: string;
  description: string | null;
  starts_at: string;
  match_duration_mins: number | null;
  max_teams: number;
  skill_category: string | null;
  fee: number;
  venue_id: string;
  venues: { name: string; lat: number | null; lng: number | null } | null;
}

// A 'single_event' tournament (Fixtures/Bracket/Standings don't apply —
// captain-only registration, one player per "team") is what replaced the
// old vendor-created venue_event/platform_event rows. Shaped into
// EventRow the same way usePlayTogetherEvents.ts folds `games` in, so it
// flows through the same discover-page filter/sort/card pipeline instead
// of needing its own section. `is_tournament` tells callers to link to
// /tournaments/[id] instead of /game/[id].
export function useSingleEventTournaments() {
  const [rows, setRows] = useState<EventRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();

    (async () => {
      const { data: tournaments } = await sb
        .from("tournaments")
        .select(`
          id, owner_id, organizer_type, organizer_name, name, sport, description, starts_at,
          match_duration_mins, max_teams, skill_category, fee, venue_id, venues(name, lat, lng)
        `)
        .eq("format", "single_event")
        .in("status", ["registration_open", "live"])
        .gt("starts_at", new Date().toISOString())
        .limit(50);

      if (!tournaments?.length) { if (!cancelled) setRows([]); return; }

      const ids = tournaments.map((t) => t.id);
      const { data: teams } = await sb
        .from("tournament_teams").select("tournament_id").eq("status", "confirmed").in("tournament_id", ids);
      const confirmed = new Map<string, number>();
      (teams ?? []).forEach((t) => confirmed.set(t.tournament_id, (confirmed.get(t.tournament_id) ?? 0) + 1));

      const mapped: EventRow[] = (tournaments as unknown as RawTournament[]).map((t) => {
        const count = confirmed.get(t.id) ?? 0;
        return {
          id: t.id,
          host_id: t.owner_id ?? "",
          sport: t.sport,
          title: t.name,
          venue: t.venues?.name ?? "Venue",
          event_date: t.starts_at,
          max_players: t.max_teams,
          fee: Number(t.fee) || 0,
          description: t.description,
          venue_lat: t.venues?.lat ?? null,
          venue_lng: t.venues?.lng ?? null,
          flash: false,
          venue_id: t.venue_id,
          sport_color: sportColor(normalizeSport(t.sport)),
          event_type: t.organizer_type === "platform" ? "platform_event" : "venue_event",
          is_tournament: true,
          organizer_name: t.organizer_name,
          skill_level: t.skill_category ?? "any",
          duration_mins: t.match_duration_mins ?? 60,
          host_name: null,
          host_username: null,
          host_avatar: null,
          host_trust: null,
          confirmed_count: count,
          slots_remaining: Math.max(t.max_teams - count, 0),
          total_count: t.max_teams,
        };
      });

      if (!cancelled) setRows(mapped);
    })();

    return () => { cancelled = true; };
  }, []);

  return rows;
}
