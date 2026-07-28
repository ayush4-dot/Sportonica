"use client";

import { useState, useEffect } from "react";
import { MapPin, Navigation, X, Wallet, SlidersHorizontal } from "lucide-react";

export type VenueDist = "any" | "2" | "5" | "10";
export type VenuePrice = "any" | "1000" | "2000" | "3000";

const DIST_OPTS: { k: VenueDist; label: string }[] = [
  { k: "any", label: "Anywhere" },
  { k: "2", label: "Within 2 km" },
  { k: "5", label: "Within 5 km" },
  { k: "10", label: "Within 10 km" },
];
const PRICE_OPTS: { k: VenuePrice; label: string }[] = [
  { k: "any", label: "Any rate" },
  { k: "1000", label: "Under Rs 1,000/hr" },
  { k: "2000", label: "Under Rs 2,000/hr" },
  { k: "3000", label: "Under Rs 3,000/hr" },
];

export default function VenueFilters({
  dist, setDist, price, setPrice, onLocation, hasLocation, count, onClear,
}: {
  dist: VenueDist;
  setDist: (d: VenueDist) => void;
  price: VenuePrice;
  setPrice: (p: VenuePrice) => void;
  onLocation: (c: [number, number] | null) => void;
  hasLocation: boolean;
  count: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  // Ask for location the moment a distance filter is chosen.
  useEffect(() => {
    if (dist !== "any" && !hasLocation && !locating) {
      setLocating(true);
      navigator.geolocation?.getCurrentPosition(
        (p) => { onLocation([p.coords.latitude, p.coords.longitude]); setLocating(false); },
        () => { setLocating(false); setDist("any"); },
        { timeout: 8000 }
      );
    }
  }, [dist, hasLocation, locating, onLocation, setDist]);

  const activeCount = (dist !== "any" ? 1 : 0) + (price !== "any" ? 1 : 0);
  const labelOf = (opts: { k: string; label: string }[], v: string) =>
    opts.find((o) => o.k === v)?.label ?? v;

  return (
    <div className="vf">
      <div className="vf-bar">
        <button className={`vf-toggle ${activeCount > 0 ? "on" : ""}`} onClick={() => setOpen((v) => !v)}>
          <SlidersHorizontal size={14} />
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>

        {/* quick chips — what most people want first */}
        <button className={`vf-chip ${dist !== "any" ? "on" : ""}`}
          onClick={() => setDist(dist === "any" ? "5" : "any")}>
          <MapPin size={12} /> Near me
        </button>
        <button className={`vf-chip ${price === "2000" ? "on" : ""}`}
          onClick={() => setPrice(price === "2000" ? "any" : "2000")}>
          <Wallet size={12} /> Under Rs 2,000
        </button>

        <span className="vf-count">
          {locating ? "Finding you…" : `${count} ground${count !== 1 ? "s" : ""}`}
        </span>

        {activeCount > 0 && (
          <button className="vf-clear" onClick={onClear}>
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Active filters — visible and individually removable */}
      {activeCount > 0 && (
        <div className="vf-active">
          {price !== "any" && (
            <button className="vf-pill" onClick={() => setPrice("any")}>
              {labelOf(PRICE_OPTS, price)} <X size={11} />
            </button>
          )}
          {dist !== "any" && (
            <button className="vf-pill" onClick={() => { setDist("any"); onLocation(null); }}>
              {labelOf(DIST_OPTS, dist)} <X size={11} />
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="vf-panel">
          <div className="vf-group">
            <p className="vf-gt"><Wallet size={13} /> Rate per hour</p>
            <div className="vf-gopts">
              {PRICE_OPTS.map((o) => (
                <button key={o.k} className={`vf-opt ${price === o.k ? "on" : ""}`}
                  onClick={() => setPrice(o.k)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="vf-group">
            <p className="vf-gt"><Navigation size={13} /> Distance</p>
            <div className="vf-gopts">
              {DIST_OPTS.map((o) => (
                <button key={o.k} className={`vf-opt ${dist === o.k ? "on" : ""}`}
                  onClick={() => setDist(o.k)}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .vf { margin: 0 0 30px; }
        .vf-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vf-toggle, .vf-chip, .vf-clear {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--line, rgba(242,237,230,0.14));
          background: transparent; color: inherit; border-radius: 999px;
          padding: 8px 14px; font-size: 12.5px; font-weight: 600;
          font-family: inherit; cursor: pointer;
          transition: border-color .2s, background .2s, color .2s;
        }
        .vf-toggle:hover, .vf-chip:hover { border-color: rgba(255,201,60,.5); }
        .vf-toggle.on, .vf-chip.on {
          background: rgba(255,201,60,.14); border-color: rgba(255,201,60,.5); color: #FFC93C;
        }
        .vf-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; opacity: .55; }
        .vf-clear { border: none; opacity: .6; padding: 8px; }
        .vf-clear:hover { opacity: 1; }

        .vf-active { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
        .vf-pill {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid rgba(255,201,60,.45); background: rgba(255,201,60,.14);
          color: #FFC93C; border-radius: 999px; padding: 6px 12px;
          font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer;
          transition: background .18s, border-color .18s;
        }
        .vf-pill:hover { background: rgba(255,201,60,.24); border-color: rgba(255,201,60,.7); }

        .vf-panel {
          margin-top: 12px; padding: 16px; border-radius: 16px;
          background: rgba(255,255,255,0.035); border: 1px solid var(--line, rgba(242,237,230,0.12));
          display: flex; flex-direction: column; gap: 16px;
        }
        [data-theme="paper"] .vf-panel { background: rgba(20,23,30,0.03); }
        .vf-gt {
          display: flex; align-items: center; gap: 6px; margin: 0 0 9px;
          font-size: 11px; font-weight: 700; letter-spacing: .1em;
          text-transform: uppercase; opacity: .55;
        }
        .vf-gopts { display: flex; gap: 7px; flex-wrap: wrap; }
        .vf-opt {
          border: 1px solid var(--line, rgba(242,237,230,0.14)); background: transparent;
          color: inherit; border-radius: 999px; padding: 7px 13px;
          font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer;
          transition: border-color .2s, background .2s, color .2s;
        }
        .vf-opt:hover { border-color: rgba(255,201,60,.5); }
        .vf-opt.on { background: rgba(255,201,60,.14); border-color: rgba(255,201,60,.5); color: #FFC93C; }

        @media (max-width: 640px) {
          .vf-count { width: 100%; margin-left: 0; order: 99; }
        }
      `}</style>
    </div>
  );
}
