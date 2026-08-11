"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDaySlots } from "@/lib/play/availability";

const KTM_TZ = "Asia/Kathmandu";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: KTM_TZ });
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export default function WeekStrip({
  courtId, durationMins, value, onPick, days = 21,
}: {
  courtId: string;
  durationMins: number;
  value: string;
  onPick: (dateStr: string) => void;
  days?: number;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => iso(new Date()), []);
  const [list] = useState(() =>
    Array.from({ length: days }, (_, i) => addDays(new Date(), i))
  );
  const [freeByDay, setFreeByDay] = useState<Record<string, number>>({});

  // Availability fills in behind the scenes — the strip shows instantly.
  useEffect(() => {
    if (!courtId) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        list.slice(0, 10).map(async (d) => {
          const key = iso(d);
          try {
            const slots = await getDaySlots(courtId, key, durationMins);
            return [key, slots.filter((s) => s.available).length] as const;
          } catch {
            return [key, -1] as const;
          }
        })
      );
      if (!cancelled) setFreeByDay(Object.fromEntries(results));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, durationMins]);

  const selected = list.find((d) => iso(d) === value) ?? list[0];
  const bigLabel = selected.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: KTM_TZ,
  });
  const selFree = freeByDay[iso(selected)];

  const nudge = (dir: 1 | -1) =>
    railRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });

  return (
    <div className="wsx">
      <div className="wsx-head">
        <div>
          <p className="wsx-kicker">
            {selFree === undefined ? "Checking availability…"
              : selFree <= 0 ? "Fully booked"
              : `${selFree} slot${selFree === 1 ? "" : "s"} free`}
          </p>
          <h3 className="wsx-big">{bigLabel}</h3>
        </div>
        <div className="wsx-nav">
          <button onClick={() => nudge(-1)} aria-label="Earlier"><ChevronLeft size={16} /></button>
          <button onClick={() => nudge(1)} aria-label="Later"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="wsx-rail" ref={railRef}>
        {list.map((d, i) => {
          const key = iso(d);
          const on = key === value;
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const label = key === today ? "Today" : i === 1 ? "Tmrw" : DOW[d.getDay()];
          const newMonth = i > 0 && d.getDate() === 1;
          const free = freeByDay[key];
          const dot =
            free === undefined || free === -1 ? "unknown" :
            free === 0 ? "none" :
            free <= 3 ? "low" : "ok";

          return (
            <div key={key} className="wsx-cell">
              {newMonth && (
                <span className="wsx-monthmark">
                  {d.toLocaleDateString("en-GB", { month: "short", timeZone: KTM_TZ })}
                </span>
              )}
              <button
                className={`wsx-day ${on ? "on" : ""} ${weekend ? "wknd" : ""} ${dot === "none" ? "full" : ""}`}
                onClick={() => onPick(key)}
                title={
                  free === undefined ? "Checking…"
                  : free === 0 ? "Fully booked"
                  : free === -1 ? ""
                  : `${free} slot${free === 1 ? "" : "s"} free`
                }
              >
                <span className="wsx-dow">{label}</span>
                <span className="wsx-num">{d.getDate()}</span>
                <span className={`wsx-dot ${dot}`} />
                {on && <span className="wsx-sheen" />}
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .wsx { margin-bottom: 26px; }

        .wsx-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 14px; margin-bottom: 16px;
        }
        .wsx-kicker {
          font-size: 10.5px; font-weight: 800; letter-spacing: .18em;
          text-transform: uppercase; opacity: .45; margin: 0 0 6px;
        }
        .wsx-big {
          font-family: 'Inter', sans-serif;
          font-size: clamp(21px, 3vw, 30px); font-weight: 800;
          letter-spacing: -1px; line-height: 1; margin: 0;
          background: linear-gradient(96deg, #d4e9e2, #006241 55%, #1e3932);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        [data-theme="paper"] .wsx-big {
          background: linear-gradient(96deg, #004a31, #006241 55%, #1e3932);
          -webkit-background-clip: text; background-clip: text;
        }

        .wsx-nav { display: flex; gap: 7px; flex-shrink: 0; }
        .wsx-nav button {
          width: 34px; height: 34px; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: inherit;
          border: 1px solid var(--line, rgba(242,237,230,.14)); background: transparent;
          transition: border-color .2s, background .2s, transform .14s;
        }
        .wsx-nav button:hover {
          border-color: rgba(0,98,65,.55); background: rgba(0,98,65,.1);
          transform: translateY(-1px);
        }

        .wsx-rail {
          display: flex; gap: 10px; overflow-x: auto;
          padding: 6px 2px 12px; scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
        }
        .wsx-rail::-webkit-scrollbar { height: 0; }

        .wsx-cell { position: relative; flex: 0 0 auto; }
        .wsx-monthmark {
          position: absolute; top: -3px; left: 50%; transform: translateX(-50%);
          font-size: 9px; font-weight: 800; letter-spacing: .14em;
          text-transform: uppercase; color: #006241; opacity: .8;
        }

        .wsx-day {
          position: relative; overflow: hidden;
          width: 66px; height: 82px; scroll-snap-align: start;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          border-radius: 18px; cursor: pointer; color: inherit; font-family: inherit;
          border: 1px solid var(--line, rgba(242,237,230,.12)); background: transparent;
          transition: transform .22s cubic-bezier(.22,1,.36,1), border-color .2s, opacity .2s;
        }
        .wsx-day:hover { transform: translateY(-4px); border-color: rgba(0,98,65,.45); }
        .wsx-day.full { opacity: .38; }
        .wsx-day.wknd .wsx-dow { color: #006241; opacity: .75; }

        .wsx-day.on {
          border-color: transparent; color: #ffffff; transform: translateY(-4px); opacity: 1;
          background: linear-gradient(168deg, #3d8a68 0%, #006241 48%, #004a31 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),
            0 0 0 1px rgba(0,98,65,.35),
            0 16px 30px -12px rgba(0,98,65,.7);
        }
        .wsx-day.on .wsx-dow { color: rgba(255,255,255,.75); opacity: 1; }

        .wsx-sheen {
          position: absolute; top: 0; bottom: 0; width: 40%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.6), transparent);
          animation: wsxSheen 3.2s ease-in-out infinite;
        }
        @keyframes wsxSheen { 0% { left: -50%; } 55% { left: 115%; } 100% { left: 115%; } }
        @media (prefers-reduced-motion: reduce) { .wsx-sheen { display: none; } }

        .wsx-dow { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; opacity: .55; }
        .wsx-num {
          font-family: 'Inter', sans-serif;
          font-size: 22px; font-weight: 800; letter-spacing: -1px; line-height: 1;
        }
        .wsx-dot { width: 5px; height: 5px; border-radius: 99px; background: transparent; }
        .wsx-dot.ok      { background: #2E7D5B; }
        .wsx-dot.low     { background: #006241; }
        .wsx-dot.unknown { background: rgba(255,255,255,.16); }
        .wsx-day.on .wsx-dot.ok, .wsx-day.on .wsx-dot.low { background: rgba(20,23,30,.62); }

        @media (max-width: 560px) {
          .wsx-day { width: 58px; height: 74px; border-radius: 16px; }
          .wsx-num { font-size: 19px; }
        }
      `}</style>
    </div>
  );
}
