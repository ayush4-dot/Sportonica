"use client";

/**
 * KhelamnaMap — shared Leaflet map used across:
 *   - /discover  (read-only, shows event pins)
 *   - /create    (read-only, shows venue pin from address)
 *   - /admin/venue (pick-a-point, updates lat/lng)
 *
 * Uses OpenStreetMap tiles — no API key required.
 */

import { useEffect, useRef, useState } from "react";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sport?: string;
  flash?: boolean;
  color?: string;
};

interface Props {
  /** Centre of the map on first render */
  center?: [number, number];
  zoom?: number;
  /** Pins to show. If empty just shows the basemap. */
  pins?: MapPin[];
  /** If true, clicking the map fires onPick with the lat/lng */
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** Called with the pin id when a pin is clicked. */
  onPinClick?: (id: string) => void;
  height?: string;
  borderRadius?: string;
}

// Kathmandu city centre default
const KTM: [number, number] = [27.7172, 85.324];

const SPORT_COLORS: Record<string, string> = {
  Futsal:     "#2E7D5B",
  Football:   "#22c55e",
  Basketball: "#A78BFA",
  Cricket:    "#f97316",
  Volleyball: "#3b82f6",
  Badminton:  "#a855f7",
  Tennis:     "#ec4899",
};

export default function KhelamnaMap({
  center = KTM,
  zoom = 14,
  pins = [],
  pickMode = false,
  onPick,
  onPinClick,
  height = "100%",
  borderRadius = "0",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialised
    // Synchronous lock: the async import below resolves too late to stop a
    // second effect run (React strict-mode double-invoke), so mark the
    // container itself as claimed the instant this effect starts.
    const el = containerRef.current;
    if ((el as HTMLElement & { _leafletClaimed?: boolean })._leafletClaimed) return;
    (el as HTMLElement & { _leafletClaimed?: boolean })._leafletClaimed = true;

    // Leaflet must be imported client-side only
    import("leaflet").then(L => {
      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      // Light, clean basemap (CartoDB Positron — free, no key)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      // Add pins
      pins.forEach(pin => {
        const color = pin.flash ? "#E85D24" : (pin.color ?? SPORT_COLORS[pin.sport ?? ""] ?? "#006241");
        const svgIcon = L.divIcon({
          className: "",
          html: `
            <div style="
              background:${color};
              color:#fff;
              padding:4px 10px;
              border-radius:10px;
              font-size:11px;
              font-weight:700;
              font-family:'Inter',sans-serif;
              white-space:nowrap;
              box-shadow:0 2px 12px rgba(0,0,0,0.5);
              display:flex;align-items:center;gap:4px;
            ">
              ${pin.flash ? "⚡ " : ""}${pin.label}
            </div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${color};margin:0 auto;"></div>
          `,
          iconAnchor: [40, 28],
          popupAnchor: [0, -28],
        });

        const marker = L.marker([pin.lat, pin.lng], { icon: svgIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#1e293b;">
              ${pin.label}${pin.sport ? `<br><span style="color:${color};font-weight:700">${pin.sport}</span>` : ""}
            </div>
          `);
        if (onPinClick) marker.on("click", () => onPinClick(pin.id));
      });

      // Pick mode
      if (pickMode) {
        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          setPicked([lat, lng]);
          onPick?.(lat, lng);

          // Move or add pick marker
          if ((map as unknown as { _pickMarker?: import("leaflet").Marker })._pickMarker) {
            (map as unknown as { _pickMarker: import("leaflet").Marker })._pickMarker.setLatLng([lat, lng]);
          } else {
            const pickIcon = L.divIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:50%;background:#006241;border:3px solid #fff;box-shadow:0 0 0 3px rgba(0,98,65,0.4);"></div>`,
              iconAnchor: [7, 7],
            });
            (map as unknown as { _pickMarker: import("leaflet").Marker })._pickMarker =
              L.marker([lat, lng], { icon: pickIcon }).addTo(map);
          }
        });
      }

      mapRef.current = map;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      if (containerRef.current) {
        (containerRef.current as HTMLElement & { _leafletClaimed?: boolean })._leafletClaimed = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center if prop changes after mount
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  return (
    <div style={{ position: "relative", height, borderRadius, overflow: "hidden" }}>
      {/* Leaflet CSS */}
      <style>{`
        @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
        .leaflet-container { background: #e8eef3 !important; }
        .leaflet-tile-pane { filter: saturate(1.05); }
        .leaflet-control-attribution { background: rgba(255,255,255,0.75) !important; color: #64748b !important; font-size: 10px !important; }
        .leaflet-control-attribution a { color: #64748b !important; }
        .leaflet-control-zoom a { background: #ffffff !important; color: #14171E !important; border-color: rgba(20,23,30,0.12) !important; }
        .leaflet-control-zoom a:hover { background: #f1f5f9 !important; }
        .leaflet-popup-content-wrapper { background: #ffffff !important; border-radius: 12px !important; box-shadow: 0 8px 28px rgba(0,0,0,0.18) !important; }
        .leaflet-popup-tip { background: #ffffff !important; }
      `}</style>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Pick mode helper */}
      {pickMode && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(11,13,17,0.85)", backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "100px",
          padding: "6px 16px", fontSize: "12px", fontWeight: 600,
          color: picked ? "#dff9ba" : "#F2EDE6", fontFamily: "'Inter',sans-serif",
          zIndex: 1000, pointerEvents: "none", whiteSpace: "nowrap" as const,
        }}>
          {picked
            ? `📍 ${picked[0].toFixed(5)}, ${picked[1].toFixed(5)}`
            : "Click anywhere to drop a pin"}
        </div>
      )}
    </div>
  );
}
