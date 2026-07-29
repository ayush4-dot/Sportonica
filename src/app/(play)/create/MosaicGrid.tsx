"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ImageIcon, Check, MapPin, CalendarPlus } from "lucide-react";

// Eight accent pairs, cycled so a wall of grounds never looks flat.
const HUES = [
  { a: "#FFC93C", b: "#F0872A" },  // amber
  { a: "#4ADE80", b: "#16A34A" },  // green
  { a: "#60A5FA", b: "#2563EB" },  // blue
  { a: "#F472B6", b: "#DB2777" },  // pink
  { a: "#C084FC", b: "#7C3AED" },  // violet
  { a: "#2DD4BF", b: "#0D9488" },  // teal
  { a: "#FB923C", b: "#EA580C" },  // orange
  { a: "#F87171", b: "#DC2626" },  // red
];
import VenueFilters, { type VenueDist, type VenuePrice } from "./VenueFilters";
import DateStrip from "./DateStrip";
import { normalizeSport } from "@/lib/sports";
import SportCoverflow from "@/components/SportCoverflow";
import { useTheme } from "@/lib/useTheme";
import type { Venue, Court } from "@/lib/admin/types";

type VenueWithCourts = Venue & { courts: Court[] };

// Build the best Google Maps link we have for a venue.
// Mosaic span pattern — hero first, then rhythm. Repeats past 8 cells.
const SPANS = ["s-hero", "", "", "s-tall", "", "s-wide", "", ""];

