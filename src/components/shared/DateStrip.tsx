"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const KTM_TZ = "Asia/Kathmandu";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: KTM_TZ });
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export default function DateStrip({
  value, onPick, days = 21,
}: {
  value: string;
  onPick: (d: string) => void;
  days?: number;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => iso(new Date()), []);
  const [list] = useState(() =>
    Array.from({ length: days }, (_, i) => addDays(new Date(), i))
  );

  const selected = list.find((d) => iso(d) === value) ?? list[0];
  const bigLabel = selected.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: KTM_TZ,
  });

  const nudge = (dir: 1 | -1) =>
    railRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });

  return (
    <div className="ds">
      <div className="ds-head">
        <div>
          <h3 className="ds-big">{bigLabel}</h3>
        </div>
        <div className="ds-nav">
          <button onClick={() => nudge(-1)} aria-label="Earlier"><ChevronLeft size={16} /></button>
          <button onClick={() => nudge(1)} aria-label="Later"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="ds-rail" ref={railRef}>
        {list.map((d, i) => {
          const key = iso(d);
          const on = key === value;
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const label = key === today ? "Today" : i === 1 ? "Tmrw" : DOW[d.getDay()];
          const newMonth = i > 0 && d.getDate() === 1;

          return (
            <div key={key} className="ds-cell">
              {newMonth && (
                <span className="ds-monthmark">
                  {d.toLocaleDateString("en-GB", { month: "short", timeZone: KTM_TZ })}
                </span>
              )}
              <button
                className={`ds-day ${on ? "on" : ""} ${weekend ? "wknd" : ""}`}
                onClick={() => onPick(key)}
              >
                <span className="ds-dow">{label}</span>
                <span className="ds-num">{d.getDate()}</span>
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .ds { margin-bottom: 30px; }

        .ds-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 14px; margin-bottom: 16px;
        }
        .ds-big {
          font-family: 'Inter', sans-serif;
          font-size: clamp(22px, 3.2vw, 32px); font-weight: 800;
          letter-spacing: -1px; line-height: 1; margin: 0;
          background: linear-gradient(96deg, #d4e9e2, #006241 55%, #1e3932);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        [data-theme="paper"] .ds-big {
          background: linear-gradient(96deg, #004a31, #006241 55%, #1e3932);
          -webkit-background-clip: text; background-clip: text;
        }

        .ds-nav { display: flex; gap: 7px; flex-shrink: 0; }
        .ds-nav button {
          width: 34px; height: 34px; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: inherit;
          border: 1px solid var(--line, rgba(242,237,230,.14));
          background: transparent;
          transition: border-color .2s, background .2s, transform .14s;
        }
        .ds-nav button:hover {
          border-color: rgba(0,98,65,.55);
          background: rgba(0,98,65,.1);
          transform: translateY(-1px);
        }

        .ds-rail {
          display: flex; gap: 10px; overflow-x: auto;
          padding: 6px 2px 12px; scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
        }
        .ds-rail::-webkit-scrollbar { height: 0; }

        .ds-cell { position: relative; flex: 0 0 auto; }
        .ds-monthmark {
          position: absolute; top: -3px; left: 50%; transform: translateX(-50%);
          font-size: 9px; font-weight: 800; letter-spacing: .14em;
          text-transform: uppercase; color: #006241; opacity: .8;
        }

        .ds-day {
          position: relative; overflow: hidden;
          width: 66px; height: 78px; scroll-snap-align: start;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          border-radius: 18px; cursor: pointer; color: inherit; font-family: inherit;
          border: 1px solid var(--line, rgba(242,237,230,.12));
          background: transparent;
          transition: transform .22s cubic-bezier(.22,1,.36,1), border-color .2s, background .2s;
        }
        .ds-day:hover { transform: translateY(-4px); border-color: rgba(0,98,65,.45); }

        /* Weekends read warmer, so the week has a rhythm. */
        .ds-day.wknd .ds-dow { color: #006241; opacity: .75; }

        .ds-day.on {
          border-color: transparent; color: #ffffff; transform: translateY(-4px);
          background: linear-gradient(168deg, #3d8a68 0%, #006241 48%, #004a31 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.35),
            0 0 0 1px rgba(0,98,65,.35),
            0 16px 30px -12px rgba(0,98,65,.7);
        }
        .ds-day.on .ds-dow { color: rgba(255,255,255,.75); opacity: 1; }

        .ds-dow { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; opacity: .55; }
        .ds-num {
          font-family: 'Inter', sans-serif;
          font-size: 22px; font-weight: 800; letter-spacing: -1px; line-height: 1;
        }

        @media (max-width: 560px) {
          .ds-day { width: 58px; height: 70px; border-radius: 16px; }
          .ds-num { font-size: 19px; }
        }
      `}</style>
    </div>
  );
}
