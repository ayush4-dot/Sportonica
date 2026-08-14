"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sportColor, normalizeSport } from "@/lib/sports";
import { availablePlayerSpots } from "@/lib/playTogether/types";
import type { EventRow } from "./useEvents";

interface RawGame {
  id: string;
  host_id: string;
  sport: string;
  game_format: string | null;
  starts_at: string;
  contribution_amount: number;
  max_players: number;
  venue_id: string;
  venues: { name: string; lat: number | null; lng: number | null } | null;
}

// Play Together games (host-approved-request, pay-the-host-directly
// marketplace — see src/lib/playTogether/) are just another kind of game
// to browse on the Play page, so this shapes them into EventRow and the
// caller merges them straight into the same card grid — no separate
// section, same filters/sort/map as everything else.
export function usePlayTogetherEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();

    (async () => {
      const { data: games } = await sb
        .from("games")
        .select("id, host_id, sport, game_format, starts_at, contribution_amount, max_players, venue_id, venues(name, lat, lng)")
        .eq("status", "published")
        .gt("starts_at", new Date().toISOString())
        .limit(50);

      if (!games?.length) { if (!cancelled) setRows([]); return; }

      const gameIds = games.map((g) => g.id);
      const hostIds = [...new Set(games.map((g) => g.host_id))];

      const [{ data: players }, { data: profiles }] = await Promise.all([
        sb.from("game_players").select("game_id").eq("status", "joined").in("game_id", gameIds),
        sb.from("profiles").select("id, full_name, username, avatar_url, trust_score").in("id", hostIds),
      ]);

      const joinedCounts = new Map<string, number>();
      (players ?? []).forEach((p) => joinedCounts.set(p.game_id, (joinedCounts.get(p.game_id) ?? 0) + 1));
      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

      const mapped: EventRow[] = (games as unknown as RawGame[]).map((g) => {
        const host = profileById.get(g.host_id);
        const joined = joinedCounts.get(g.id) ?? 0;
        return {
          id: g.id,
          host_id: g.host_id,
          sport: g.sport,
          title: g.game_format ? `${g.sport} · ${g.game_format}` : g.sport,
          venue: g.venues?.name ?? "Venue",
          event_date: g.starts_at,
          max_players: g.max_players,
          fee: Number(g.contribution_amount) || 0,
          description: null,
          venue_lat: g.venues?.lat ?? null,
          venue_lng: g.venues?.lng ?? null,
          flash: false,
          venue_id: g.venue_id,
          sport_color: sportColor(normalizeSport(g.sport)),
          event_type: "play_together",
          organizer_name: null,
          skill_level: "any",
          duration_mins: 60,
          host_name: host?.full_name ?? null,
          host_username: host?.username ?? null,
          host_avatar: host?.avatar_url ?? null,
          host_trust: host?.trust_score ?? 50,
          // The host occupies one of max_players without a game_players row.
          confirmed_count: joined + 1,
          slots_remaining: Math.max(availablePlayerSpots(g) - joined, 0),
          total_count: g.max_players,
        };
      });

      if (!cancelled) setRows(mapped);
    })();

    return () => { cancelled = true; };
  }, []);

  return rows;
}