export default function MosaicGrid({ venues }: { venues: VenueWithCourts[] }) {
  const router = useRouter();
  const [theme] = useTheme();
  const [sport, setSport] = useState<string | null>(null);
  const [dist, setDist] = useState<VenueDist>("any");
  const [price, setPrice] = useState<VenuePrice>("any");
  const [pickDate, setPickDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }));
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);

  // ── Filter the venues before laying out the mosaic ──────────────
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const kmTo = (lat: number, lng: number) => {
    if (!myCoords) return null;
    const dLat = toRad(lat - myCoords[0]), dLng = toRad(lng - myCoords[1]);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(myCoords[0])) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const shown = venues.filter((v) => {
    if (sport) {
      const list = (v.sports ?? []).map(normalizeSport);
      if (!list.includes(sport)) return false;
    }
    if (dist !== "any") {
      if (!myCoords || v.lat == null || v.lng == null) return false;
      const km = kmTo(v.lat, v.lng);
      if (km == null || km > Number(dist)) return false;
    }
    if (price !== "any") {
      const rates = v.courts.map((c) => Number(c.base_price)).filter((n) => n > 0);
      const from = rates.length ? Math.min(...rates) : Infinity;
      if (from > Number(price)) return false;
    }
    return true;
  });

  // Interleave text cards the way the Framer mosaic mixes card types.
  const totalCourts = shown.reduce((s, v) => s + v.courts.length, 0);
  const cells: ({ kind: "venue"; v: VenueWithCourts } | { kind: "text"; id: string; el: React.ReactNode })[] =
    shown.map((v) => ({ kind: "venue" as const, v }));

  const textCards = [
    {
      id: "txt-stat",
      el: (
        <>
          <div className="num">{totalCourts || "—"}</div>
          <div>
            <div className="big">Courts ready to book</div>
            <div className="small" style={{ marginTop: 6 }}>Real grounds, real slots — pay your share and play.</div>
          </div>
        </>
      ),
    },
    {
      id: "txt-host",
      el: (
        <>
          <div className="big">Short of players? Open your game.</div>
          <div className="small" style={{ marginTop: 8 }}>
            Book a slot, say how many you need, and let the city fill your side. The cost splits as they join.
          </div>
        </>
      ),
    },
  ];
  // slot text cards into positions 2 and 5 for rhythm
  if (cells.length >= 1) cells.splice(Math.min(2, cells.length), 0, { kind: "text", ...textCards[0] });
  if (cells.length >= 4) cells.splice(Math.min(5, cells.length), 0, { kind: "text", ...textCards[1] });

  function cellTap(e: React.MouseEvent, id: string, href: string) {
    // Details are always visible now, so a tap goes straight to the venue.
    e.preventDefault();
    router.push(href);
  }

  return (
    <div className={`mz ${theme}`}>
      <div className="mz-wrap">
        <div className="mz-head">
          <div>
            <div className="mz-eyebrow">Book a ground</div>
            <h1>Pick a pitch.<br />Round up your side.</h1>
            <p>Every ground, every open slot. Lock a court, split the cost, and if you&apos;re short — open your game to the city.</p>
          </div>
        </div>

        {/* 3D sport showcase — tapping the centre card filters the grounds */}
        <div style={{ margin: "8px 0 28px" }}>
          <SportCoverflow
            selected={sport ?? undefined}
            onPick={(s) => {
              setSport(s);
              document.querySelector(".mz-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>

        <DateStrip value={pickDate} onPick={setPickDate} />

        <VenueFilters
          dist={dist} setDist={setDist}
          price={price} setPrice={setPrice}
          onLocation={setMyCoords} hasLocation={!!myCoords}
          count={shown.length}
          onClear={() => { setDist("any"); setPrice("any"); setMyCoords(null); }}
        />

        {shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", opacity: 0.65 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 22 }}>
              {venues.length > 0 ? "No grounds match that" : "No venues listed yet"}
            </h3>
            <p style={{ fontSize: 14 }}>
              {venues.length > 0
                ? "Try another sport, or widen the distance."
                : "Once owners list their grounds, they'll appear here ready to book."}
            </p>
            {venues.length > 0 && (
              <button onClick={() => { setSport(null); setDist("any"); setMyCoords(null); }}
                style={{ marginTop: 14, background: "none", border: "none", color: "#FFC93C", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Clear filters →
              </button>
            )}
          </div>
        ) : (
          <div className="mz-grid">
            {cells.map((cell, i) => {
              const span = SPANS[i % SPANS.length];
              const delay = `${0.08 + i * 0.07}s`;

              if (cell.kind === "text") {
                return (
                  <div key={cell.id} className={`mz-cell txt ${span}`} style={{ animationDelay: delay, cursor: "default" }}>
                    {cell.el}
                  </div>
                );
              }

              const v = cell.v;
              const photo = v.photos?.[0];
              const from = v.courts.length
                ? Math.min(...v.courts.map((c) => Number(c.base_price)).filter((n) => n > 0))
                : null;
              const sports = v.sports.length ? v.sports : [v.venue_type];
              const shown = sports.slice(0, 3);
              const extra = sports.length - shown.length;
              const km = myCoords && v.lat != null && v.lng != null ? kmTo(v.lat, v.lng) : null;
              const href = `/create/${v.id}?date=${pickDate}`;
              // Cards cycle through three skins so a row never looks flat.
              const skin = ["indigo", "chalk", "ink"][i % 3];
              const maps = v.lat != null && v.lng != null
                ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`
                : null;

              return (
                <a
                  key={v.id}
                  href={href}
                  className="fcard"
                  data-skin={skin}
                  style={{ animationDelay: delay }}
                  onClick={(e) => cellTap(e, v.id, href)}
                >
                  <div className="fcard-media">
                    {photo ? (
                      <>
                        {/* Blurred copy fills the frame so the real photo
                            can be shown whole, never cropped. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="fcard-blur" src={photo} alt="" aria-hidden="true" loading="lazy" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="fcard-photo" src={photo} alt="" loading="lazy" />
                      </>
                    ) : (
                      <div className="fcard-noimg"><ImageIcon size={26} /></div>
                    )}
                  </div>

                  {v.verification_status === "verified" && (
                    <span className="fcard-verified"><Check size={11} /> Verified</span>
                  )}

                  {/* tab — price steps up over the photo */}
                  <div className="fcard-tab">
                    <span className="fcard-price">
                      {from ? <>Rs {from}<small>/hr</small></> : <>Ask</>}
                    </span>
                    <span className="fcard-arrow"><ArrowUpRight size={18} /></span>
                  </div>

                  <div className="fcard-panel">
                    <div className="fcard-top">
                      <h3 className="fcard-name">{v.name}</h3>
                      <div className="fcard-sports">
                        {shown.map((sp) => <span key={sp}>{sp}</span>)}
                        {extra > 0 && <span className="more">+{extra}</span>}
                      </div>
                    </div>

                    <div className="fcard-actions">
                      <span className="fcard-book"><CalendarPlus size={14} /> Book</span>
                      {maps && (
                        <span
                          role="link"
                          className="fcard-map"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(maps, "_blank"); }}
                        >
                          <MapPin size={14} /> {km != null ? `${km.toFixed(1)} km` : "Map"}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
