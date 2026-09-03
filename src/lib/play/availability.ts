"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

type BusyRow = { starts_at: string; ends_at: string };

// A raw court_bookings row → is this slot actually BOOKED? A row that's
// still waiting on payment (reserved / unpaid / pending_verification /
// rejected) does NOT count — the slot stays open until payment is
// approved. Mirrors court_booking_slot_state() in
// supabase/booking_payment_gated.sql.
function isBookedRow(r: Record<string, unknown>): boolean {
  const state = String(r.state ?? "").toLowerCase();
  const pay = String(r.payment_status ?? "").toLowerCase();
  const source = String(r.source ?? "").toLowerCase();

  if (pay === "paid") return true;
  if (["confirmed", "checked_in", "played", "paid"].includes(state)) return true;
  if (["walk_in", "phone"].includes(source) && state === "confirmed") return true;
  return false;
}

function fromRows(bookings: unknown[] | null, blocks: unknown[] | null): BusyRow[] {
  const out: BusyRow[] = [];
  for (const b of bookings ?? []) {
    if (!isBookedRow(b as Record<string, unknown>)) continue;
    const r = b as { starts_at: string; ends_at: string };
    out.push({ starts_at: r.starts_at, ends_at: r.ends_at });
  }
  for (const k of blocks ?? []) {
    const r = k as { starts_at: string; ends_at: string };
    out.push({ starts_at: r.starts_at, ends_at: r.ends_at });
  }
  return out;
}

// Every range that's genuinely unavailable on this court that day
// (approved bookings + venue blocks), regardless of who booked it.
// Tried in order:
//   1. service-role read — bypasses court_bookings RLS.
//   2. court_busy_slots() RPC (supabase/booking_payment_gated.sql).
//   3. plain RLS-limited read (only the viewer's own bookings).
async function fetchBusy(
  sb: Awaited<ReturnType<typeof createClient>>,
  courtId: string,
  dateStr: string,
  dayStart: string,
  dayEnd: string,
): Promise<BusyRow[]> {
  const cols = "starts_at, ends_at, state, payment_status, source, created_at";
  try {
    const admin = createServiceClient();
    const [{ data: bookings, error: bErr }, { data: blocks }] = await Promise.all([
      admin.from("court_bookings").select(cols)
        .eq("court_id", courtId).gte("starts_at", dayStart).lte("starts_at", dayEnd),
      admin.from("court_blocks").select("starts_at, ends_at")
        .eq("court_id", courtId).gte("starts_at", dayStart).lte("starts_at", dayEnd),
    ]);
    if (!bErr) return fromRows(bookings, blocks);
  } catch {
    /* service role not configured — fall through */
  }

  const { data: rpc, error: rpcErr } = await sb.rpc("court_busy_slots", {
    p_court_id: courtId, p_day: dateStr, p_tz: "Asia/Kathmandu",
  });
  if (!rpcErr && rpc) {
    // A slot is only shown as taken once its payment is approved. Older
    // versions of court_busy_slots() also return a 'held' tag for
    // reserved-but-unpaid rows — drop those, an unpaid reservation
    // doesn't book the slot.
    return (rpc as { starts_at: string; ends_at: string; kind?: string }[])
      .filter((r) => r.kind !== "held")
      .map((r) => ({ starts_at: r.starts_at, ends_at: r.ends_at }));
  }

  console.warn(
    "[availability] can't see other players' bookings — set SUPABASE_SERVICE_ROLE_KEY or apply supabase/booking_payment_gated.sql. Showing RLS-limited availability.",
  );
  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    sb.from("court_bookings").select(cols)
      .eq("court_id", courtId).gte("starts_at", dayStart).lte("starts_at", dayEnd),
    sb.from("court_blocks").select("starts_at, ends_at")
      .eq("court_id", courtId).gte("starts_at", dayStart).lte("starts_at", dayEnd),
  ]);
  return fromRows(bookings, blocks);
}

export interface Slot {
  /** minutes from midnight, e.g. 17:30 → 1050 */
  mins: number;
  label: string;        // "17:30"
  available: boolean;
  /** booked = an approved booking / venue block sits on this time. */
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

  const [{ data: hours, error: hoursErr }, busyRows] = await Promise.all([
    sb.from("court_hours").select("*").eq("court_id", courtId).eq("dow", dow).maybeSingle(),
    fetchBusy(sb, courtId, dateStr, dayStart, dayEnd),
  ]);

  if (hoursErr) {
    console.error("[availability] court_hours query failed:", hoursErr.message);
    return [];
  }

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

  // Busy ranges, in minutes from midnight (Kathmandu), with their kind.
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
  busyRows.forEach((b) => busy.push(rangeOf(b.starts_at, b.ends_at)));

  // "Now" in Kathmandu minutes, for hiding past slots today. en-CA's
  // combined date+time format is "YYYY-MM-DD, HH:MM:SS" — a comma-space,
  // not a single space — so slicing fixed date-string offsets out of it
  // silently pulled the wrong characters (Number(" 1") and Number(":2"),
  // one wrong and one NaN) and made this comparison always false: no
  // slot was ever actually excluded as "past", for anyone, at any time.
  // Two separate, single-purpose locale calls (date-only, time-only) sidestep
  // the combined format entirely — same approach as ktmMinutes() below.
  const todayKtm = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  const isToday = todayKtm === dateStr;
  const nowMins = isToday
    ? (() => {
        const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kathmandu" });
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      })()
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
