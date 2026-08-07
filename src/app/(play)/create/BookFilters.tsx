"use client";

import { useEffect, useRef, useState } from "react";
import {
  SlidersHorizontal, X, Banknote, Navigation, Building2, Volleyball,
  ChevronDown, Search, Minus, Plus,
} from "lucide-react";
import LocationPicker from "@/components/shared/LocationPicker";

export type BookQuery = {
  text: string;
  sport: string | null;
  venueType: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  maxKm: number | null;
};

export const NO_BOOK_FILTERS: BookQuery = {
  text: "", sport: null, venueType: null, minPrice: null, maxPrice: null, maxKm: null,
};

export function bookActiveCount(q: BookQuery): number {
  return [q.venueType, q.minPrice != null || q.maxPrice != null, q.maxKm, q.text].filter(Boolean).length;
}

const DISTS = [2, 5, 10, 25];
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
    <div className="bf-step">
      <span className="bf-step-l">{label}</span>
      <div className="bf-step-box">
        <button onClick={() => bump(-1)} disabled={value == null} aria-label={`Lower ${label}`}>
          <Minus size={14} />
        </button>
        <span className={`bf-step-v ${value == null ? "ph" : ""}`}>
          {value == null ? placeholder : `Rs ${value.toLocaleString()}`}
        </span>
        <button onClick={() => bump(1)} aria-label={`Raise ${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Booking a court is a different question from finding a game — no skill
 * level, no "still open", just what sport, what kind of ground, and what
 * it costs. Same bar shape as Play so switching between the two feels
 * like the same app, but the panel underneath asks about the ground.
 */
export default function BookFilters({
  sport, setSport, sports, venueTypes, value, onChange, count, onNeedLocation,
}: {
  sport: string | null;
  setSport: (s: string | null) => void;
  sports: string[];
  venueTypes: string[];
  value: BookQuery;
  onChange: (q: BookQuery) => void;
  count: number;
  onNeedLocation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sportOpen, setSportOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const n = bookActiveCount(value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false); setSportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
      <div className="bf-g">
        <p className="bf-gt">{icon}{title}</p>
        <div className="bf-go">{children}</div>
      </div>
    );
  }

  const chips = [
    value.venueType && { k: "type", label: value.venueType, on: () => onChange({ ...value, venueType: null }) },
    (value.minPrice != null || value.maxPrice != null) && {
      k: "price",
      label:
        value.minPrice != null && value.maxPrice != null
          ? `Rs ${value.minPrice.toLocaleString()}–${value.maxPrice.toLocaleString()}`
          : value.maxPrice != null
            ? `Under Rs ${value.maxPrice.toLocaleString()}`
            : `Over Rs ${value.minPrice!.toLocaleString()}`,
      on: () => onChange({ ...value, minPrice: null, maxPrice: null }),
    },
    value.maxKm && { k: "dist", label: `Within ${value.maxKm} km`, on: () => onChange({ ...value, maxKm: null }) },
    value.text && { k: "text", label: `"${value.text}"`, on: () => onChange({ ...value, text: "" }) },
  ].filter(Boolean) as { k: string; label: string; on: () => void }[];

  return (
    <div className="bf" ref={boxRef}>
      {/* Sport · Area · Filters · Find — same shape as the Play bar. */}
      <div className="bf-search">
        <div className="bf-seg sport">
          <button onClick={() => { setSportOpen((v) => !v); setOpen(false); }}>
            <Volleyball size={15} />
            <span>{sport ?? "Any sport"}</span>
            <ChevronDown size={14} className={sportOpen ? "flip" : ""} />
          </button>
          {sportOpen && (
            <div className="bf-drop">
              <button className={!sport ? "on" : ""} onClick={() => { setSport(null); setSportOpen(false); }}>
                Any sport
              </button>
              {sports.map((sp) => (
                <button key={sp} className={sport === sp ? "on" : ""}
                  onClick={() => { setSport(sp); setSportOpen(false); }}>
                  {sp}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bf-seg area">
          <LocationPicker />
        </div>

        <div className="bf-seg">
          <button onClick={() => { setOpen((v) => !v); setSportOpen(false); }}
            className={n ? "lit" : ""}>
            <SlidersHorizontal size={15} />
            <span>Filters{n ? ` · ${n}` : ""}</span>
          </button>
        </div>

        <button className="bf-find" onClick={() => { setOpen(false); setSportOpen(false); }}>
          <Search size={15} />
          {count} ground{count === 1 ? "" : "s"}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="bf-chips">
          {chips.map((c) => (
            <button key={c.k} className="bf-chip" onClick={c.on}>
              {c.label} <X size={11} />
            </button>
          ))}
          <button className="bf-clear" onClick={() => onChange(NO_BOOK_FILTERS)}>Clear all</button>
        </div>
      )}

      {open && (
        <div className="bf-panel">
          <div className="bf-searchrow">
            <Search size={14} />
            <input
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              placeholder="Search by ground name…"
              aria-label="Search by ground name"
            />
          </div>

          {venueTypes.length > 0 && (
            <Group icon={<Building2 size={13} />} title="Ground type">
              {venueTypes.map((t) => (
                <button key={t} className={value.venueType === t ? "on" : ""}
                  onClick={() => onChange({ ...value, venueType: value.venueType === t ? null : t })}>
                  {t}
                </button>
              ))}
            </Group>
          )}

          <div className="bf-g">
            <p className="bf-gt"><Banknote size={13} />Price per hour</p>
            <div className="bf-range">
              <Stepper label="From" value={value.minPrice} placeholder="Any"
                onChange={(v) => onChange({ ...value, minPrice: v })} />
              <span className="bf-range-dash">–</span>
              <Stepper label="To" value={value.maxPrice} placeholder="Any"
                onChange={(v) => onChange({ ...value, maxPrice: v })} />
            </div>
          </div>

          <Group icon={<Navigation size={13} />} title="Distance">
            {DISTS.map((d) => (
              <button key={d} className={value.maxKm === d ? "on" : ""}
                onClick={() => { onChange({ ...value, maxKm: value.maxKm === d ? null : d }); onNeedLocation(); }}>
                Within {d} km
              </button>
            ))}
          </Group>
        </div>
      )}

      <style>{`
        .bf { margin-bottom: 20px; position: relative; }

        .bf-search {
          display:flex; align-items:stretch; gap:0;
          border:1px solid var(--line, rgba(242,237,230,.14));
          border-radius:16px; overflow:visible;
          background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .bf-search { background:#fff; border-color:rgba(20,23,30,.12); }

        .bf-seg { position:relative; flex:1; min-width:0; display:flex; }
        .bf-seg + .bf-seg { border-left:1px solid var(--line, rgba(242,237,230,.1)); }
        .bf-seg > button {
          flex:1; display:flex; align-items:center; gap:9px; min-width:0;
          padding:14px 16px; border:none; background:none; color:inherit;
          font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
          text-align:left;
        }
        .bf-seg > button:hover { background:rgba(0,98,65,.07); }
        .bf-seg > button.lit { color:#006241; }
        .bf-seg > button svg:first-child { opacity:.55; flex-shrink:0; }
        .bf-seg > button span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bf-seg > button svg:last-child { opacity:.45; transition:transform .25s; }
        .bf-seg > button svg.flip { transform:rotate(180deg); }

        .bf-find {
          display:inline-flex; align-items:center; gap:7px; flex-shrink:0;
          padding:0 22px; margin:5px; border:none; border-radius:12px; cursor:pointer;
          font-family:inherit; font-size:13.5px; font-weight:800; white-space:nowrap;
          background:linear-gradient(140deg,#3d8a68,#006241 55%,#004a31);
          color:#14171E;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 8px 20px -8px rgba(0,98,65,.8);
          transition:transform .16s;
        }
        .bf-find:hover { transform:translateY(-1px); }

        .bf-drop {
          position:absolute; top:calc(100% + 8px); left:0; z-index:70;
          min-width:210px; max-height:300px; overflow-y:auto;
          border-radius:14px; padding:6px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
          box-shadow:0 24px 56px -20px rgba(0,0,0,.85);
        }
        [data-theme="paper"] .bf-drop { background:#fff; border-color:rgba(20,23,30,.12); }
        .bf-drop button {
          width:100%; text-align:left; padding:9px 12px; border-radius:10px;
          border:none; background:none; color:inherit; cursor:pointer;
          font-family:inherit; font-size:13.5px; font-weight:600;
        }
        .bf-drop button:hover { background:rgba(0,98,65,.12); }
        .bf-drop button.on { color:#006241; background:rgba(0,98,65,.14); }

        @media (max-width:820px) {
          .bf-search { flex-wrap:wrap; }
          .bf-seg { flex:1 1 45%; }
          .bf-find { flex:1 1 100%; justify-content:center; padding:13px; }
        }

        .bf-chips { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:10px; }
        .bf-chip {
          display:inline-flex; align-items:center; gap:6px; cursor:pointer;
          padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700;
          font-family:inherit; color:#006241;
          background:rgba(0,98,65,.14); border:1px solid rgba(0,98,65,.42);
        }
        .bf-chip:hover { background:rgba(0,98,65,.24); }
        .bf-clear {
          border:none; background:none; color:inherit; cursor:pointer;
          font-size:12px; font-weight:700; opacity:.5; font-family:inherit;
        }
        .bf-clear:hover { opacity:1; }

        .bf-panel {
          margin-top:12px; padding:18px; border-radius:18px;
          background:rgba(255,255,255,.035);
          border:1px solid var(--line, rgba(242,237,230,.12));
          display:flex; flex-direction:column; gap:18px;
        }
        [data-theme="paper"] .bf-panel { background:rgba(20,23,30,.03); }

        .bf-searchrow {
          display:flex; align-items:center; gap:9px;
          padding:11px 13px; border-radius:12px;
          border:1px solid var(--line, rgba(242,237,230,.14));
          background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .bf-searchrow { background:#fff; border-color:rgba(20,23,30,.12); }
        .bf-searchrow svg { opacity:.45; flex-shrink:0; }
        .bf-searchrow input {
          flex:1; min-width:0; border:none; background:transparent; color:inherit;
          font-family:inherit; font-size:14px; outline:none;
        }
        .bf-searchrow input::placeholder { opacity:.4; }

        .bf-gt {
          display:flex; align-items:center; gap:7px; margin:0 0 9px;
          font-size:11px; font-weight:800; letter-spacing:.1em;
          text-transform:uppercase; opacity:.5;
        }
        .bf-go { display:flex; gap:7px; flex-wrap:wrap; }
        .bf-go button {
          padding:8px 14px; border-radius:999px; cursor:pointer;
          border:1px solid var(--line, rgba(242,237,230,.14)); background:transparent;
          color:inherit; font-size:12.5px; font-weight:600; font-family:inherit;
          transition:border-color .2s, background .2s, color .2s;
        }
        .bf-go button:hover { border-color:rgba(0,98,65,.5); background:rgba(212,233,226,.4); }
        .bf-go button.on {
          background:#d4e9e2; border-color:#006241; color:#1e3932;
        }

        .bf-range {
          display:flex; align-items:flex-end; gap:10px;
          padding:12px 11px 14px; margin-top:2px;
          border-radius:12px; background:rgba(0,98,65,.07);
          border:1px solid rgba(0,98,65,.2);
        }
        .bf-range-dash { padding-bottom:11px; opacity:.4; font-weight:700; }
        .bf-step { flex:1; }
        .bf-step-l {
          display:block; font-size:10px; font-weight:800; letter-spacing:.12em;
          text-transform:uppercase; opacity:.45; margin-bottom:6px;
        }
        .bf-step-box {
          display:flex; align-items:center; justify-content:space-between; gap:4px;
          border:1px solid var(--line, rgba(242,237,230,.16)); border-radius:11px;
          padding:4px; background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .bf-step-box { background:#fff; border-color:rgba(20,23,30,.14); }
        .bf-step-box button {
          width:28px; height:28px; flex-shrink:0; border-radius:8px; cursor:pointer;
          display:inline-flex; align-items:center; justify-content:center;
          border:none; background:transparent; color:#006241;
          transition:background .18s;
        }
        .bf-step-box button:hover:not(:disabled) { background:rgba(0,98,65,.16); }
        .bf-step-box button:disabled { opacity:.25; cursor:not-allowed; }
        .bf-step-v {
          flex:1; text-align:center; font-family:'JetBrains Mono',monospace;
          font-size:13px; font-weight:700; white-space:nowrap;
        }
        .bf-step-v.ph { opacity:.35; font-weight:500; }

        @media (max-width:620px) {
          .bf-find { font-size: 13px; }
        }
      `}</style>
    </div>
  );
}
