"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Check, Navigation, Loader2 } from "lucide-react";
import { CITIES, useCity, nearestCity, nearestArea, type City, type Area } from "@/lib/city";

/**
 * Drops the header's "where do you play" picker into any search bar, so
 * changing location doesn't mean leaving the filter row you're already in.
 * Self-contained: reads and writes the same useCity() state the header
 * uses, so picking here and picking up top stay in sync automatically.
 */
export default function LocationPicker() {
  const { city, area, setCity } = useCity();
  const [step, setStep] = useState<City | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false); setStep(null); setQ("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function detect() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = nearestCity(p.coords.latitude, p.coords.longitude);
        setCity(c, nearestArea(c, p.coords.latitude, p.coords.longitude));
        setLocating(false); setOpen(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }
  function pickCity(c: City) {
    setCity(c, null);
    setStep(c);
    setQ("");
  }
  function pickArea(c: City, a: Area | null) {
    setCity(c, a);
    setStep(null); setQ(""); setOpen(false);
  }

  const hits = q.trim()
    ? CITIES.flatMap((c) => c.areas.map((a) => ({ c, a })))
        .filter(({ c, a }) =>
          a.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          c.name.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="lp" ref={boxRef}>
      <button className="lp-trigger" onClick={() => setOpen((v) => !v)}>
        <MapPin size={15} />
        <span>{area?.name ?? city?.name ?? "Anywhere"}</span>
        <ChevronDown size={14} className={open ? "flip" : ""} />
      </button>

      {open && (
        <div className="lp-drop">
          <div className="lp-find">
            <MapPin size={13} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search an area — Maitidevi, Lakeside…"
              aria-label="Search area"
              autoFocus
            />
          </div>

          {q.trim() ? (
            hits.length ? (
              <div className="lp-list">
                {hits.map(({ c, a }) => (
                  <button key={`${c.slug}-${a.name}`} className="lp-item" onClick={() => pickArea(c, a)}>
                    <span><b>{a.name}</b><small>{c.name}</small></span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="lp-none">No area by that name.</p>
            )
          ) : step ? (
            <>
              <button className="lp-back" onClick={() => setStep(null)}>← All cities</button>
              <div className="lp-list">
                <button className="lp-item" onClick={() => pickArea(step, null)}>
                  <span><b>All of {step.name}</b><small>Whole city</small></span>
                  {!area && city?.slug === step.slug && <Check size={13} />}
                </button>
                {step.areas.map((a) => (
                  <button key={a.name} className="lp-item" onClick={() => pickArea(step, a)}>
                    <span><b>{a.name}</b></span>
                    {area?.name === a.name && <Check size={13} />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="lp-detect" onClick={detect} disabled={locating}>
                {locating ? <Loader2 size={13} className="lp-spin" /> : <Navigation size={13} />}
                {locating ? "Finding you…" : "Use my location"}
              </button>
              <div className="lp-list">
                {CITIES.map((c) => (
                  <button key={c.slug} className="lp-item" onClick={() => pickCity(c)}>
                    <span><b>{c.name}</b><small>{c.areas.length} areas</small></span>
                    {city?.slug === c.slug && <Check size={13} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        .lp { position:relative; flex:1; min-width:0; display:flex; }
        .lp-trigger {
          flex:1; display:flex; align-items:center; gap:9px; min-width:0;
          padding:14px 16px; border:none; background:none; color:inherit;
          font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
          text-align:left;
        }
        .lp-trigger:hover { background:rgba(167,139,250,.07); }
        .lp-trigger svg:first-child { opacity:.55; flex-shrink:0; }
        .lp-trigger span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lp-trigger svg:last-child { opacity:.45; transition:transform .25s; flex-shrink:0; }
        .lp-trigger svg.flip { transform:rotate(180deg); }

        .lp-drop {
          position:absolute; top:calc(100% + 8px); left:0; z-index:70;
          width:270px; max-width:min(270px, 88vw); border-radius:16px; padding:7px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
          box-shadow:0 24px 56px -20px rgba(0,0,0,.85);
        }
        [data-theme="paper"] .lp-drop { background:#fff; border-color:rgba(20,23,30,.12); }

        .lp-detect {
          width:100%; display:flex; align-items:center; gap:8px; cursor:pointer;
          padding:10px 12px; border-radius:11px; font-size:13px; font-weight:700;
          border:1px dashed rgba(167,139,250,.45); background:rgba(167,139,250,.1);
          color:#A78BFA; font-family:inherit; margin-bottom:6px;
        }
        .lp-find {
          display:flex; align-items:center; gap:8px;
          padding:9px 11px; border-radius:11px; margin-bottom:6px;
          border:1px solid rgba(242,237,230,.14);
          background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .lp-find { background:#f7f4ef; border-color:rgba(20,23,30,.12); }
        .lp-find svg { opacity:.45; flex-shrink:0; }
        .lp-find input {
          flex:1; min-width:0; border:none; background:transparent; color:inherit;
          font-family:inherit; font-size:13px; outline:none;
        }
        .lp-find input::placeholder { opacity:.4; }
        .lp-back {
          width:100%; text-align:left; padding:7px 12px; margin-bottom:4px;
          border:none; background:none; color:#A78BFA; cursor:pointer;
          font-family:inherit; font-size:12px; font-weight:700;
        }
        .lp-none { padding:16px 12px; text-align:center; font-size:12.5px; opacity:.45; margin:0; }
        .lp-list { max-height:260px; overflow-y:auto; }
        .lp-item {
          width:100%; display:flex; align-items:center; justify-content:space-between;
          padding:9px 12px; border-radius:10px; cursor:pointer;
          background:none; border:none; color:inherit; font-family:inherit; text-align:left;
        }
        .lp-item:hover { background:rgba(255,255,255,.06); }
        [data-theme="paper"] .lp-item:hover { background:rgba(20,23,30,.05); }
        .lp-item span { display:flex; flex-direction:column; }
        .lp-item b { font-size:13.5px; font-weight:700; }
        .lp-item small { font-size:11px; opacity:.5; }

        .lp-spin { animation:lpspin 1s linear infinite; }
        @keyframes lpspin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
