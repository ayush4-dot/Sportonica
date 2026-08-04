"use server";

import { createClient } from "@/lib/supabase/server";

export interface Slot {
  /** minutes from midnight, e.g. 17:30 → 1050 */
  mins: number;
  label: string;        // "17:30"
  available: boolean;
  reason?: "booked" | "past" | "closed";
}

const KTM_OFFSET = "+05:45";
const STEP = 30;        // minute granularity

function label(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Real availability for one court on one day.
 * Builds 30-minute slots between the venue's open/close for that weekday,
 * then removes anything already booked, blocked, or in the past.
 */
export async function getDaySlots(
  courtId: string,
  dateStr: string,           // "2026-07-23" in Kathmandu
  durationMins: number       // how long they want to play
): Promise<Slot[]> {
  const sb = await createClient();

  // Weekday in Kathmandu (0 = Sunday, matching court_hours.dow)
  const dow = new Date(`${dateStr}T12:00:00${KTM_OFFSET}`).getUTCDay();

  // Existing bookings and blocks for that court on that day.
  const dayStart = `${dateStr}T00:00:00${KTM_OFFSET}`;
  const dayEnd = `${dateStr}T23:59:59${KTM_OFFSET}`;

  // None of these three depend on each other's results — they used to run
  // as a waterfall (hours, then bookings+blocks), doubling the round-trip
  // time on every date/duration change. Firing them together instead.
  const [
    { data: hours, error: hoursErr },
    { data: bookings, error: bErr },
    { data: blocks },
  ] = await Promise.all([
    sb.from("court_hours")
      .select("*")
      .eq("court_id", courtId)
      .eq("dow", dow)
      .maybeSingle(),
    sb.from("court_bookings")
      .select("*")
      .eq("court_id", courtId)
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd),
    sb.from("court_blocks")
      .select("starts_at, ends_at")
      .eq("court_id", courtId)
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd),
  ]);

  if (hoursErr) {
    console.error("[availability] court_hours query failed:", hoursErr.message);
    return [];
  }
  if (bErr) console.error("[availability] bookings query failed:", bErr.message);

  // Schemas vary — some have is_closed, some mark closure by null times.
  const row = hours as Record<string, unknown> | null;
  const closed = Boolean(row?.is_closed ?? row?.closed ?? false);
  const openRaw = (row?.open_time ?? row?.opens_at ?? null) as string | null;
  const closeRaw = (row?.close_time ?? row?.closes_at ?? null) as string | null;

  // Closed that day, or hours never set → nothing bookable.
  if (!row || closed || !openRaw || !closeRaw) return [];

  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const open = toMins(openRaw);
  const close = toMins(closeRaw);
  if (!(close > open)) return [];

  // Busy ranges, in minutes from midnight (Kathmandu).
  const busy: [number, number][] = [];
  const ktmMinutes = (iso: string) => {
    // en-GB with hour12:false gives a stable "HH:MM" in the target zone.
    const t = new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kathmandu",
    });
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const rangeOf = (s: string, e: string): [number, number] => {
    const a = ktmMinutes(s);
    let b = ktmMinutes(e);
    if (b <= a) b = 24 * 60;          // ran past midnight — clamp to end of day
    return [a, b];
  };
  // The column is `state` in this schema, `status` in others — read either,
  // and only ignore cancelled bookings. Anything else blocks the slot.
  (bookings ?? [])
    .filter((b) => {
      const r = b as Record<string, unknown>;
      const st = String(r.state ?? r.status ?? "").toLowerCase();
      return st !== "cancelled" && st !== "canceled";
    })
    .forEach((b) => busy.push(rangeOf(b.starts_at, b.ends_at)));
  (blocks ?? []).forEach((b) => busy.push(rangeOf(b.starts_at, b.ends_at)));

  // "Now" in Kathmandu minutes, for hiding past slots today.
  const nowKtm = new Date().toLocaleString("en-CA", { timeZone: "Asia/Kathmandu", hour12: false });
  const isToday = nowKtm.slice(0, 10) === dateStr;
  const nowMins = isToday
    ? Number(nowKtm.slice(11, 13)) * 60 + Number(nowKtm.slice(14, 16))
    : -1;

  const out: Slot[] = [];
  for (let t = open; t + durationMins <= close; t += STEP) {
    const end = t + durationMins;
    const overlaps = busy.some(([bs, be]) => t < be && end > bs);
    const past = isToday && t <= nowMins + 30;   // need 30 min lead time

    out.push({
      mins: t,
      label: label(t),
      available: !overlaps && !past,
      reason: overlaps ? "booked" : past ? "past" : undefined,
    });
  }
  return out;
}
