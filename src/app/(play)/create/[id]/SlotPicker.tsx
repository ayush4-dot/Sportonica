"use client";

import { useEffect, useRef, useState, useTransition, useMemo } from "react";
import { Loader2, CalendarX } from "lucide-react";
import { getDaySlots, type Slot } from "@/lib/play/availability";
import { createClient } from "@/lib/supabase/client";

const BANDS: { key: "morning" | "afternoon" | "evening"; label: string; from: number; to: number }[] = [
  { key: "morning",   label: "Morning",   from: 0,       to: 12 * 60 },
  { key: "afternoon", label: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "evening",   label: "Evening",   from: 17 * 60, to: 24 * 60 },
];

// People commonly bounce between a few dates while picking a slot — cache
// briefly so flipping back feels instant instead of re-querying from zero.
// Short TTL because this is live booking availability, not static data.
const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { data: Slot[]; at: number }>();

// availability.ts computes "past" once, at fetch time — fine for a slot
// that's already past when the list loads, but a slot that was still
// >=30min out at fetch time silently drifts into "too soon to book" the
// longer the page sits open (no refetch just because time passes). Redo
// the same check live, client-side, on every render.
const KTM_TZ = "Asia/Kathmandu";
function nowKtmMins(): number {
  const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: KTM_TZ });
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function todayKtmStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: KTM_TZ });
}

