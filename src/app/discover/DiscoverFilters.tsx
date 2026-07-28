"use client";

import { useState, useEffect } from "react";
import { Clock, MapPin, Wallet, Users, Gauge, X, SlidersHorizontal } from "lucide-react";

export type TimeFilter = "any" | "today" | "tomorrow" | "week";
export type PriceFilter = "any" | "free" | "under300" | "under600";
export type SpotsFilter = "any" | "open" | "almost";
export type DistFilter = "any" | "2" | "5" | "10";
export type SkillFilter = "any" | "beginner" | "intermediate" | "advanced";

export interface Filters {
  time: TimeFilter;
  price: PriceFilter;
  spots: SpotsFilter;
  dist: DistFilter;
  skill: SkillFilter;
}

export const DEFAULT_FILTERS: Filters = { time: "any", price: "any", spots: "any", dist: "any", skill: "any" };

// Haversine — straight-line km between two lat/lng points.
export function kmBetween(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180, la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const TIME_OPTS: { k: TimeFilter; label: string }[] = [
  { k: "any", label: "Any time" },
  { k: "today", label: "Tonight" },
  { k: "tomorrow", label: "Tomorrow" },
  { k: "week", label: "This week" },
];
const PRICE_OPTS: { k: PriceFilter; label: string }[] = [
  { k: "any", label: "Any price" },
  { k: "free", label: "Free" },
  { k: "under300", label: "Under Rs 300" },
  { k: "under600", label: "Under Rs 600" },
];
const SPOTS_OPTS: { k: SpotsFilter; label: string }[] = [
  { k: "any", label: "Any" },
  { k: "open", label: "Has spots" },
  { k: "almost", label: "Almost full" },
];
const SKILL_OPTS: { k: SkillFilter; label: string }[] = [
  { k: "any", label: "Any level" },
  { k: "beginner", label: "Beginner friendly" },
  { k: "intermediate", label: "Intermediate" },
  { k: "advanced", label: "Advanced" },
];
const DIST_OPTS: { k: DistFilter; label: string }[] = [
  { k: "any", label: "Anywhere" },
  { k: "2", label: "Within 2 km" },
  { k: "5", label: "Within 5 km" },
  { k: "10", label: "Within 10 km" },
];

export default function DiscoverFilters({
  filters, setFilters, onLocation, hasLocation, resultCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  onLocation: (coords: [number, number] | null) => void;
  hasLocation: boolean;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  // Ask for location only when a distance filter is picked.
  useEffect(() => {
    if (filters.dist !== "any" && !hasLocation && !locating) {
      setLocating(true);
      navigator.geolocation?.getCurrentPosition(
        (pos) => { onLocation([pos.coords.latitude, pos.coords.longitude]); setLocating(false); },
        () => { setLocating(false); setFilters({ ...filters, dist: "any" }); },
        { timeout: 8000 }
      );
    }
  }, [filters, hasLocation, locating, onLocation, setFilters]);

  const active = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== "any").length;

  // Human-readable summary of what's currently applied, each removable.
  const labelFor = (k: keyof Filters): string => {
    const find = (opts: { k: string; label: string }[], v: string) => opts.find((o) => o.k === v)?.label ?? v;
    if (k === "time") return find(TIME_OPTS, filters.time);
    if (k === "dist") return find(DIST_OPTS, filters.dist);
    if (k === "price") return find(PRICE_OPTS, filters.price);
    if (k === "spots") return find(SPOTS_OPTS, filters.spots);
    return find(SKILL_OPTS, filters.skill);
  };
  const activeKeys = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] !== "any");

  return (
    <div className="df">
      <div className="df-bar">
        <button className={`df-toggle ${active > 0 ? "on" : ""}`} onClick={() => setOpen((v) => !v)}>
          <SlidersHorizontal size={14} />
          Filters{active > 0 ? ` · ${active}` : ""}
        </button>

        {/* quick chips — the two people use most */}
        <QuickChip label="Tonight" icon={<Clock size={12} />}
          on={filters.time === "today"}
          onClick={() => setFilters({ ...filters, time: filters.time === "today" ? "any" : "today" })} />
        <QuickChip label="Near me" icon={<MapPin size={12} />}
          on={filters.dist !== "any"}
          onClick={() => setFilters({ ...filters, dist: filters.dist === "any" ? "5" : "any" })} />
        <QuickChip label="Has spots" icon={<Users size={12} />}
          on={filters.spots === "open"}
          onClick={() => setFilters({ ...filters, spots: filters.spots === "open" ? "any" : "open" })} />

        <span className="df-count">
          {locating ? "Finding you…" : `${resultCount} game${resultCount !== 1 ? "s" : ""}`}
        </span>

        {active > 0 && (
          <button className="df-clear" onClick={() => { setFilters(DEFAULT_FILTERS); onLocation(null); }}>
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Active filters — visible and individually removable */}
      {activeKeys.length > 0 && (
        <div className="df-active">
          {activeKeys.map((k) => (
            <button key={k} className="df-pill"
              onClick={() => {
                setFilters({ ...filters, [k]: "any" });
                if (k === "dist") onLocation(null);
              }}
              aria-label={`Remove ${labelFor(k)} filter`}>
              {labelFor(k)} <X size={11} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="df-panel">
          <Group icon={<Clock size={13} />} title="When" opts={TIME_OPTS}
            value={filters.time} onPick={(k) => setFilters({ ...filters, time: k as TimeFilter })} />
          <Group icon={<MapPin size={13} />} title="Distance" opts={DIST_OPTS}
            value={filters.dist} onPick={(k) => setFilters({ ...filters, dist: k as DistFilter })} />
          <Group icon={<Wallet size={13} />} title="Price" opts={PRICE_OPTS}
            value={filters.price} onPick={(k) => setFilters({ ...filters, price: k as PriceFilter })} />
          <Group icon={<Users size={13} />} title="Spots" opts={SPOTS_OPTS}
            value={filters.spots} onPick={(k) => setFilters({ ...filters, spots: k as SpotsFilter })} />
          <Group icon={<Gauge size={13} />} title="Level" opts={SKILL_OPTS}
            value={filters.skill} onPick={(k) => setFilters({ ...filters, skill: k as SkillFilter })} />
        </div>
      )}

      <style>{`
        .df { margin-bottom: 18px; }
        .df-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .df-toggle, .df-chip, .df-clear {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--line, rgba(242,237,230,0.14));
          background: transparent; color: inherit; border-radius: 999px;
          padding: 8px 14px; font-size: 12.5px; font-weight: 600;
          font-family: inherit; cursor: pointer;
          transition: border-color 0.2s, background 0.2s, color 0.2s;
        }
        .df-toggle:hover, .df-chip:hover { border-color: rgba(255,201,60,0.5); }
        .df-toggle.on, .df-chip.on {
          background: rgba(255,201,60,0.14); border-color: rgba(255,201,60,0.45); color: #FFC93C;
        }
        .df-count {
          margin-left: auto; font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px; opacity: 0.55;
        }
        .df-clear { border: none; opacity: 0.6; padding: 8px 8px; }

        .df-active { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
        .df-pill {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid rgba(222,49,99,0.45); background: rgba(222,49,99,0.14);
          color: #DE3163; border-radius: 999px; padding: 6px 12px;
          font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer;
          transition: background .18s, border-color .18s;
        }
        .df-pill:hover { background: rgba(222,49,99,0.24); border-color: rgba(222,49,99,0.7); }
        .df-clear:hover { opacity: 1; }
        .df-panel {
          margin-top: 12px; padding: 16px; border-radius: 14px;
          border: 1px solid var(--line, rgba(242,237,230,0.12));
          background: rgba(255,255,255,0.02);
          display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 18px;
        }
        [data-theme="paper"] .df-panel { background: rgba(20,23,30,0.03); }
        .df-group-t {
          display: flex; align-items: center; gap: 6px;
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.5; margin-bottom: 9px;
        }
        .df-opts { display: flex; flex-wrap: wrap; gap: 6px; }
        @media (max-width: 640px) {
          .df-count { width: 100%; margin-left: 0; order: 99; }
        }
      `}</style>
    </div>
  );
}

function QuickChip({ label, icon, on, onClick }: { label: string; icon: React.ReactNode; on: boolean; onClick: () => void }) {
  return <button className={`df-chip ${on ? "on" : ""}`} onClick={onClick}>{icon}{label}</button>;
}

function Group({
  icon, title, opts, value, onPick,
}: {
  icon: React.ReactNode; title: string;
  opts: { k: string; label: string }[]; value: string; onPick: (k: string) => void;
}) {
  return (
    <div>
      <div className="df-group-t">{icon}{title}</div>
      <div className="df-opts">
        {opts.map((o) => (
          <button key={o.k} className={`df-chip ${value === o.k ? "on" : ""}`}
            style={{ padding: "6px 11px", fontSize: 12 }}
            onClick={() => onPick(o.k)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
