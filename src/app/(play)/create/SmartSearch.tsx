"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Navigation, CornerDownLeft, Volleyball, Building2,
  Banknote, Minus, Plus, SlidersHorizontal,
} from "lucide-react";
import { SPORT_NAMES, sportColor } from "@/lib/sports";

export type Query = {
  text: string;
  sport: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  maxKm: number | null;
};

export const EMPTY: Query = { text: "", sport: null, minPrice: null, maxPrice: null, maxKm: null };

type Suggestion =
  | { kind: "sport"; label: string; value: string }
  | { kind: "price"; label: string; value: number }
  | { kind: "dist";  label: string; value: number }
  | { kind: "text";  label: string; value: string };

const PRICES = [1000, 1500, 2000, 3000];
const DISTS   = [2, 5, 10, 25];

/**
 * One field instead of four controls. It reads what you type — a sport, a
 * budget, a distance, a ground name — and turns each into a chip you can
 * drop. Nothing is hidden behind a menu.
 */
const STEP = 500;

/** −  value  +  — the whole control is two buttons and a number. */
function Stepper({
  label, value, placeholder, onChange,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  onChange: (n: number | null) => void;
}) {
  const bump = (d: number) => {
    const next = (value ?? 0) + d * STEP;
    onChange(next <= 0 ? null : next);
  };
  return (
    <div className="ss-step">
      <span className="ss-step-l">{label}</span>
      <div className="ss-step-box">
        <button onClick={() => bump(-1)} disabled={value == null} aria-label={`Lower ${label}`}>
          <Minus size={14} />
        </button>
        <span className={`ss-step-v ${value == null ? "ph" : ""}`}>
          {value == null ? placeholder : `Rs ${value.toLocaleString()}`}
        </span>
        <button onClick={() => bump(1)} aria-label={`Raise ${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function SmartSearch({
  value, onChange, venueNames, count, city,
}: {
  value: Query;
  onChange: (q: Query) => void;
  venueNames: string[];
  count: number;
  city?: string | null;
}) {
  const [raw, setRaw] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [showRange, setShowRange] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keyboard shortcut, like every tool people already use.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); inputRef.current?.focus(); setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = raw.trim().toLowerCase();
    const out: Suggestion[] = [];

    // a bare number is almost always a budget
    const num = q.match(/(\d{3,5})/)?.[1];

    if (!q) {
      for (const s of SPORT_NAMES.slice(0, 5)) out.push({ kind: "sport", label: s, value: s });
      out.push({ kind: "price", label: "Under Rs 2,000/hr", value: 2000 });
      out.push({ kind: "dist",  label: "Within 5 km",       value: 5 });
      return out;
    }

    for (const s of SPORT_NAMES) {
      if (s.toLowerCase().includes(q)) out.push({ kind: "sport", label: s, value: s });
    }
    if (num) {
      out.push({ kind: "price", label: `Under Rs ${Number(num).toLocaleString()}/hr`, value: Number(num) });
      if (Number(num) <= 50) out.push({ kind: "dist", label: `Within ${num} km`, value: Number(num) });
    }
    if ("under".startsWith(q) || "price".startsWith(q) || "cheap".includes(q)) {
      for (const p of PRICES) out.push({ kind: "price", label: `Under Rs ${p.toLocaleString()}/hr`, value: p });
    }
    if ("near".startsWith(q) || "close".startsWith(q) || "km".includes(q)) {
      for (const d of DISTS) out.push({ kind: "dist", label: `Within ${d} km`, value: d });
    }
    for (const n of venueNames) {
      if (n.toLowerCase().includes(q)) out.push({ kind: "text", label: n, value: n });
    }
    return out.slice(0, 8);
  }, [raw, venueNames]);

  function apply(s: Suggestion) {
    if (s.kind === "sport") onChange({ ...value, sport: s.value });
    if (s.kind === "price") { onChange({ ...value, maxPrice: s.value }); setShowRange(true); return; }
    if (s.kind === "dist")  onChange({ ...value, maxKm: s.value });
    if (s.kind === "text")  onChange({ ...value, text: s.value });
    setRaw(""); setCursor(0); setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(suggestions.length - 1, c + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[cursor]) apply(suggestions[cursor]);
      else if (raw.trim()) { onChange({ ...value, text: raw.trim() }); setRaw(""); setOpen(false); }
    }
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Backspace" && !raw) {
      // rubbing out the last chip, newest first
      if (value.maxKm)      onChange({ ...value, maxKm: null });
      else if (value.maxPrice != null || value.minPrice != null) onChange({ ...value, minPrice: null, maxPrice: null });
      else if (value.sport)    onChange({ ...value, sport: null });
      else if (value.text)     onChange({ ...value, text: "" });
    }
  }

  const chips = [
    value.sport    && { k: "sport", label: value.sport, color: sportColor(value.sport),
                        icon: <Volleyball size={12} />, clear: () => onChange({ ...value, sport: null }) },
    (value.minPrice != null || value.maxPrice != null) && {
      k: "price",
      label:
        value.minPrice != null && value.maxPrice != null
          ? `Rs ${value.minPrice.toLocaleString()}–${value.maxPrice.toLocaleString()}`
          : value.maxPrice != null
            ? `Under Rs ${value.maxPrice.toLocaleString()}`
            : `Over Rs ${value.minPrice!.toLocaleString()}`,
      color: "#A78BFA",
      icon: <Banknote size={12} />,
      clear: () => onChange({ ...value, minPrice: null, maxPrice: null }),
    },
    value.maxKm    && { k: "dist", label: `Within ${value.maxKm} km`, color: "#4ADE80",
                        icon: <Navigation size={12} />, clear: () => onChange({ ...value, maxKm: null }) },
    value.text     && { k: "text", label: `“${value.text}”`, color: "#60a5fa",
                        icon: <Building2 size={12} />, clear: () => onChange({ ...value, text: "" }) },
  ].filter(Boolean) as { k: string; label: string; color: string; icon: React.ReactNode; clear: () => void }[];

  return (
    <div className="ss" ref={wrapRef}>
      <div className={`ss-bar ${open ? "open" : ""}`}>
        <Search size={17} className="ss-mag" />

        {chips.map((c) => (
          <span key={c.k} className="ss-chip" style={{ ["--c" as string]: c.color }}>
            {c.icon}{c.label}
            <button onClick={c.clear} aria-label={`Remove ${c.label}`}><X size={11} /></button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setOpen(true); setCursor(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            chips.length
              ? "Add another…"
              : city ? `Try “futsal under 2000” in ${city}` : "Try “futsal under 2000”"
          }
          aria-label="Search grounds"
        />

        <span className="ss-count">{count} ground{count === 1 ? "" : "s"}</span>
        {chips.length > 0 && (
          <button className="ss-clear" onClick={() => { onChange(EMPTY); setRaw(""); }}>Clear</button>
        )}
        <kbd className="ss-kbd">⌘K</kbd>
      </div>

      {open && (
        <div className="ss-drop">
          <button
            className={`ss-opt ${showRange ? "on" : ""}`}
            onClick={() => setShowRange((v) => !v)}
          >
            <span className="ss-opt-ic" style={{ ["--c" as string]: "#A78BFA" }}>
              <SlidersHorizontal size={13} />
            </span>
            <span className="ss-opt-l">Price range</span>
            <span className="ss-opt-k">per hour</span>
          </button>

          {showRange && (
            <div className="ss-range">
              <Stepper
                label="From"
                value={value.minPrice}
                placeholder="Any"
                onChange={(n) => onChange({ ...value, minPrice: n })}
              />
              <span className="ss-range-dash">–</span>
              <Stepper
                label="To"
                value={value.maxPrice}
                placeholder="Any"
                onChange={(n) => onChange({ ...value, maxPrice: n })}
              />
            </div>
          )}

          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}-${s.label}`}
              className={`ss-opt ${i === cursor ? "on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => apply(s)}
            >
              <span className="ss-opt-ic" style={{
                ["--c" as string]: s.kind === "sport" ? sportColor(s.label)
                  : s.kind === "price" ? "#A78BFA" : s.kind === "dist" ? "#4ADE80" : "#60a5fa",
              }}>
                {s.kind === "sport" ? <Volleyball size={13} />
                  : s.kind === "price" ? <Banknote size={13} />
                  : s.kind === "dist" ? <Navigation size={13} /> : <Building2 size={13} />}
              </span>
              <span className="ss-opt-l">{s.label}</span>
              <span className="ss-opt-k">
                {s.kind === "sport" ? "sport" : s.kind === "price" ? "budget"
                  : s.kind === "dist" ? "distance" : "ground"}
              </span>
              {i === cursor && <CornerDownLeft size={12} className="ss-opt-e" />}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .ss { position:relative; margin-bottom:26px; }

        .ss-bar {
          display:flex; align-items:center; gap:8px; flex-wrap:wrap;
          padding:11px 14px; border-radius:16px;
          border:1px solid var(--line, rgba(242,237,230,.14));
          background:rgba(255,255,255,.04);
          transition:border-color .2s, box-shadow .25s, background .2s;
        }
        [data-theme="paper"] .ss-bar { background:#fff; border-color:rgba(20,23,30,.12); }
        .ss-bar.open {
          border-color:rgba(167,139,250,.6);
          box-shadow:0 0 0 4px rgba(167,139,250,.13);
        }
        .ss-mag { opacity:.45; flex-shrink:0; }

        .ss-bar input {
          flex:1; min-width:150px; border:none; background:transparent; color:inherit;
          font-family:inherit; font-size:14.5px; outline:none; padding:3px 0;
        }
        .ss-bar input::placeholder { opacity:.4; }

        .ss-chip {
          display:inline-flex; align-items:center; gap:5px;
          padding:5px 8px 5px 10px; border-radius:9px; font-size:12.5px; font-weight:700;
          color:var(--c); background:color-mix(in srgb, var(--c) 15%, transparent);
          border:1px solid color-mix(in srgb, var(--c) 45%, transparent);
        }
        .ss-chip button {
          display:inline-flex; border:none; background:none; color:inherit;
          cursor:pointer; padding:0 0 0 2px; opacity:.65;
        }
        .ss-chip button:hover { opacity:1; }

        .ss-count {
          margin-left:auto; font-family:'JetBrains Mono',monospace;
          font-size:11.5px; opacity:.5; white-space:nowrap;
        }
        .ss-clear {
          border:none; background:none; color:inherit; cursor:pointer;
          font-size:12px; font-weight:700; opacity:.55; font-family:inherit;
        }
        .ss-clear:hover { opacity:1; }
        .ss-kbd {
          font-family:'JetBrains Mono',monospace; font-size:10.5px; opacity:.35;
          border:1px solid currentColor; border-radius:6px; padding:2px 5px;
        }

        .ss-drop {
          position:absolute; top:calc(100% + 8px); left:0; right:0; z-index:70;
          border-radius:16px; padding:6px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
          box-shadow:0 26px 60px -22px rgba(0,0,0,.9);
        }
        [data-theme="paper"] .ss-drop { background:#fff; border-color:rgba(20,23,30,.12); }

        .ss-opt {
          width:100%; display:flex; align-items:center; gap:11px;
          padding:9px 11px; border-radius:11px; cursor:pointer;
          border:none; background:none; color:inherit; font-family:inherit; text-align:left;
        }
        .ss-opt.on { background:rgba(167,139,250,.13); }
        .ss-opt-ic {
          width:28px; height:28px; border-radius:8px; flex-shrink:0;
          display:inline-flex; align-items:center; justify-content:center;
          color:var(--c); background:color-mix(in srgb, var(--c) 16%, transparent);
        }
        .ss-opt-l { flex:1; font-size:13.5px; font-weight:600; }
        .ss-opt-k {
          font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; opacity:.35;
        }
        .ss-opt-e { opacity:.4; }

        .ss-range {
          display:flex; align-items:flex-end; gap:10px;
          padding:12px 11px 14px; margin:2px 0 6px;
          border-radius:12px; background:rgba(167,139,250,.07);
          border:1px solid rgba(167,139,250,.2);
        }
        .ss-range-dash { padding-bottom:11px; opacity:.4; font-weight:700; }
        .ss-step { flex:1; }
        .ss-step-l {
          display:block; font-size:10px; font-weight:800; letter-spacing:.12em;
          text-transform:uppercase; opacity:.45; margin-bottom:6px;
        }
        .ss-step-box {
          display:flex; align-items:center; justify-content:space-between; gap:4px;
          border:1px solid var(--line, rgba(242,237,230,.16)); border-radius:11px;
          padding:4px; background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .ss-step-box { background:#fff; border-color:rgba(20,23,30,.14); }
        .ss-step-box button {
          width:28px; height:28px; flex-shrink:0; border-radius:8px; cursor:pointer;
          display:inline-flex; align-items:center; justify-content:center;
          border:none; background:transparent; color:#A78BFA;
          transition:background .18s;
        }
        .ss-step-box button:hover:not(:disabled) { background:rgba(167,139,250,.16); }
        .ss-step-box button:disabled { opacity:.25; cursor:not-allowed; }
        .ss-step-v {
          flex:1; text-align:center; font-family:'JetBrains Mono',monospace;
          font-size:13px; font-weight:700; white-space:nowrap;
        }
        .ss-step-v.ph { opacity:.35; font-weight:500; }

        @media (max-width:620px) {
          .ss-kbd, .ss-count { display:none; }
          .ss-bar { padding:10px 12px; }
        }
      `}</style>
    </div>
  );
}
