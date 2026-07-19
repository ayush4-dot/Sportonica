"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, MapPin } from "lucide-react";
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
  const [openId, setOpenId] = useState<string | null>(null); // touch: tap to open

  // Interleave text cards the way the Framer mosaic mixes card types.
  const totalCourts = venues.reduce((s, v) => s + v.courts.length, 0);
  const cells: ({ kind: "venue"; v: VenueWithCourts } | { kind: "text"; id: string; el: React.ReactNode })[] =
    venues.map((v) => ({ kind: "venue" as const, v }));

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
    // Touch devices: first tap reveals, second tap navigates.
    const isTouch = window.matchMedia("(hover: none)").matches;
    if (isTouch && openId !== id) {
      e.preventDefault();
      setOpenId(id);
      return;
    }
    router.push(href);
  }

  return (
    <div className={`mz ${theme}`}>
      <div className="mz-wrap">
        <div className="mz-head">
          <div>
            <div className="mz-eyebrow">Book a ground</div>
            <h1>Pick a pitch.<br />Round up your side.</h1>
            <p>Hover a venue to see it come alive. Lock a slot, split the cost, and if you&apos;re short — open your game to the city.</p>
          </div>
        </div>

        {/* 3D sport showcase — drag / swipe / scroll */}
        <div style={{ margin: "8px 0 40px" }}>
          <SportCoverflow />
        </div>

        {venues.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", opacity: 0.65 }}>
            <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 22 }}>No venues listed yet</h3>
            <p style={{ fontSize: 14 }}>Once owners list their grounds, they&apos;ll appear here ready to book.</p>
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
              const isOpen = openId === v.id;

              return (
                <a
                  key={v.id}
                  href={href}
                  className={`mz-cell ${span} ${isOpen ? "open" : ""}`}
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
