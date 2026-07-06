"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const sb = () => createClient();

// ── Types ────────────────────────────────────────────────────────

export type Venue = {
  id: string;
  owner_id: string;
  name: string;
  venue_type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  description: string | null;
  status: "open" | "closed" | "maintenance";
  sports: string[];
  amenities: string[];
  hours: Record<string, { open: string; close: string; closed: boolean }>;
  created_at: string;
  updated_at: string;
};

export type CourtSlot = {
  id: string;
  venue_id: string;
  court_number: string;
  sport: string;
  start_time: string;
  end_time: string;
  price: number;
  status: "open" | "booked" | "blocked";
  recurring: boolean;
  recurring_days: number[];
  created_at: string;
};

export type AdminBooking = {
  id: string;
  event_id: string | null;
  slot_id: string | null;
  venue_id: string | null;
  user_id: string;
  sport: string | null;
  court: string | null;
  amount: number;
  payment_status: "paid" | "unpaid" | "partial";
  status: string;
  created_at: string;
  // joined from auth.users via profiles (best-effort)
  player_name: string | null;
  player_email: string | null;
};

export type FlashMatch = {
  id: string;
  venue_id: string;
  slot_id: string | null;
  sport: string;
  court: string;
  match_time: string;
  urgency_min: number;
  slots_needed: number;
  slots_filled: number;
  status: "active" | "expired" | "cancelled";
  created_at: string;
};

export type Payout = {
  id: string;
  venue_id: string;
  amount: number;
  method: "khalti" | "esewa";
  account: string | null;
  status: "pending" | "processing" | "settled" | "failed";
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

// ── useVenue ─────────────────────────────────────────────────────

export function useVenue() {
  const [venue, setVenue]     = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await sb().auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error: err } = await sb()
      .from("venues")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (err) setError(err.message);
    else setVenue(data as Venue | null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<Omit<Venue, "id" | "owner_id" | "created_at" | "updated_at">>) => {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (venue) {
      const { error: err } = await sb().from("venues").update({ ...patch }).eq("id", venue.id);
      if (!err) setVenue({ ...venue, ...patch } as Venue);
      return { error: err?.message ?? null };
    } else {
      const { data, error: err } = await sb()
        .from("venues")
        .insert({ ...patch, owner_id: user.id })
        .select()
        .single();
      if (!err) setVenue(data as Venue);
      return { error: err?.message ?? null };
    }
  };

  return { venue, loading, error, reload: load, save };
}

// ── useSlots ─────────────────────────────────────────────────────

export function useSlots(venueId: string | null) {
  const [slots, setSlots]     = useState<CourtSlot[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await sb()
      .from("court_slots")
      .select("*")
      .eq("venue_id", venueId)
      .order("start_time", { ascending: true });
    setSlots((data ?? []) as CourtSlot[]);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { void load(); }, [load]);

  const addSlot = async (slot: Omit<CourtSlot, "id" | "created_at">) => {
    const { data, error } = await sb().from("court_slots").insert(slot).select().single();
    if (!error) setSlots(p => [...p, data as CourtSlot]);
    return { error: error?.message ?? null };
  };

  const updateSlot = async (id: string, patch: Partial<CourtSlot>) => {
    const { error } = await sb().from("court_slots").update(patch).eq("id", id);
    if (!error) setSlots(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
    return { error: error?.message ?? null };
  };

  const deleteSlot = async (id: string) => {
    const { error } = await sb().from("court_slots").delete().eq("id", id);
    if (!error) setSlots(p => p.filter(s => s.id !== id));
    return { error: error?.message ?? null };
  };

  return { slots, loading, reload: load, addSlot, updateSlot, deleteSlot };
}

// ── useAdminBookings ─────────────────────────────────────────────

export function useAdminBookings(venueId: string | null) {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    // Join with profiles to get player name
    const { data } = await sb()
      .from("bookings")
      .select("*, profiles(full_name)")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(100);

    const rows = (data ?? []).map((b: AdminBooking & { profiles?: { full_name: string | null } }) => ({
      ...b,
      player_name:  b.profiles?.full_name ?? null,
      player_email: null,
    }));

    setBookings(rows as AdminBooking[]);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { void load(); }, [load]);

  const updateBooking = async (id: string, patch: Partial<AdminBooking>) => {
    const { error } = await sb().from("bookings").update(patch).eq("id", id);
    if (!error) setBookings(p => p.map(b => b.id === id ? { ...b, ...patch } : b));
    return { error: error?.message ?? null };
  };

  return { bookings, loading, reload: load, updateBooking };
}

// ── useFlashMatches ───────────────────────────────────────────────

export function useFlashMatches(venueId: string | null) {
  const [flashes, setFlashes]   = useState<FlashMatch[]>([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const { data } = await sb()
      .from("flash_matches")
      .select("*")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false });
    setFlashes((data ?? []) as FlashMatch[]);
    setLoading(false);
  }, [venueId]);

  useEffect(() => { void load(); }, [load]);

  const publish = async (fm: Omit<FlashMatch, "id" | "created_at" | "slots_filled">) => {
    const { data, error } = await sb()
      .from("flash_matches")
      .insert({ ...fm, slots_filled: 0 })
      .select()
      .single();
    if (!error) setFlashes(p => [data as FlashMatch, ...p]);
    return { error: error?.message ?? null };
  };

  const cancel = async (id: string) => {
    const { error } = await sb()
      .from("flash_matches")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (!error) setFlashes(p => p.map(f => f.id === id ? { ...f, status: "cancelled" } : f));
    return { error: error?.message ?? null };
  };

  return { flashes, loading, reload: load, publish, cancel };
}

// ── useRevenue ────────────────────────────────────────────────────

export type RevenueRow = { date: string; gross: number; net: number; count: number };

export function useRevenue(venueId: string | null, days = 30) {
  const [rows, setRows]         = useState<RevenueRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [payout, setPayout]     = useState<Payout | null>(null);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: bData } = await sb()
      .from("bookings")
      .select("created_at, amount, payment_status")
      .eq("venue_id", venueId)
      .gte("created_at", since.toISOString());

    // Group by date client-side
    const map: Record<string, RevenueRow> = {};
    for (const b of (bData ?? [])) {
      const d = b.created_at.slice(0, 10);
      if (!map[d]) map[d] = { date: d, gross: 0, net: 0, count: 0 };
      const gross = Number(b.amount) || 0;
      map[d].gross += gross;
      map[d].net   += gross * 0.9; // 10% platform cut
      map[d].count += 1;
    }
    setRows(Object.values(map).sort((a, b) => a.date.localeCompare(b.date)));

    // Load payout preference
    const { data: pData } = await sb()
      .from("payouts")
      .select("*")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPayout(pData as Payout | null);

    setLoading(false);
  }, [venueId, days]);

  useEffect(() => { void load(); }, [load]);

  const savePayout = async (method: "khalti" | "esewa", account: string) => {
    if (!venueId) return;
    // Try update first; if no row exists, insert
    const { data: existing } = await sb()
      .from("payouts")
      .select("id")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await sb()
        .from("payouts")
        .update({ method, account })
        .eq("id", existing.id));
    } else {
      ({ error } = await sb()
        .from("payouts")
        .insert({ venue_id: venueId, method, account, amount: 0, status: "pending" }));
    }
    if (!error) setPayout(p => ({ ...(p ?? {} as Payout), method, account }));
    return { error: error?.message ?? null };
  };

  return { rows, loading, payout, savePayout, reload: load };
}
