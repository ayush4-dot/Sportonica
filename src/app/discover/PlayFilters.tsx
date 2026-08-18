"use client";

import { useEffect, useRef, useState } from "react";
import {
  SlidersHorizontal, X, Clock, Banknote, Navigation, Trophy, Volleyball, Check,
  ChevronDown, Search, Minus, Plus,
} from "lucide-react";
import {
  formatsFor, SKILLS, FEES, DISTANCES, activeCount,
  type PlayQuery, NO_FILTERS,
} from "@/lib/playFilters";
import { TIME_MIN, TIME_MAX, TIME_STEP, timeLabel } from "@/lib/timeOfDay";
import LocationPicker from "@/components/shared/LocationPicker";

/**
 * Finding a game is a different question from booking a court, so this
 * asks about the game and the people: what format, what level, when,
 * how much, and can I still get in.
 */
export default function PlayFilters({
  sport, setSport, sports, value, onChange, count, onNeedLocation,
}: {
  sport: string | null;
  setSport: (s: string | null) => void;
  sports: string[];
  value: PlayQuery;
  onChange: (q: PlayQuery) => void;
  count: number;
  onNeedLocation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sportOpen, setSportOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const formats = formatsFor(sport);
  const n = activeCount(value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false); setSportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // A format from another sport makes no sense — drop it on switch.
  useEffect(() => {
    if (value.format && !formats.some((f) => f.key === value.format)) {
      onChange({ ...value, format: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const set = <K extends keyof PlayQuery>(k: K, v: PlayQuery[K]) =>
    onChange({ ...value, [k]: value[k] === v ? (typeof v === "boolean" ? false : null) as PlayQuery[K] : v });

  function bumpTime(d: 1 | -1) {
    const cur = value.time;
    if (cur == null) {
      if (d > 0) onChange({ ...value, time: TIME_MIN });
      return;
    }
    const next = cur + d * TIME_STEP;
    if (next < TIME_MIN) onChange({ ...value, time: null });
    else if (next > TIME_MAX) return;
    else onChange({ ...value, time: next });
  }

  const chips = [
    value.format && { k: "format", label: formats.find((f) => f.key === value.format)?.label ?? "", on: () => set("format", null) },
    value.skill  && { k: "skill",  label: SKILLS.find((s) => s.key === value.skill)?.label ?? "",  on: () => set("skill", null) },
    value.fee    && { k: "fee",    label: FEES.find((f) => f.key === value.fee)?.label ?? "",      on: () => set("fee", null) },
    value.dist   && { k: "dist",   label: DISTANCES.find((d) => d.key === value.dist)?.label ?? "", on: () => set("dist", null) },
    value.openOnly && { k: "open", label: "Has spots", on: () => onChange({ ...value, openOnly: false }) },
  ].filter(Boolean) as { k: string; label: string; on: () => void }[];

  function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
      <div className="pf-g">
        <p className="pf-gt">{icon}{title}</p>
        <div className="pf-go">{children}</div>
      </div>
    );
  }

  return (
    <div className="pf" ref={boxRef}>
      {/* Sport · Area · Filters · Find — one row, in the order people think. */}
      <div className="pf-search">
        <div className="pf-seg sport">
          <button onClick={() => { setSportOpen((v) => !v); setOpen(false); }}>
            <Volleyball size={15} />
            <span>{sport ?? "Any sport"}</span>
            <ChevronDown size={14} className={sportOpen ? "flip" : ""} />
          </button>
          {sportOpen && (
            <div className="pf-drop">
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

        <div className="pf-seg area">
          <LocationPicker />
        </div>

        <div className="pf-seg time">
          <div className="pf-time">
            <Clock size={15} className="pf-time-icon" />
            <div className="pf-step-box">
              <button onClick={() => bumpTime(-1)} disabled={value.time == null} aria-label="Earlier time">
                <Minus size={13} />
              </button>
              <span className={`pf-step-v ${value.time == null ? "ph" : ""}`}>
                {value.time == null ? "Any time" : timeLabel(value.time)}
              </span>
              <button onClick={() => bumpTime(1)} disabled={value.time != null && value.time >= TIME_MAX} aria-label="Later time">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="pf-seg">
          <button onClick={() => { setOpen((v) => !v); setSportOpen(false); }}
            className={n ? "lit" : ""}>
            <SlidersHorizontal size={15} />
            <span>Filters{n ? ` · ${n}` : ""}</span>
          </button>
        </div>

        <button className="pf-find" onClick={() => { setOpen(false); setSportOpen(false); }}>
          <Search size={15} />
          {count} game{count === 1 ? "" : "s"}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="pf-chips">
          {chips.map((c) => (
            <button key={c.k} className="pf-chip" onClick={c.on}>
              {c.label} <X size={11} />
            </button>
          ))}
          <button className="pf-clear" onClick={() => onChange(NO_FILTERS)}>Clear all</button>
        </div>
      )}

      {open && <div className="pf-backdrop" onClick={() => setOpen(false)} />}

      {open && (
        <div className="pf-panel">
          {formats.length > 0 && (
            <Group icon={<Volleyball size={13} />} title={`${sport} format`}>
              {formats.map((f) => (
                <button key={f.key} className={value.format === f.key ? "on" : ""}
                  onClick={() => set("format", f.key)}>{f.label}</button>
              ))}
            </Group>
          )}

          <Group icon={<Trophy size={13} />} title="Skill level">
            {SKILLS.map((s) => (
              <button key={s.key} className={value.skill === s.key ? "on" : ""}
                onClick={() => set("skill", s.key)}>{s.label}</button>
            ))}
          </Group>

          <Group icon={<Banknote size={13} />} title="Cost per player">
            {FEES.map((f) => (
              <button key={f.key} className={value.fee === f.key ? "on" : ""}
                onClick={() => set("fee", f.key)}>{f.label}</button>
            ))}
          </Group>

          <Group icon={<Navigation size={13} />} title="Distance">
            {DISTANCES.map((d) => (
              <button key={d.key} className={value.dist === d.key ? "on" : ""}
                onClick={() => { set("dist", d.key); onNeedLocation(); }}>{d.label}</button>
            ))}
          </Group>

          <label className="pf-check">
            <input type="checkbox" checked={value.openOnly}
              onChange={(e) => onChange({ ...value, openOnly: e.target.checked })} />
            <span className="pf-box">{value.openOnly && <Check size={12} />}</span>
            <span>Only games I can still join</span>
          </label>
        </div>
      )}

      <style>{`
        .pf { margin-bottom: 20px; position: relative; }

        .pf-search {
          display:flex; align-items:stretch; gap:0;
          border:1px solid var(--line, rgba(242,237,230,.14));
          border-radius:16px; overflow:visible;
          background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .pf-search { background:#fff; border-color:rgba(20,23,30,.12); }

        .pf-seg { position:relative; flex:1; min-width:0; display:flex; }
        .pf-seg + .pf-seg { border-left:1px solid var(--line, rgba(242,237,230,.1)); }
        .pf-seg > button {
          flex:1; display:flex; align-items:center; gap:9px; min-width:0;
          padding:14px 16px; border:none; background:none; color:inherit;
          font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
          text-align:left;
        }
        .pf-seg > button:hover { background:rgba(0,98,65,.07); }
        .pf-seg > button.lit { color:#006241; }
        .pf-seg > button svg:first-child { opacity:.55; flex-shrink:0; }
        .pf-seg > button span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pf-seg > button svg:last-child { opacity:.45; transition:transform .25s; }
        .pf-seg > button svg.flip { transform:rotate(180deg); }

        .pf-time { flex:1; min-width:0; display:flex; align-items:center; gap:9px; padding:8px 14px; }
        .pf-time-icon { opacity:.55; flex-shrink:0; }
        .pf-time .pf-step-box { flex:1; min-width:0; background:transparent; border:none; padding:0; }
        [data-theme="paper"] .pf-time .pf-step-box { background:transparent; }
        .pf-step-box {
          display:flex; align-items:center; justify-content:space-between; gap:4px;
          border:1px solid var(--line, rgba(242,237,230,.16)); border-radius:11px;
          padding:4px; background:rgba(255,255,255,.04);
        }
        .pf-step-box button {
          width:28px; height:28px; flex-shrink:0; border-radius:8px; cursor:pointer;
          display:inline-flex; align-items:center; justify-content:center;
          border:none; background:transparent; color:#006241;
          transition:background .18s;
        }
        .pf-step-box button:hover:not(:disabled) { background:rgba(0,98,65,.16); }
        .pf-step-box button:disabled { opacity:.25; cursor:not-allowed; }
        .pf-step-v {
          flex:1; text-align:center; font-family:'Inter',sans-serif;
          font-size:13px; font-weight:700; white-space:nowrap;
        }
        .pf-step-v.ph { opacity:.35; font-weight:500; }

        .pf-find {
          display:inline-flex; align-items:center; gap:7px; flex-shrink:0;
          padding:0 22px; margin:5px; border:none; border-radius:12px; cursor:pointer;
          font-family:inherit; font-size:13.5px; font-weight:800; white-space:nowrap;
          background:linear-gradient(140deg,#3d8a68,#006241 55%,#004a31);
          color:#ffffff;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 8px 20px -8px rgba(0,98,65,.8);
          transition:transform .16s;
        }
        .pf-find:hover { transform:translateY(-1px); }

        .pf-drop {
          position:absolute; top:calc(100% + 8px); left:0; z-index:70;
          min-width:210px; max-height:300px; overflow-y:auto;
          border-radius:14px; padding:6px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
          box-shadow:0 24px 56px -20px rgba(0,0,0,.85);
        }
        [data-theme="paper"] .pf-drop { background:#fff; border-color:rgba(20,23,30,.12); }
        .pf-drop button {
          width:100%; text-align:left; padding:9px 12px; border-radius:10px;
          border:none; background:none; color:inherit; cursor:pointer;
          font-family:inherit; font-size:13.5px; font-weight:600;
        }
        .pf-drop button:hover { background:rgba(0,98,65,.12); }
        .pf-drop button.on { color:#006241; background:rgba(0,98,65,.14); }

        @media (max-width:820px) {
          .pf-search { flex-wrap:wrap; }
          .pf-seg { flex:1 1 45%; }
          .pf-find { flex:1 1 100%; justify-content:center; padding:14px; min-height:44px; }
        }

        .pf-btn, .pf-quick {
          display:inline-flex; align-items:center; gap:6px; cursor:pointer;
          border:1px solid var(--line, rgba(242,237,230,.14)); background:transparent;
          color:inherit; border-radius:999px; padding:8px 14px;
          font-size:12.5px; font-weight:700; font-family:inherit;
          transition:border-color .2s, background .2s, color .2s;
        }
        .pf-btn:hover, .pf-quick:hover { border-color:rgba(0,98,65,.55); }
        .pf-btn.on, .pf-quick.on {
          background:rgba(0,98,65,.15); border-color:rgba(0,98,65,.55); color:#006241;
        }
        .pf-count {
          margin-left:auto; font-family:'Inter',sans-serif;
          font-size:11.5px; opacity:.55; white-space:nowrap;
        }
        .pf-count em { font-style:normal; opacity:.7; }

        .pf-chips { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:10px; }
        .pf-chip {
          display:inline-flex; align-items:center; gap:6px; cursor:pointer;
          padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700;
          font-family:inherit; color:#006241;
          background:rgba(0,98,65,.14); border:1px solid rgba(0,98,65,.42);
        }
        .pf-chip:hover { background:rgba(0,98,65,.24); }
        .pf-clear {
          border:none; background:none; color:inherit; cursor:pointer;
          font-size:12px; font-weight:700; opacity:.5; font-family:inherit;
        }
        .pf-clear:hover { opacity:1; }

        .pf-panel {
          margin-top:12px; padding:18px; border-radius:18px;
          background:rgba(255,255,255,.035);
          border:1px solid var(--line, rgba(242,237,230,.12));
          display:flex; flex-direction:column; gap:18px;
        }
        [data-theme="paper"] .pf-panel { background:rgba(20,23,30,.03); }

        /* ── Mobile: the filter panel becomes a bottom sheet instead of an
           inline block pushing the page content down (spec: convert
           desktop-style filter layouts to a bottom sheet on mobile). ── */
        .pf-backdrop { display:none; }
        @media (max-width:640px) {
          .pf-backdrop {
            display:block; position:fixed; inset:0; z-index:490;
            background:rgba(4,6,9,.55); backdrop-filter:blur(2px);
            animation: pfFade .2s ease both;
          }
          .pf-panel {
            position:fixed; left:0; right:0; bottom:0; z-index:500;
            margin-top:0; max-height:78vh; overflow-y:auto;
            border-radius:22px 22px 0 0;
            padding:16px 16px calc(20px + env(safe-area-inset-bottom,0px));
            background:#12151b;
            animation: pfSheetUp .28s cubic-bezier(.22,1,.36,1) both;
          }
          [data-theme="paper"] .pf-panel { background:#F8F5F0; }
        }
        @keyframes pfFade { from { opacity:0; } to { opacity:1; } }
        @keyframes pfSheetUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }

        .pf-gt {
          display:flex; align-items:center; gap:7px; margin:0 0 9px;
          font-size:11px; font-weight:800; letter-spacing:.1em;
          text-transform:uppercase; opacity:.5;
        }
        .pf-go { display:flex; gap:7px; flex-wrap:wrap; }
        .pf-go button {
          padding:8px 14px; border-radius:999px; cursor:pointer;
          border:1px solid var(--line, rgba(242,237,230,.14)); background:transparent;
          color:inherit; font-size:12.5px; font-weight:600; font-family:inherit;
          transition:border-color .2s, background .2s, color .2s;
        }
        .pf-go button:hover { border-color:rgba(0,98,65,.5); background:rgba(212,233,226,.4); }
        .pf-go button.on {
          background:#d4e9e2; border-color:#006241; color:#1e3932;
        }

        .pf-check {
          display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13.5px;
          padding-top:4px;
        }
        .pf-check input { position:absolute; opacity:0; pointer-events:none; }
        .pf-box {
          width:20px; height:20px; border-radius:6px; flex-shrink:0;
          display:inline-flex; align-items:center; justify-content:center;
          border:1px solid var(--line, rgba(242,237,230,.22)); color:#0B0D11;
        }
        .pf-check input:checked + .pf-box { background:#006241; border-color:#006241; }

        @media (max-width:620px) {
          .pf-count { width:100%; margin-left:0; order:99; }
        }
      `}</style>
    </div>
  );
}
