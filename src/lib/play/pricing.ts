"use server";

import { createClient } from "@/lib/supabase/server";

export type PricingRule = {
  id: string;
  court_id: string;
  label: string;
  kind: "multiplier" | "fixed" | "discount_pct";
  amount: number;
  days: number[];
  start_time: string | null;   // "18:00:00"
  end_time: string | null;
  priority: number;
  active: boolean;
};

/** Active rules for every court at a venue. */
export async function getVenuePricingRules(venueId: string): Promise<PricingRule[]> {
  const sb = await createClient();
  const { data: courts } = await sb.from("courts").select("id").eq("venue_id", venueId);
  const ids = (courts ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return [];

  const { data } = await sb
    .from("pricing_rules")
    .select("id, court_id, label, kind, amount, days, start_time, end_time, priority, active")
    .in("court_id", ids)
    .eq("active", true)
    .order("priority", { ascending: false });

  return (data ?? []) as PricingRule[];
}

export type VenueOffer = {
  venue_id: string;
  label: string;      // "Tuesday happy hour"
  amount: number;     // 30  → 30% off
  kind: "discount_pct" | "multiplier";
};

/**
 * The single best discount running at each venue, for badging the
 * venue list. Peak surcharges are not offers, so they're excluded.
 */
export async function getLiveOffers(): Promise<Record<string, VenueOffer>> {
  const sb = await createClient();
  const { data } = await sb
    .from("pricing_rules")
    .select("label, kind, amount, active, courts!inner(venue_id)")
    .eq("active", true)
    .in("kind", ["discount_pct", "multiplier"]);

  const best: Record<string, VenueOffer> = {};
  for (const r of (data ?? []) as unknown as Array<{
    label: string; kind: "discount_pct" | "multiplier"; amount: number;
    courts: { venue_id: string } | { venue_id: string }[];
  }>) {
    const court = Array.isArray(r.courts) ? r.courts[0] : r.courts;
    if (!court?.venue_id) continue;

    // A multiplier under 1 is a discount; anything else is a surcharge.
    const pct = r.kind === "discount_pct"
      ? Number(r.amount)
      : Math.round((1 - Number(r.amount)) * 100);
    if (pct <= 0) continue;

    const cur = best[court.venue_id];
    if (!cur || pct > cur.amount) {
      best[court.venue_id] = { venue_id: court.venue_id, label: r.label, amount: pct, kind: r.kind };
    }
  }
  return best;
}
