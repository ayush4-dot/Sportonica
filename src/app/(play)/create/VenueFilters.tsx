"use client";

import { useState, useEffect } from "react";
import { MapPin, Navigation, X } from "lucide-react";
import { SPORT_NAMES, sportColor } from "@/lib/sports";

export type VenueDist = "any" | "2" | "5" | "10";

export default function VenueFilters({
  sport, setSport, dist, setDist, onLocation, hasLocation, count,
}: {
  sport: string | null;
  setSport: (s: string | null) => void;
  dist: VenueDist;
  setDist: (d: VenueDist) => void;
  onLocation: (c: [number, number] | null) => void;
  hasLocation: boolean;
  count: number;
}) {
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

  const DISTS: { k: VenueDist; label: string }[] = [
    { k: "2", label: "2 km" },
    { k: "5", label: "5 km" },
    { k: "10", label: "10 km" },
  ];

  return (
    <div className="vf">
      {/* sports */}
      <div className="vf-row">
        <button className={`vf-chip ${!sport ? "on" : ""}`} onClick={() => setSport(null)}>
          All sports
        </button>
        {SPORT_NAMES.map((s) => (
          <button key={s}
            className={`vf-chip ${sport === s ? "on" : ""}`}
            style={sport === s ? { borderColor: `${sportColor(s)}88`, background: `${sportColor(s)}1f`, color: sportColor(s) } : undefined}
            onClick={() => setSport(sport === s ? null : s)}>
            {s}
          </button>
        ))}
      </div>

      {/* distance */}
      <div className="vf-row">
        <span className="vf-lab"><Navigation size={12} /> Near me</span>
        {DISTS.map((d) => (
          <button key={d.k}
            className={`vf-chip sm ${dist === d.k ? "on" : ""}`}
            onClick={() => setDist(dist === d.k ? "any" : d.k)}>
            {d.k === dist && <MapPin size={11} />} {d.label}
          </button>
        ))}
        {(sport || dist !== "any") && (
          <button className="vf-clear" onClick={() => { setSport(null); setDist("any"); onLocation(null); }}>
            <X size={12} /> Clear
          </button>
        )}
        <span className="vf-count">
          {locating ? "Finding you…" : `${count} ground${count !== 1 ? "s" : ""}`}
        </span>
      </div>

      <style>{`
        .vf { margin: 0 0 30px; display: flex; flex-direction: column; gap: 10px; }
        .vf-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .vf-lab {
          display: inline-flex; align-items: center; gap: 5px;
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.5; margin-right: 3px;
        }
        .vf-chip {
          border: 1px solid var(--line); background: transparent; color: inherit;
          border-radius: 999px; padding: 8px 15px; font-size: 12.5px; font-weight: 600;
          font-family: inherit; cursor: pointer;
          transition: border-color .2s, background .2s, color .2s, transform .2s;
          display: inline-flex; align-items: center; gap: 5px;
        }
        .vf-chip:hover { border-color: rgba(255,201,60,.5); transform: translateY(-1px); }
        .vf-chip.on { background: rgba(255,201,60,.14); border-color: rgba(255,201,60,.5); color: #FFC93C; }
        .vf-chip.sm { padding: 6px 12px; font-size: 12px; }
        .vf-clear {
          border: none; background: none; color: inherit; opacity: .55;
          font-size: 12px; cursor: pointer; font-family: inherit;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .vf-clear:hover { opacity: 1; }
        .vf-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; opacity: .5; }
      `}</style>
    </div>
  );
}
