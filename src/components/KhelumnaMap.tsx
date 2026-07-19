"use client";

/**
 * KhelumnaMap — shared Leaflet map used across:
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
  height?: string;
  borderRadius?: string;
}

// Kathmandu city centre default
const KTM: [number, number] = [27.7172, 85.324];

const SPORT_COLORS: Record<string, string> = {
  Futsal:     "#2E7D5B",
  Football:   "#22c55e",
  Basketball: "#FFC93C",
  Cricket:    "#f97316",
  Volleyball: "#3b82f6",
  Badminton:  "#a855f7",
  Tennis:     "#ec4899",
};

export default function KhelumnaMap({
  center = KTM,
  zoom = 14,
  pins = [],
  pickMode = false,
  onPick,
  height = "100%",
  borderRadius = "0",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialised

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

if (containerRef.current && (containerRef.current as any)._leaflet_id) return;

      const map = L.map(containerRef.current!, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      // Dark-styled OSM tile layer (CartoDB Dark Matter — free, no key)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      // Add pins
      pins.forEach(pin => {
        const color = pin.flash ? "#E85D24" : (pin.color ?? SPORT_COLORS[pin.sport ?? ""] ?? "#DE3163");
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

        L.marker([pin.lat, pin.lng], { icon: svgIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#1e293b;">
              ${pin.label}${pin.sport ? `<br><span style="color:${color};font-weight:700">${pin.sport}</span>` : ""}
            </div>
          `);
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
              html: `<div style="width:14px;height:14px;border-radius:50%;background:#DE3163;border:3px solid #fff;box-shadow:0 0 0 3px rgba(222,49,99,0.4);"></div>`,
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
        .leaflet-container { background: #0B0D11 !important; }
        .leaflet-tile-pane { filter: brightness(0.9) saturate(0.85); }
        .leaflet-control-attribution { background: rgba(11,13,17,0.7) !important; color: #8A95A3 !important; font-size: 10px !important; }
        .leaflet-control-attribution a { color: #8A95A3 !important; }
        .leaflet-control-zoom a { background: #13161C !important; color: #F2EDE6 !important; border-color: rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a:hover { background: #1C2029 !important; }
        .leaflet-popup-content-wrapper { background: #F2EDE6 !important; border-radius: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important; }
        .leaflet-popup-tip { background: #F2EDE6 !important; }
      `}</style>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Pick mode helper */}
      {pickMode && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(11,13,17,0.85)", backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "100px",
          padding: "6px 16px", fontSize: "12px", fontWeight: 600,
          color: picked ? "#DE3163" : "#F2EDE6", fontFamily: "'Inter',sans-serif",
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
