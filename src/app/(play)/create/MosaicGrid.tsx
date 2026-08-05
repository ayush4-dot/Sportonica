"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ImageIcon, Check, MapPin, CalendarPlus, Tag } from "lucide-react";

// Eight accent pairs, cycled so a wall of grounds never looks flat.
const HUES = [
  { a: "#A78BFA", b: "#F0872A" },  // amber
  { a: "#4ADE80", b: "#16A34A" },  // green
  { a: "#60A5FA", b: "#2563EB" },  // blue
  { a: "#F472B6", b: "#DB2777" },  // pink
  { a: "#C084FC", b: "#7C3AED" },  // violet
  { a: "#2DD4BF", b: "#0D9488" },  // teal
  { a: "#FB923C", b: "#EA580C" },  // orange
  { a: "#F87171", b: "#DC2626" },  // red
];
import SmartSearch, { EMPTY, type Query } from "./SmartSearch";
import DateStrip from "@/components/shared/DateStrip";
import { useCity, inCity } from "@/lib/city";
import { normalizeSport } from "@/lib/sports";
import { useTheme } from "@/lib/useTheme";
import type { Venue, Court } from "@/lib/admin/types";

type VenueWithCourts = Venue & { courts: Court[] };

// Build the best Google Maps link we have for a venue.
// Mosaic span pattern — hero first, then rhythm. Repeats past 8 cells.
const SPANS = ["s-hero", "", "", "s-tall", "", "s-wide", "", ""];

export default function MosaicGrid({ venues , offers = {} }: { venues: VenueWithCourts[] ; offers?: Record<string, { label: string; amount: number }> }) {
  const router = useRouter();
  const [theme] = useTheme();
  const { city, area } = useCity();
  const [q, setQ] = useState<Query>(EMPTY);
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

  const needle = q.text.trim().toLowerCase();
  const shown = venues.filter((v) => {
    // The header already asked which city — don't make them say it twice.
    if (!inCity(v.lat, v.lng, city, area)) return false;
    if (needle) {
      const hay = [v.name, v.venue_type, ...v.sports].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (q.sport) {
      const list = (v.sports ?? []).map(normalizeSport);
      if (!list.includes(q.sport)) return false;
    }
    if (q.maxKm != null) {
      if (!myCoords || v.lat == null || v.lng == null) return false;
      const km = kmTo(v.lat, v.lng);
      if (km == null || km > q.maxKm) return false;
    }
    if (q.minPrice != null || q.maxPrice != null) {
      const rates = v.courts.map((c) => Number(c.base_price)).filter((n) => n > 0);
      const from = rates.length ? Math.min(...rates) : Infinity;
      if (q.maxPrice != null && from > q.maxPrice) return false;
      if (q.minPrice != null && from < q.minPrice) return false;
    }
    return true;
  });

  // Interleave text cards the way the Framer mosaic mixes card types.
  const cells: ({ kind: "venue"; v: VenueWithCourts } | { kind: "text"; id: string; el: React.ReactNode })[] =
    shown.map((v) => ({ kind: "venue" as const, v }));

  const textCards: { id: string; el: React.ReactNode }[] = [];
  // slot text cards into positions 2 and 5 for rhythm
  if (cells.length >= 1) cells.splice(Math.min(2, cells.length), 0, { kind: "text", ...textCards[0] });
  if (cells.length >= 4) cells.splice(Math.min(5, cells.length), 0, { kind: "text", ...textCards[1] });

  function cellTap(e: React.MouseEvent, id: string, href: string) {
    // Details are always visible now, so a tap goes straight to the venue.
    e.preventDefault();
    router.push(href);
  }

  // Touch devices have no hover, so the drawer opens for whichever card
  // is nearest the middle of the screen as you scroll.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) return;   // desktop keeps :hover
    const root = gridRef.current;
    if (!root) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>(".fcard"));
    if (!cards.length) return;

    let raf = 0;
    const score = () => {
      raf = 0;
      const mid = window.innerHeight * 0.45;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { c.classList.remove("is-open"); continue; }
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      for (const c of cards) c.classList.toggle("is-open", c === best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(score); };

    score();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shown.length]);

  return (
    <div className={`mz ${theme}`}>
      <div className="mz-wrap">
        <div className="mz-head">
          <div>
            <div className="mz-eyebrow">Book a ground</div>
            <h1>Pick a <em>pitch.</em><br />Round up your side.</h1>
            <p>Every ground, every open slot. Lock a court, split the cost, and if you&apos;re short — open your game to the city.</p>
          </div>
        </div>

        <DateStrip value={pickDate} onPick={setPickDate} />

        {/* One field for everything: sport, budget, distance, ground name. */}
        <SmartSearch
          value={q}
          onChange={(next) => {
            // Asking for a distance needs a location — get it once, quietly.
            if (next.maxKm != null && !myCoords && navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (p) => setMyCoords([p.coords.latitude, p.coords.longitude]),
                () => setQ((cur) => ({ ...cur, maxKm: null })),
                { timeout: 8000 }
              );
            }
            setQ(next);
          }}
          venueNames={venues.map((v) => v.name)}
          count={shown.length}
          city={area?.name ?? city?.name ?? null}
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
              <button onClick={() => { setQ(EMPTY); setMyCoords(null); }}
                style={{ marginTop: 14, background: "none", border: "none", color: "#A78BFA", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Clear filters →
              </button>
            )}
          </div>
        ) : (
          <div className="mz-grid" ref={gridRef}>
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
                  {offers[v.id] && (
                    <span className="fcard-offer" title={offers[v.id].label}>
                      <Tag size={11} /> {offers[v.id].amount}% OFF
                    </span>
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
                      {(v.address || km != null) && (
                        <p className="fcard-where">
                          <MapPin size={11} />
                          {v.address ? v.address.split(",")[0] : "Kathmandu"}
                          {km != null && <> · <b>{km.toFixed(1)} km</b></>}
                        </p>
                      )}
                      <div className="fcard-meta">
                        <span>{v.courts.length} court{v.courts.length === 1 ? "" : "s"}</span>
                        {v.amenities?.length > 0 && <span>· {v.amenities.length} amenities</span>}
                      </div>
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
