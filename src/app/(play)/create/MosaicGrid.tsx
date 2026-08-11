"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ImageIcon, Check, MapPin, CalendarPlus, Tag } from "lucide-react";

// Eight accent pairs, cycled so a wall of grounds never looks flat.
const HUES = [
  { a: "#006241", b: "#F0872A" },  // amber
  { a: "#4ADE80", b: "#16A34A" },  // green
  { a: "#60A5FA", b: "#2563EB" },  // blue
  { a: "#5f756d", b: "#1e3932" },  // slate
  { a: "#3d8a68", b: "#004a31" },  // deep green
  { a: "#2DD4BF", b: "#0D9488" },  // teal
  { a: "#FB923C", b: "#EA580C" },  // orange
  { a: "#F87171", b: "#DC2626" },  // red
];
import BookFilters, { NO_BOOK_FILTERS, type BookQuery } from "./BookFilters";
import DateStrip from "@/components/shared/DateStrip";
import { useCity, inCity } from "@/lib/city";
import { normalizeSport, SPORT_NAMES } from "@/lib/sports";
import { useTheme } from "@/lib/useTheme";
import type { Venue, Court } from "@/lib/admin/types";

type VenueWithCourts = Venue & { courts: Court[] };

export default function MosaicGrid({ venues , offers = {} }: { venues: VenueWithCourts[] ; offers?: Record<string, { label: string; amount: number }> }) {
  const router = useRouter();
  const [theme] = useTheme();
  const { city, area } = useCity();
  const [q, setQ] = useState<BookQuery>(NO_BOOK_FILTERS);
  const [pickDate, setPickDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" }));
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const venueTypes = [...new Set(venues.map((v) => v.venue_type).filter(Boolean))];

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
    if (q.venueType && v.venue_type !== q.venueType) return false;
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

  const cells: { kind: "venue"; v: VenueWithCourts }[] =
    shown.map((v) => ({ kind: "venue" as const, v }));

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

        {/* Sport, area, ground type, price, distance — the Play bar's shape,
            asking about a ground instead of a game. */}
        <BookFilters
          sport={q.sport}
          setSport={(sp) => setQ((cur) => ({ ...cur, sport: sp }))}
          sports={SPORT_NAMES}
          venueTypes={venueTypes}
          value={q}
          onChange={setQ}
          count={shown.length}
          onNeedLocation={() => {
            if (myCoords || !navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (p) => setMyCoords([p.coords.latitude, p.coords.longitude]),
              () => setQ((cur) => ({ ...cur, maxKm: null })),
              { timeout: 8000 }
            );
          }}
        />

        {shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", opacity: 0.65 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 22 }}>
              {venues.length > 0 ? "No grounds match that" : "No venues listed yet"}
            </h3>
            <p style={{ fontSize: 14 }}>
              {venues.length > 0
                ? "Try another sport, or widen the distance."
                : "Once owners list their grounds, they'll appear here ready to book."}
            </p>
            {venues.length > 0 && (
              <button onClick={() => { setQ(NO_BOOK_FILTERS); setMyCoords(null); }}
                style={{ marginTop: 14, background: "none", border: "none", color: "#006241", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Clear filters →
              </button>
            )}
          </div>
        ) : (
          <div className="mz-grid" ref={gridRef}>
            {cells.map((cell, i) => {
              const delay = `${0.08 + i * 0.07}s`;

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
