"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { MapPin, X, Navigation, Clock, Users, Loader2 } from "lucide-react";
import { nearbyVenuesAndGames, type NearbyResult } from "@/lib/play/nearby";
import { sportColor } from "@/lib/sports";

const KTM = "Asia/Kathmandu";

// A floating "Near me" button that opens a popup with the closest
// bookable venues and the closest upcoming games.
export default function NearbyPopup() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NearbyResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"venues" | "games">("venues");

  useEffect(() => {
    if (!open || data || pending) return;
    if (!navigator.geolocation) { setErr("Your browser can't share location."); return; }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          try {
            setData(await nearbyVenuesAndGames(pos.coords.latitude, pos.coords.longitude));
          } catch {
            setErr("Couldn't load what's nearby.");
          }
        });
      },
      () => setErr("Location access denied. Turn it on to see what's near you."),
      { timeout: 9000 }
    );
  }, [open, data, pending]);

  return (
    <>
      <button className="nb-fab" onClick={() => setOpen(true)} aria-label="What's near me">
        <Navigation size={16} /> Near me
      </button>

      {open && (
        <div className="nb-scrim" onClick={() => setOpen(false)}>
          <div className="nb-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="nb-head">
              <div>
                <div className="nb-eyebrow">Around you</div>
                <h3 className="nb-title">What&apos;s close</h3>
              </div>
              <button className="nb-x" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>

            <div className="nb-tabs">
              <button className={tab === "venues" ? "on" : ""} onClick={() => setTab("venues")}>
                Courts {data && `(${data.venues.length})`}
              </button>
              <button className={tab === "games" ? "on" : ""} onClick={() => setTab("games")}>
                Games {data && `(${data.games.length})`}
              </button>
            </div>

            <div className="nb-body">
              {err ? (
                <div className="nb-msg">{err}</div>
              ) : !data ? (
                <div className="nb-msg"><Loader2 size={18} className="nb-spin" /> Finding what&apos;s near you…</div>
              ) : tab === "venues" ? (
                data.venues.length === 0 ? (
                  <div className="nb-msg">No approved venues near you yet.</div>
                ) : data.venues.map((v) => (
                  <Link key={v.id} href={`/create/${v.id}`} className="nb-row" onClick={() => setOpen(false)}>
                    <div className="nb-dot" style={{ background: sportColor(v.sports?.[0]) }} />
                    <div className="nb-row-main">
                      <div className="nb-row-t">{v.name}</div>
                      <div className="nb-row-s">
                        {(v.sports ?? []).slice(0, 3).join(" · ") || v.venue_type}
                      </div>
                    </div>
                    <div className="nb-km">{v.km.toFixed(1)} km</div>
                  </Link>
                ))
              ) : (
                data.games.length === 0 ? (
                  <div className="nb-msg">No upcoming games near you. Host one?</div>
                ) : data.games.map((g) => (
                  <Link key={g.id} href={`/game/${g.id}`} className="nb-row" onClick={() => setOpen(false)}>
                    <div className="nb-dot" style={{ background: sportColor(g.sport) }} />
                    <div className="nb-row-main">
                      <div className="nb-row-t">{g.title}</div>
                      <div className="nb-row-s">
                        <Clock size={10} />{" "}
                        {new Date(g.event_date).toLocaleString("en-GB", {
                          weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM,
                        })}
                        {" · "}
                        <Users size={10} /> {g.slots_remaining} left
                      </div>
                    </div>
                    <div className="nb-km">{g.km.toFixed(1)} km</div>
                  </Link>
                ))
              )}
            </div>

            <Link href="/discover" className="nb-all" onClick={() => setOpen(false)}>
              See everything on the map →
            </Link>
          </div>
        </div>
      )}

      <style>{`
        .nb-fab {
          position: fixed; left: 22px; bottom: 22px; z-index: 320;
          display: inline-flex; align-items: center; gap: 7px;
          background: var(--ink, #0B0D11); color: var(--chalk, #F2EDE6);
          border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
          padding: 11px 18px; font-size: 13px; font-weight: 700; cursor: pointer;
          font-family: inherit; backdrop-filter: blur(14px);
          box-shadow: 0 14px 40px -12px rgba(0,0,0,0.5);
        }
        [data-theme="paper"] .nb-fab {
          background: #fff; color: #14171E; border-color: rgba(20,23,30,0.14);
          box-shadow: 0 14px 40px -12px rgba(20,23,30,0.25);
        }
        .nb-fab:hover { border-color: #FFC93C; color: #FFC93C; }
        @media (max-width: 780px) {
          .nb-fab { bottom: calc(104px + env(safe-area-inset-bottom, 0px)); left: 14px; padding: 9px 14px; font-size: 12px; }
        }
        @media (display-mode: standalone) and (max-width: 780px) {
          .nb-fab { bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
        }

        .nb-scrim {
          position: fixed; inset: 0; z-index: 420; background: rgba(6,7,10,0.6);
          backdrop-filter: blur(6px); display: grid; place-items: end start; padding: 22px;
        }
        @media (max-width: 780px) { .nb-scrim { place-items: end center; padding: 0; } }
        .nb-sheet {
          width: 100%; max-width: 380px; max-height: 72vh; display: flex; flex-direction: column;
          background: var(--inkSoft, #14171E); color: var(--chalk, #F2EDE6);
          border: 1px solid rgba(242,237,230,0.12); border-radius: 20px; overflow: hidden;
        }
        [data-theme="paper"] .nb-sheet { background: #fff; color: #14171E; border-color: rgba(20,23,30,0.12); }
        @media (max-width: 780px) { .nb-sheet { max-width: none; border-radius: 20px 20px 0 0; max-height: 80vh; } }

        .nb-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 18px 12px; }
        .nb-eyebrow {
          font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: 0.18em;
          text-transform: uppercase; color: #FFC93C; margin-bottom: 5px;
        }
        .nb-title { font-family: 'Bricolage Grotesque', sans-serif; font-size: 21px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
        .nb-x { background: none; border: none; color: inherit; opacity: 0.55; cursor: pointer; }

        .nb-tabs { display: flex; gap: 6px; padding: 0 18px 12px; }
        .nb-tabs button {
          flex: 1; padding: 8px; border-radius: 9px; font-size: 12.5px; font-weight: 700;
          background: transparent; color: inherit; cursor: pointer; font-family: inherit;
          border: 1px solid rgba(128,128,128,0.25); opacity: 0.7;
        }
        .nb-tabs button.on { opacity: 1; border-color: rgba(255,201,60,0.5); background: rgba(255,201,60,0.12); color: #FFC93C; }

        .nb-body { overflow-y: auto; padding: 0 8px; flex: 1; }
        .nb-row {
          display: flex; align-items: center; gap: 11px; padding: 12px 10px;
          border-radius: 11px; text-decoration: none; color: inherit;
        }
        .nb-row:hover { background: rgba(128,128,128,0.09); }
        .nb-dot { width: 8px; height: 8px; border-radius: 99px; flex-shrink: 0; }
        .nb-row-main { flex: 1; min-width: 0; }
        .nb-row-t { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nb-row-s { font-size: 11.5px; opacity: 0.55; margin-top: 2px; display: flex; align-items: center; gap: 3px; }
        .nb-km { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #FFC93C; flex-shrink: 0; }
        .nb-msg { padding: 30px 18px; text-align: center; font-size: 13.5px; opacity: 0.6; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .nb-spin { animation: nbspin 1s linear infinite; }
        @keyframes nbspin { to { transform: rotate(360deg); } }
        .nb-all {
          display: block; text-align: center; padding: 14px; font-size: 13px; font-weight: 700;
          color: #FFC93C; text-decoration: none; border-top: 1px solid rgba(128,128,128,0.18);
        }
      `}</style>
    </>
  );
}
