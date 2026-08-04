"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { Loader2, CalendarX } from "lucide-react";
import { getDaySlots, type Slot } from "@/lib/play/availability";

const BANDS = [
  { key: "morning",   label: "Morning",   from: 0,       to: 12 * 60 },
  { key: "afternoon", label: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "evening",   label: "Evening",   from: 17 * 60, to: 24 * 60 },
];

export default function SlotPicker({
  courtId, dateStr, durationMins, value, onPick,
}: {
  courtId: string;
  dateStr: string;
  durationMins: number;
  value: number | null;
  onPick: (mins: number | null) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [band, setBand] = useState("evening");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!courtId || !dateStr) return;
    let cancelled = false;
    startTransition(async () => {
      setSlots(null);
      try {
        const next = await getDaySlots(courtId, dateStr, durationMins);
        if (cancelled) return;
        setSlots(next);
        if (value != null && !next.some((x) => x.mins === value && x.available)) {
          onPick(null);
        }
      } catch { if (!cancelled) setSlots([]); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, dateStr, durationMins]);

  // Counts per band, so the tabs can say what's actually free.
  const counts = useMemo(() => {
    const out: Record<string, { free: number; total: number }> = {};
    for (const b of BANDS) {
      const inBand = (slots ?? []).filter((s) => s.mins >= b.from && s.mins < b.to);
      out[b.key] = { free: inBand.filter((s) => s.available).length, total: inBand.length };
    }
    return out;
  }, [slots]);

  // Open the first band that actually has something free.
  useEffect(() => {
    if (!slots) return;
    if (counts[band]?.free > 0) return;
    const firstFree = BANDS.find((b) => counts[b.key]?.free > 0);
    if (firstFree) setBand(firstFree.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  if (slots === null || pending) {
    return <div className="sp-msg"><Loader2 size={16} className="sp-spin" /> Checking what&apos;s free…</div>;
  }
  if (slots.length === 0) {
    return <div className="sp-msg"><CalendarX size={18} style={{ opacity: .6 }} /> Closed on this day. Try another date.</div>;
  }

  const free = slots.filter((s) => s.available);
  if (free.length === 0) {
    return (
      <div className="sp-msg">
        <CalendarX size={18} style={{ opacity: .6 }} />
        Fully booked for {durationMins >= 60 ? `${durationMins / 60}h` : `${durationMins}m`} on this date.
      </div>
    );
  }

  const activeBand = BANDS.find((b) => b.key === band) ?? BANDS[2];
  const shown = slots.filter((s) => s.mins >= activeBand.from && s.mins < activeBand.to);

  return (
    <div className="sp">
      {/* One period at a time — the whole day at once was too much. */}
      <div className="sp-tabs">
        {BANDS.map((b) => {
          const c = counts[b.key];
          if (!c || c.total === 0) return null;
          return (
            <button key={b.key} className={`sp-tab ${band === b.key ? "on" : ""}`} onClick={() => setBand(b.key)}>
              <span className="t">{b.label}</span>
              <span className="n">{c.free ? `${c.free} free` : "full"}</span>
            </button>
          );
        })}
      </div>

      <div className="sp-grid">
        {shown.map((s) => {
          const picked = value === s.mins;
          const cls = picked ? "picked" : s.available ? "free" : s.reason === "past" ? "past" : "taken";
          return (
            <button
              key={s.mins}
              className={`sp-slot ${cls}`}
              onClick={() => s.available && onPick(s.mins)}
              disabled={!s.available}
              title={
                s.reason === "booked" ? "Already booked"
                : s.reason === "past" ? "Too late for today"
                : `Book ${s.label}`
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="sp-legend">
        <span><i className="sw free" /> Free</span>
        <span><i className="sw taken" /> Booked</span>
        <span><i className="sw picked" /> Your pick</span>
        <span className="sp-count">{free.length} of {slots.length} free today</span>
      </div>

      <style>{`
        .sp-tabs { display: flex; gap: 7px; margin-bottom: 16px; }
        .sp-tab {
          flex: 1; display: flex; flex-direction: column; gap: 2px; align-items: center;
          padding: 10px 6px; border-radius: 12px; cursor: pointer;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: inherit; transition: border-color .18s, background .18s, color .18s;
        }
        .sp-tab:hover { border-color: rgba(167,139,250,.45); }
        .sp-tab.on { background: rgba(167,139,250,.14); border-color: rgba(167,139,250,.55); color: #A78BFA; }
        .sp-tab .t { font-size: 13px; font-weight: 700; }
        .sp-tab .n { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; opacity: .6; }

        .sp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px;
        }
        .sp-slot {
          padding: 13px 6px; border-radius: 12px;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700;
          transition: border-color .18s, background .18s, color .18s, transform .18s, box-shadow .18s;
        }
        .sp-slot.free { cursor: pointer; }
        .sp-slot.free:hover { border-color: rgba(167,139,250,.6); transform: translateY(-2px); }

        .sp-slot.taken {
          cursor: not-allowed;
          background: rgba(222,49,99,.12); border-color: rgba(222,49,99,.4);
          color: rgba(222,49,99,.8);
          text-decoration: line-through; text-decoration-thickness: 1px;
        }
        .sp-slot.past {
          cursor: not-allowed; opacity: .25;
          text-decoration: line-through; text-decoration-thickness: 1px;
        }

        /* Your pick — solid, lifted and ringed so it can't be missed. */
        .sp-slot.picked {
          background: #A78BFA; border-color: #A78BFA; color: #14171E;
          font-weight: 800; cursor: pointer;
          transform: translateY(-2px);
          box-shadow: 0 0 0 4px rgba(167,139,250,.22), 0 8px 20px -6px rgba(167,139,250,.55);
        }

        .sp-legend {
          display: flex; align-items: center; gap: 15px; flex-wrap: wrap;
          font-size: 11.5px; opacity: .7; margin-top: 16px;
        }
        .sp-legend span { display: inline-flex; align-items: center; gap: 6px; }
        .sp-legend .sw { width: 11px; height: 11px; border-radius: 4px; display: inline-block; }
        .sp-legend .sw.free   { border: 1px solid var(--line); }
        .sp-legend .sw.taken  { background: rgba(222,49,99,.22); border: 1px solid rgba(222,49,99,.5); }
        .sp-legend .sw.picked { background: #A78BFA; }
        .sp-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; opacity: .55; }

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
