"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, MapPin, Clock, ShieldCheck } from "lucide-react";
import VenueFilters, { type VenueDist, type VenuePrice } from "./VenueFilters";
import { normalizeSport } from "@/lib/sports";
import SportCoverflow from "@/components/SportCoverflow";
import { useTheme } from "@/lib/useTheme";
import type { Venue, Court } from "@/lib/admin/types";

type VenueWithCourts = Venue & { courts: Court[] };

// Build the best Google Maps link we have for a venue.
function mapsLink(v: Venue): string | null {
  if (v.maps_url) return v.maps_url;
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  return null;
}

// Mosaic span pattern — hero first, then rhythm. Repeats past 8 cells.
const SPANS = ["s-hero", "", "", "s-tall", "", "s-wide", "", ""];

export default function MosaicGrid({ venues }: { venues: VenueWithCourts[] }) {
  const router = useRouter();
  const [theme] = useTheme();
  const [sport, setSport] = useState<string | null>(null);
  const [dist, setDist] = useState<VenueDist>("any");
  const [price, setPrice] = useState<VenuePrice>("any");
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
              const sports = v.sports.length ? v.sports.join(" · ") : v.venue_type;
              const href = `/create/${v.id}`;

              return (
                <a
                  key={v.id}
                  href={href}
                  className={`mz-cell ${span} `}
                  style={{ animationDelay: delay }}
                  onClick={(e) => cellTap(e, v.id, href)}
                >
                  <div className="mz-img">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={v.name} loading="lazy" />
                    ) : (
                      <div className="mz-img-empty"><ImageIcon size={34} /></div>
                    )}
                  </div>

                  <div className="mz-shade" />

                  <span className={`mz-tag ${v.verification_status === "verified" ? "verified" : ""}`}>
                    {v.verification_status === "verified" ? "Verified" : sports.split(" · ")[0]}
                  </span>

                  <div className="mz-content">
                    <h3 className="t">{v.name}</h3>
                    <div className="dv" />
                    <p className="d">
                      {sports}{from ? ` · from Rs ${from}/hr` : ""}
                      {myCoords && v.lat != null && v.lng != null && (() => {
                        const km = kmTo(v.lat, v.lng);
                        return km == null ? null : <span style={{ color: "#FFC93C" }}> · {km.toFixed(1)} km</span>;
                      })()}
                    </p>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="cta">Book this ground <ArrowRight size={14} /></span>
                      {mapsLink(v) && (
                        <span
                          role="link"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(mapsLink(v)!, "_blank"); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#FFC93C", cursor: "pointer" }}
                        >
                          <MapPin size={12} /> View location
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
