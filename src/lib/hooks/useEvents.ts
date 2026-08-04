"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const sb = () => createClient();

// ── Sport colour map ─────────────────────────────────────────────
export const SPORT_COLOR: Record<string, string> = {
  Futsal:     "#2E7D5B",
  Football:   "#22c55e",
  Basketball: "#A78BFA",
  Cricket:    "#f97316",
  Volleyball: "#3b82f6",
  Badminton:  "#a855f7",
  Tennis:     "#ec4899",
  Running:    "#60a5fa",
};

export type EventRow = {
  id: string;
  host_id: string;
  sport: string;
  title: string;
  venue: string;
  event_date: string;
  max_players: number;
  fee: number;
  description: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  flash: boolean;
  venue_id: string | null;
  sport_color: string | null;
  event_type?: string | null;
  organizer_name?: string | null;
  skill_level?: string | null;
  duration_mins?: number | null;
  host_name?: string | null;
  host_username?: string | null;
  host_avatar?: string | null;
  host_trust?: number | null;
  // from events_with_counts view
  confirmed_count: number;
  slots_remaining: number;
  total_count: number;
};

interface UseEventsOptions {
  sport?: string;        // filter by sport, undefined = all
  limit?: number;
  onlyFlash?: boolean;
  onlyUpcoming?: boolean;
}

export function useEvents(opts: UseEventsOptions = {}) {
  const { sport, limit = 50, onlyFlash = false, onlyUpcoming = true } = opts;
  const [events, setEvents]   = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = sb()
      .from("events_full")
      .select("*")
      .order("event_date", { ascending: true })
      .limit(limit);

    if (sport && sport !== "All sports") {
      query = query.eq("sport", sport);
    }
    if (onlyFlash) {
      query = query.eq("flash", true);
    }
    if (onlyUpcoming) {
      // Include events from start of today, not just future
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte("event_date", today.toISOString());
    }

    try {
      const { data, error: err } = await query;

      if (err) {
        console.error("[useEvents]", err);
        setError(err.message);
        setEvents([]);
      } else {
        // Derive sport colour client-side if not stored
        const rows = (data ?? []).map((e: EventRow) => ({
          ...e,
          sport_color: e.sport_color ?? SPORT_COLOR[e.sport] ?? "#DE3163",
          event_type: e.event_type ?? "pickup",
          organizer_name: e.organizer_name ?? null,
          confirmed_count: Number(e.confirmed_count ?? 0),
          slots_remaining: Number(e.slots_remaining ?? e.max_players),
          flash: Boolean(e.flash),
        skill_level: e.skill_level ?? "any",
        duration_mins: e.duration_mins ?? 60,
        host_name: e.host_name ?? null,
        host_username: e.host_username ?? null,
        host_avatar: e.host_avatar ?? null,
        host_trust: e.host_trust ?? 50,
        }));
        setEvents(rows);
      }
    } catch (e) {
      // Never leave the UI stuck on "Loading…" — show what went wrong.
      console.error("[useEvents] threw", e);
      setError(e instanceof Error ? e.message : "Could not load games.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [sport, limit, onlyFlash, onlyUpcoming]);

  useEffect(() => { void load(); }, [load]);

  return { events, loading, error, reload: load };
}

// ── Single booking action ─────────────────────────────────────────
export async function bookEvent(eventId: string): Promise<{ error: string | null }> {
  const supabase = sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Get event details for denormalised columns
  const { data: ev } = await supabase
    .from("events")
    .select("venue, sport, fee, venue_id")
    .eq("id", eventId)
    .single();

  const { error } = await supabase.from("bookings").insert({
    event_id:       eventId,
    user_id:        user.id,
    status:         "confirmed",
    sport:          ev?.sport ?? null,
    court:          ev?.venue ?? null,
    venue_id:       ev?.venue_id ?? null,
    amount:         ev?.fee ?? 0,
    payment_status: (ev?.fee ?? 0) === 0 ? "paid" : "unpaid",
  });

  if (error) {
    // 23505 = unique violation — already booked
    if (error.code === "23505") return { error: "already_booked" };
    return { error: error.message };
  }

  // Increment games_played on the player's profile
  await supabase.rpc("increment_games_played", { uid: user.id }).maybeSingle();

  return { error: null };
}

// ── Fetch a single event with count ──────────────────────────────
export async function fetchEvent(id: string): Promise<EventRow | null> {
  const { data } = await sb()
    .from("events_with_counts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as EventRow | null;
}
