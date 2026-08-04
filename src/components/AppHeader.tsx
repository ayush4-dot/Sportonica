"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, MapPin, Check, Navigation, Loader2, ClipboardList } from "lucide-react";
import { useProfile } from "@/lib/hooks/useProfile";
import { CITIES, useCity, greeting, nearestCity, nearestArea, type City, type Area } from "@/lib/city";
import NotificationBell from "./NotificationBell";

export default function AppHeader() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const { city, area, setCity, ready } = useCity();
  const [step, setStep] = useState<City | null>(null);   // city whose areas are showing
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [locating, setLocating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const hidden =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup");

  useEffect(() => { if (ready && !city && !hidden) setAsk(true); }, [ready, city, hidden]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (hidden) return null;

  function detect() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = nearestCity(p.coords.latitude, p.coords.longitude);
        setCity(c, nearestArea(c, p.coords.latitude, p.coords.longitude));
        setLocating(false); setAsk(false); setOpen(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }
  function pickCity(c: City) {
    // Choosing a city opens its areas rather than closing the menu —
    // most people want a neighbourhood, not a whole city.
    setCity(c, null);
    setStep(c);
    setQ("");
  }
  function pickArea(c: City, a: Area | null) {
    setCity(c, a);
    setStep(null); setQ(""); setAsk(false); setOpen(false);
  }

  // Search runs across every area in every city, so "Maitidevi" just works.
  const hits = q.trim()
    ? CITIES.flatMap((c) => c.areas.map((a) => ({ c, a })))
        .filter(({ c, a }) =>
          a.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          c.name.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  const firstName = profile?.full_name?.trim().split(" ")[0] ?? null;
  const initial = (firstName ?? "K").charAt(0).toUpperCase();

  return (
    <>
      <header className="ah">
        <div className="ah-in">
          {/* left — who and where */}
          <div className="ah-l">
            <Link href={profile ? "/profile" : "/login"} className="ah-av" aria-label="Profile">
              {profile?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatar_url} alt="" />
                : <span>{initial}</span>}
            </Link>

            <div className="ah-txt">
              <p className="ah-hi">
                {greeting()}{firstName ? <>, <b>{firstName}</b></> : ""}
              </p>

              <div className="ah-city" ref={boxRef}>
                <button className="ah-pick" onClick={() => setOpen((v) => !v)}>
                  <MapPin size={13} />
                  <span>{area?.name ?? city?.name ?? "Choose city"}</span>
                  {city && <em>{area ? `, ${city.name}` : `, ${city.province}`}</em>}
                  <ChevronDown size={13} className={open ? "flip" : ""} />
                </button>

                {open && (
                  <div className="ah-menu">
                    <div className="ah-find">
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
                        <div className="ah-list">
                          {hits.map(({ c, a }) => (
                            <button key={`${c.slug}-${a.name}`} className="ah-item"
                              onClick={() => pickArea(c, a)}>
                              <span><b>{a.name}</b><small>{c.name}</small></span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="ah-none">No area by that name.</p>
                      )
                    ) : step ? (
                      <>
                        <button className="ah-back" onClick={() => setStep(null)}>
                          ← All cities
                        </button>
                        <div className="ah-list">
                          <button className="ah-item" onClick={() => pickArea(step, null)}>
                            <span><b>All of {step.name}</b><small>Whole city</small></span>
                            {!area && city?.slug === step.slug && <Check size={13} />}
                          </button>
                          {step.areas.map((a) => (
                            <button key={a.name} className="ah-item" onClick={() => pickArea(step, a)}>
                              <span><b>{a.name}</b></span>
                              {area?.name === a.name && <Check size={13} />}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <button className="ah-detect" onClick={detect} disabled={locating}>
                          {locating ? <Loader2 size={13} className="spin" /> : <Navigation size={13} />}
                          {locating ? "Finding you…" : "Use my location"}
                        </button>
                        <div className="ah-list">
                          {CITIES.map((c) => (
                            <button key={c.slug} className="ah-item" onClick={() => pickCity(c)}>
                              <span><b>{c.name}</b><small>{c.areas.length} areas</small></span>
                              {city?.slug === c.slug && <Check size={13} />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* right — actions */}
          <div className="ah-r">
            <Link
              href="/my-games"
              className={`ah-btn ${pathname.startsWith("/my-games") ? "on" : ""}`}
              aria-label="My games"
            >
              <ClipboardList size={19} />
            </Link>
            <NotificationBell inline />
          </div>
        </div>
      </header>

      {ask && (
        <div className="ah-scrim" onClick={() => setAsk(false)}>
          <div className="ah-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="ah-namaste">नमस्ते</p>
            <h2>Where do you play?</h2>
            <p className="ah-sub">
              We&apos;ll put your city&apos;s courts and games first. Change it any time.
            </p>
            <button className="ah-detect big" onClick={detect} disabled={locating}>
              {locating ? <Loader2 size={15} className="spin" /> : <Navigation size={15} />}
              {locating ? "Finding you…" : "Use my location"}
            </button>
            <div className="ah-grid">
              {CITIES.map((c) => (
                <button key={c.slug} onClick={() => pickArea(c, null)}>
                  <b>{c.name}</b><small>{c.province}</small>
                </button>
              ))}
            </div>
            <button className="ah-skip" onClick={() => setAsk(false)}>Skip for now</button>
          </div>
        </div>
      )}

      <style>{`
        .ah {
          position:sticky; top:0; z-index:400;
          background:radial-gradient(circle at top right, rgba(167,139,250,.14) 0%, rgba(11,13,17,.72) 60%);
          color:#F2EDE6;
          backdrop-filter:blur(20px) saturate(160%);
          -webkit-backdrop-filter:blur(20px) saturate(160%);
          border-bottom:1px solid rgba(255,255,255,.06);
          box-shadow:0 24px 40px -28px rgba(0,0,0,.6);
          padding-top:env(safe-area-inset-top,0px);
          transform:translateZ(0);
          -webkit-transform:translateZ(0);
          isolation:isolate;
        }
        .ah-in {
          display:flex; align-items:center; justify-content:space-between; gap:16px;
          padding:11px clamp(16px,5vw,56px);
          max-width:1800px; margin:0 auto;
        }

        .ah-l { display:flex; align-items:center; gap:11px; min-width:0; }
        .ah-av {
          width:42px; height:42px; border-radius:999px; flex-shrink:0; overflow:hidden;
          display:flex; align-items:center; justify-content:center; text-decoration:none;
          background:linear-gradient(140deg,#A78BFA,#7C3AED); color:#fff;
          font-weight:800; font-size:16px;
          box-shadow:0 6px 18px -8px rgba(167,139,250,.9);
        }
        .ah-av img { width:100%; height:100%; object-fit:cover; }
        .ah-txt { min-width:0; }
        .ah-hi { font-size:12.5px; opacity:.55; margin:0 0 1px; white-space:nowrap; }
        .ah-hi b { font-weight:800; opacity:1; }

        .ah-city { position:relative; }
        .ah-pick {
          display:inline-flex; align-items:center; gap:5px; cursor:pointer;
          background:none; border:none; padding:0; color:inherit; font-family:inherit;
          font-size:16px; font-weight:800; letter-spacing:-.3px; max-width:100%;
        }
        .ah-pick em { font-style:normal; font-weight:600; opacity:.5; font-size:14px; }
        .ah-pick svg:last-child { opacity:.5; transition:transform .25s; }
        .ah-pick svg.flip { transform:rotate(180deg); }

        .ah-r { display:flex; align-items:center; gap:9px; flex-shrink:0; }
        .ah-btn {
          width:42px; height:42px; border-radius:999px;
          display:inline-flex; align-items:center; justify-content:center;
          border:1px solid rgba(242,237,230,.14); background:transparent;
          color:inherit; cursor:pointer; text-decoration:none;
          transition:border-color .2s, background .2s, color .2s, transform .15s;
        }
        [data-theme="paper"] .ah-btn { border-color:rgba(20,23,30,.14); }
        .ah-btn:hover { transform:translateY(-1px); border-color:rgba(167,139,250,.55); }
        .ah-btn.on { border-color:#A78BFA; color:#A78BFA; background:rgba(167,139,250,.12); }

        .ah-menu {
          position:absolute; top:calc(100% + 10px); left:0; z-index:60;
          width:270px; border-radius:16px; padding:7px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
          box-shadow:0 24px 56px -20px rgba(0,0,0,.85);
        }
        [data-theme="paper"] .ah-menu { background:#fff; border-color:rgba(20,23,30,.12); }
        .ah-detect {
          width:100%; display:flex; align-items:center; gap:8px; cursor:pointer;
          padding:10px 12px; border-radius:11px; font-size:13px; font-weight:700;
          border:1px dashed rgba(167,139,250,.45); background:rgba(167,139,250,.1);
          color:#A78BFA; font-family:inherit; margin-bottom:6px;
        }
        .ah-detect.big { justify-content:center; padding:13px; font-size:14px; margin:0 0 18px; }
        .ah-find {
          display:flex; align-items:center; gap:8px;
          padding:9px 11px; border-radius:11px; margin-bottom:6px;
          border:1px solid var(--line, rgba(242,237,230,.14));
          background:rgba(255,255,255,.04);
        }
        [data-theme="paper"] .ah-find { background:#fff; border-color:rgba(20,23,30,.12); }
        .ah-find svg { opacity:.45; flex-shrink:0; }
        .ah-find input {
          flex:1; min-width:0; border:none; background:transparent; color:inherit;
          font-family:inherit; font-size:13px; outline:none;
        }
        .ah-find input::placeholder { opacity:.4; }
        .ah-back {
          width:100%; text-align:left; padding:7px 12px; margin-bottom:4px;
          border:none; background:none; color:#A78BFA; cursor:pointer;
          font-family:inherit; font-size:12px; font-weight:700;
        }
        .ah-none { padding:16px 12px; text-align:center; font-size:12.5px; opacity:.45; margin:0; }
        .ah-list { max-height:260px; overflow-y:auto; }
        .ah-item {
          width:100%; display:flex; align-items:center; justify-content:space-between;
          padding:9px 12px; border-radius:10px; cursor:pointer;
          background:none; border:none; color:inherit; font-family:inherit; text-align:left;
        }
        .ah-item:hover { background:rgba(255,255,255,.06); }
        [data-theme="paper"] .ah-item:hover { background:rgba(20,23,30,.05); }
        .ah-item span { display:flex; flex-direction:column; }
        .ah-item b { font-size:13.5px; font-weight:700; }
        .ah-item small { font-size:11px; opacity:.5; }

        .ah-scrim {
          position:fixed; inset:0; z-index:600; padding:20px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(4,6,9,.72); backdrop-filter:blur(6px);
        }
        .ah-sheet {
          width:100%; max-width:440px; border-radius:24px; padding:28px;
          background:#12151b; border:1px solid rgba(242,237,230,.12);
        }
        [data-theme="paper"] .ah-sheet { background:#F8F5F0; border-color:rgba(20,23,30,.12); }
        .ah-namaste { font-size:22px; color:#A78BFA; margin:0 0 8px; font-weight:600; }
        .ah-sheet h2 {
          font-family:'Bricolage Grotesque',sans-serif; font-size:27px; font-weight:800;
          letter-spacing:-1px; margin:0 0 8px;
        }
        .ah-sub { font-size:13.5px; opacity:.6; line-height:1.5; margin:0 0 20px; }
        .ah-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .ah-grid button {
          display:flex; flex-direction:column; gap:2px; cursor:pointer;
          padding:11px 10px; border-radius:13px; text-align:left; font-family:inherit;
          border:1px solid rgba(242,237,230,.12); background:transparent; color:inherit;
          transition:border-color .2s, transform .16s, background .2s;
        }
        [data-theme="paper"] .ah-grid button { border-color:rgba(20,23,30,.12); }
        .ah-grid button:hover {
          border-color:#A78BFA; background:rgba(167,139,250,.1); transform:translateY(-2px);
        }
        .ah-grid b { font-size:13px; font-weight:700; }
        .ah-grid small { font-size:10.5px; opacity:.5; }
        .ah-skip {
          display:block; margin:18px auto 0; cursor:pointer;
          background:none; border:none; color:inherit; opacity:.45;
          font-size:12.5px; font-family:inherit;
        }
        .spin { animation:ahspin 1s linear infinite; }
        @keyframes ahspin { to { transform:rotate(360deg); } }

        @media (max-width:560px) {
          .ah-in { padding:9px 16px; gap:10px; }
          .ah-av { width:38px; height:38px; font-size:15px; }
          .ah-btn { width:38px; height:38px; }
          .ah-pick { font-size:15px; }
          .ah-pick em { display:none; }
          .ah-grid { grid-template-columns:repeat(2,1fr); }
        }
      `}</style>
    </>
  );
}