export default function SlotPicker({
  courtId, dateStr, durationMins, value, onPick, refreshSignal = 0,
}: {
  courtId: string;
  dateStr: string;
  durationMins: number;
  value: number | null;
  onPick: (mins: number | null) => void;
  /** bump from the parent to force a fresh availability fetch — e.g. after
   *  the server rejects a booking because the slot was just taken. */
  refreshSignal?: number;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const lastRefreshSignal = useRef(refreshSignal);
  const [band, setBand] = useState(() => {
    if (value != null) {
      const b = BANDS.find((b) => value >= b.from && value < b.to);
      if (b) return b.key;
    }
    return "evening";
  });
  const [pending, startTransition] = useTransition();
  // Bumped by the realtime subscription below to force a fresh fetch when
  // someone else books or cancels a slot on this court.
  const [refreshTick, setRefreshTick] = useState(0);

  // Ticks every 30s so a slot that drifts within the 30-min lead-time
  // window while this screen is just sitting open disappears on its own,
  // instead of staying clickable until something else forces a re-render.
  const [nowMins, setNowMins] = useState(nowKtmMins);
  useEffect(() => {
    const id = setInterval(() => setNowMins(nowKtmMins()), 30_000);
    return () => clearInterval(id);
  }, []);
  const isPastLive = (mins: number) => dateStr === todayKtmStr() && mins <= nowMins + 30;

  // If the already-picked time drifts into the past while this screen
  // just sits open, drop the selection instead of leaving a now-invalid
  // pick that would fail at booking time.
  useEffect(() => {
    if (value != null && isPastLive(value)) onPick(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMins]);

  useEffect(() => {
    if (!courtId || !dateStr) return;
    let cancelled = false;

    const key = `${courtId}|${dateStr}|${durationMins}`;
    // A refreshSignal bump (parent saw a booking conflict) means "ignore
    // the cache, ask the server again".
    if (lastRefreshSignal.current !== refreshSignal) {
      lastRefreshSignal.current = refreshSignal;
      for (const k of Array.from(cache.keys())) {
        if (k.startsWith(`${courtId}|`)) cache.delete(k);
      }
    }
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setSlots(cached.data);
      if (value != null && !cached.data.some((x) => x.mins === value && x.available)) {
        onPick(null);
      }
      return;
    }

    startTransition(async () => {
      setSlots(null);
      try {
        const next = await getDaySlots(courtId, dateStr, durationMins);
        if (cancelled) return;
        cache.set(key, { data: next, at: Date.now() });
        setSlots(next);
        if (value != null && !next.some((x) => x.mins === value && x.available)) {
          onPick(null);
        }
      } catch { if (!cancelled) setSlots([]); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, dateStr, durationMins, refreshTick, refreshSignal]);

  // Supabase realtime — supplementary only. If another player books or
  // cancels a slot on this court while this screen is open, drop the
  // cached days for the court and refetch so the timetable (and the red
  // BOOKED boxes) update without a page refresh. The server still
  // re-checks availability at confirm time regardless.
  //
  // We listen on public.court_availability_pings (court_id + day only, no
  // PII, world-readable) rather than court_bookings directly — the latter
  // is row-locked to its owner by RLS, so another player's booking would
  // never reach this subscription. A trigger keeps the pings table in
  // sync (see supabase/realtime_availability.sql).
  useEffect(() => {
    if (!courtId) return;
    const sb = createClient();
    const channel = sb
      .channel(`court-slots:${courtId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "court_availability_pings", filter: `court_id=eq.${courtId}` },
        () => {
          for (const k of Array.from(cache.keys())) {
            if (k.startsWith(`${courtId}|`)) cache.delete(k);
          }
          setRefreshTick((n) => n + 1);
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [courtId]);

  // Re-apply the past-time check live (see isPastLive above) on top of
  // whatever the server said at fetch time — this is what everything
  // below actually renders from, not the raw fetch result.
  const liveSlots = useMemo(
    () => (slots ?? []).map((s) => (s.available && isPastLive(s.mins) ? { ...s, available: false, reason: "past" as const } : s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, nowMins, dateStr]
  );

  // Counts per band. Booked slots are now shown (as red "BOOKED" boxes,
  // per the booking-UI spec) rather than hidden, so a band gets a tab if
  // it has anything free *or* anything booked — but the tab label still
  // reports only what's actually free. Past slots stay hidden.
  const counts = useMemo(() => {
    const out: Record<string, { free: number; booked: number }> = {};
    for (const b of BANDS) {
      const inBand = liveSlots.filter((s) => s.mins >= b.from && s.mins < b.to);
      out[b.key] = {
        free: inBand.filter((s) => s.available).length,
        booked: inBand.filter((s) => s.reason === "booked").length,
      };
    }
    return out;
  }, [liveSlots]);

  const bandHasSomething = (k: string) =>
    (counts[k]?.free ?? 0) > 0 || (counts[k]?.booked ?? 0) > 0;

  // Open the first band that has something free; failing that, the first
  // band that has anything to show at all.
  useEffect(() => {
    if (!slots) return;
    if ((counts[band]?.free ?? 0) > 0) return;
    const firstFree = BANDS.find((b) => (counts[b.key]?.free ?? 0) > 0);
    const firstAny = BANDS.find((b) => bandHasSomething(b.key));
    const target = firstFree ?? firstAny;
    if (target && target.key !== band) setBand(target.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, counts]);

  if (slots === null || pending) {
    return <div className="sp-msg"><Loader2 size={16} className="sp-spin" /> Checking what&apos;s free…</div>;
  }
  if (slots.length === 0) {
    return <div className="sp-msg"><CalendarX size={18} style={{ opacity: .6 }} /> Closed on this day. Try another date.</div>;
  }

  const free = liveSlots.filter((s) => s.available);
  const bookedSlots = liveSlots.filter((s) => s.reason === "booked");
  // Only bail out entirely when there is genuinely nothing to render —
  // no free slots *and* no booked ones (e.g. every slot is in the past).
  if (free.length === 0 && bookedSlots.length === 0) {
    return (
      <div className="sp-msg">
        <CalendarX size={18} style={{ opacity: .6 }} />
        Fully booked for {durationMins >= 60 ? `${durationMins / 60}h` : `${durationMins}m`} on this date.
      </div>
    );
  }

  const activeBand = BANDS.find((b) => b.key === band) ?? BANDS[2];
  // Available slots stay clickable; booked slots are shown too (rendered
  // as red "BOOKED" boxes below) so nothing silently disappears. Past
  // times are still dropped — this timetable never shows a time gone by.
  const shown = liveSlots.filter(
    (s) =>
      s.mins >= activeBand.from &&
      s.mins < activeBand.to &&
      (s.available || s.reason === "booked"),
  );

  return (
    <div className="sp">
      {/* One period at a time — the whole day at once was too much. */}
      <div className="sp-tabs">
        {BANDS.map((b) => {
          const c = counts[b.key];
          if (!c || (c.free === 0 && c.booked === 0)) return null;
          return (
            <button key={b.key} className={`sp-tab ${band === b.key ? "on" : ""}`} onClick={() => setBand(b.key)}>
              <span className="t">{b.label}</span>
              <span className="n">{c.free} free</span>
            </button>
          );
        })}
      </div>

      <div className="sp-grid">
        {shown.map((s) => {
          if (s.reason === "booked") {
            return (
              <button
                key={s.mins}
                type="button"
                className="sp-slot booked"
                disabled
                aria-disabled="true"
                title={`${s.label} — already booked`}
              >
                <span className="sp-slot-time">{s.label}</span>
                <span className="sp-slot-tag">BOOKED</span>
              </button>
            );
          }
          const picked = value === s.mins;
          return (
            <button
              key={s.mins}
              className={`sp-slot ${picked ? "picked" : "free"}`}
              onClick={() => onPick(s.mins)}
              title={`Book ${s.label}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="sp-legend">
        <span><i className="sw free" /> Free</span>
        <span><i className="sw picked" /> Your pick</span>
        {bookedSlots.length > 0 && <span><i className="sw booked" /> Booked</span>}
        <span className="sp-count">{free.length} free today</span>
      </div>

      <style>{`
        .sp-tabs { display: flex; gap: 7px; margin-bottom: 16px; }
        .sp-tab {
          flex: 1; display: flex; flex-direction: column; gap: 2px; align-items: center;
          padding: 10px 6px; border-radius: 12px; cursor: pointer;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: inherit; transition: border-color .18s, background .18s, color .18s;
        }
        .sp-tab:hover { border-color: rgba(0,98,65,.45); }
        .sp-tab.on { background: rgba(0,98,65,.14); border-color: rgba(0,98,65,.55); color: #006241; }
        .sp-tab .t { font-size: 13px; font-weight: 700; }
        .sp-tab .n { font-family: 'Inter', sans-serif; font-size: 10.5px; opacity: .6; }

        .sp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px;
        }
        .sp-slot {
          padding: 13px 6px; border-radius: 12px;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700;
          transition: border-color .18s, background .18s, color .18s, transform .18s, box-shadow .18s;
        }
        .sp-slot.free { cursor: pointer; }
        .sp-slot.free:hover { border-color: rgba(0,98,65,.6); transform: translateY(-2px); }

        /* Booked — the one booking-UI change: this exact box turns red and
           says BOOKED. Not clickable, never confused with "your pick". */
        .sp-slot.booked {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          cursor: not-allowed;
          background: rgba(220,38,38,.12);
          border-color: rgba(220,38,38,.55);
          color: #dc2626;
        }
        .sp-slot.booked:disabled { opacity: 1; }
        .sp-slot.booked .sp-slot-time { font-size: 13px; font-weight: 700; }
        .sp-slot.booked .sp-slot-tag {
          font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 800;
          letter-spacing: .1em; opacity: .9;
        }

        /* Your pick — solid, lifted and ringed so it can't be missed. */
        .sp-slot.picked {
          background: #006241; border-color: #006241; color: #ffffff;
          font-weight: 800; cursor: pointer;
          transform: translateY(-2px);
          box-shadow: 0 0 0 4px rgba(0,98,65,.22), 0 8px 20px -6px rgba(0,98,65,.55);
        }

        .sp-legend {
          display: flex; align-items: center; gap: 15px; flex-wrap: wrap;
          font-size: 11.5px; opacity: .7; margin-top: 16px;
        }
        .sp-legend span { display: inline-flex; align-items: center; gap: 6px; }
        .sp-legend .sw { width: 11px; height: 11px; border-radius: 4px; display: inline-block; }
        .sp-legend .sw.free   { border: 1px solid var(--line); }
        .sp-legend .sw.picked { background: #006241; }
        .sp-legend .sw.booked { background: rgba(220,38,38,.12); border: 1px solid rgba(220,38,38,.55); }
        .sp-count { margin-left: auto; font-family: 'Inter', sans-serif; font-size: 11px; opacity: .55; }

        .sp-msg { display: flex; align-items: center; gap: 9px; font-size: 13.5px; opacity: .65; padding: 18px 0; }
        .sp-spin { animation: spspin 1s linear infinite; }
        @keyframes spspin { to { transform: rotate(360deg); } }

        @media (max-width: 560px) {
          .sp-grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
          .sp-slot { padding: 11px 4px; font-size: 13px; }
        }
      `}</style>
    </div>
  );
}
