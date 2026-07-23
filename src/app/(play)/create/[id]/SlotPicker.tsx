"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CalendarX } from "lucide-react";
import { getDaySlots, type Slot } from "@/lib/play/availability";

// Slots grouped the way people think about their day, not as one long grid.
const BANDS = [
  { key: "morning",   label: "Morning",   from: 0,        to: 12 * 60 },
  { key: "afternoon", label: "Afternoon", from: 12 * 60,  to: 17 * 60 },
  { key: "evening",   label: "Evening",   from: 17 * 60,  to: 24 * 60 },
];

export default function SlotPicker({
  courtId, dateStr, durationMins, value, onPick,
}: {
  courtId: string;
  dateStr: string;
  durationMins: number;
  value: number | null;            // chosen slot in minutes from midnight
  onPick: (mins: number | null) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
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
        // If the previously chosen slot no longer fits (date or duration
        // changed), drop it here rather than in a second effect.
        if (value != null && !next.some((x) => x.mins === value && x.available)) {
          onPick(null);
        }
      } catch { if (!cancelled) setSlots([]); }
    });
    return () => { cancelled = true; };
    // `value`/`onPick` intentionally excluded: refetch only on real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, dateStr, durationMins]);

  if (slots === null || pending) {
    return (
      <div className="sp-msg"><Loader2 size={16} className="sp-spin" /> Checking what&apos;s free…</div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="sp-msg">
        <CalendarX size={18} style={{ opacity: 0.6 }} />
        Closed on this day. Try another date.
      </div>
    );
  }

  const free = slots.filter((s) => s.available);
  if (free.length === 0) {
    return (
      <div className="sp-msg">
        <CalendarX size={18} style={{ opacity: 0.6 }} />
        Fully booked for {durationMins >= 60 ? `${durationMins / 60}h` : `${durationMins}m`} on this date.
      </div>
    );
  }

  return (
    <div className="sp">
      {/* Legend — say what the colours mean before showing them. */}
      <div className="sp-legend">
        <span><i className="sw free" /> Free</span>
        <span><i className="sw taken" /> Booked</span>
        <span><i className="sw picked" /> Your pick</span>
        <span className="sp-count">{free.length} of {slots.length} free</span>
      </div>

      {BANDS.map((band) => {
        const inBand = slots.filter((s) => s.mins >= band.from && s.mins < band.to);
        if (inBand.length === 0) return null;
        return (
          <div key={band.key} className="sp-band">
            <div className="sp-band-t">{band.label}</div>
            <div className="sp-grid">
              {inBand.map((s) => {
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
          </div>
        );
      })}

      <style>{`
        .sp-legend {
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          font-size: 11.5px; opacity: 0.7; margin-bottom: 18px;
        }
        .sp-legend span { display: inline-flex; align-items: center; gap: 6px; }
        .sp-legend .sw { width: 11px; height: 11px; border-radius: 4px; display: inline-block; }
        .sp-legend .sw.free   { border: 1px solid var(--line); }
        .sp-legend .sw.taken  { background: rgba(222,49,99,0.22); border: 1px solid rgba(222,49,99,0.5); }
        .sp-legend .sw.picked { background: #FFC93C; }
        .sp-count {
          margin-left: auto; font-family: 'JetBrains Mono', monospace;
          font-size: 11px; opacity: 0.55;
        }
        .sp-band { margin-bottom: 18px; }
        .sp-band:last-of-type { margin-bottom: 0; }
        .sp-band-t {
          font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.16em; text-transform: uppercase;
          opacity: 0.42; margin-bottom: 9px;
        }
        .sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
        .sp-slot {
          padding: 11px 6px; border-radius: 11px;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: 'JetBrains Mono', monospace; font-size: 13.5px; font-weight: 600;
          transition: border-color .18s, background .18s, color .18s, transform .18s;
        }
        /* free */
        .sp-slot.free { cursor: pointer; }
        .sp-slot.free:hover { border-color: rgba(255,201,60,.55); transform: translateY(-2px); }
        /* booked — the cinema "seat taken" state */
        .sp-slot.taken {
          cursor: not-allowed;
          background: rgba(222,49,99,0.12);
          border-color: rgba(222,49,99,0.45);
          color: rgba(222,49,99,0.85);
          text-decoration: line-through;
          text-decoration-thickness: 1px;
        }
        /* already gone today — quieter than booked, it isn't anyone's fault */
        .sp-slot.past {
          cursor: not-allowed; opacity: 0.28;
          text-decoration: line-through; text-decoration-thickness: 1px;
        }
        /* your pick */
        .sp-slot.picked {
          background: #FFC93C; border-color: #FFC93C; color: #0B0D11;
          transform: translateY(-2px); cursor: pointer;
        }
        .sp-msg {
          display: flex; align-items: center; gap: 9px;
          font-size: 13.5px; opacity: 0.65; padding: 18px 0;
        }
        .sp-spin { animation: spspin 1s linear infinite; }
        @keyframes spspin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
