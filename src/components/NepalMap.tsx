"use client";

/**
 * NepalMap — stylised SVG map of Nepal's provinces for /discover.
 *
 * Loads a GeoJSON from /public (default: /nepal-provinces.geojson), projects
 * it to SVG space, draws each province as a flat path, drops a glowing pin at
 * each province centroid, and shows a dark tooltip card on hover.
 *
 * Add a provinces GeoJSON to your public folder, e.g. from
 * https://github.com/mesaugat/geoJSON-Nepal (nepal-states.geojson),
 * renamed to public/nepal-provinces.geojson.
 *
 * Pass `counts` to show real games-per-province; the province name key is
 * matched case-insensitively against the GeoJSON feature name.
 */

import { useEffect, useRef, useState } from "react";

type FeatureLike = {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

interface Props {
  /** Path to the GeoJSON in /public */
  src?: string;
  /** Games per province, keyed by province name (case-insensitive). */
  counts?: Record<string, number>;
  /** Raw game points [lng,lat]; bucketed into provinces automatically. */
  points?: [number, number][];
  /** Accent used for pins and the tooltip bar. */
  accent?: string;
  height?: number;
  /** Called when a province is clicked, with its name and geographic center [lat,lng]. */
  onProvinceClick?: (name: string, center: [number, number]) => void;
}

// Ray-casting point-in-polygon test against a single ring ([lng,lat] pairs)
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const NAME_KEYS = ["PROVINCE", "Province", "province", "STATE", "State", "state", "ADM1_EN", "NAME_1", "name", "NAME"];

function featureName(f: FeatureLike): string {
  for (const k of NAME_KEYS) {
    const v = f.properties?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Province";
}

// Collect [lng,lat] rings from Polygon / MultiPolygon
function ringsOf(geom: FeatureLike["geometry"]): number[][][] {
  const out: number[][][] = [];
  if (geom.type === "Polygon") {
    (geom.coordinates as number[][][]).forEach((r) => out.push(r));
  } else if (geom.type === "MultiPolygon") {
    (geom.coordinates as number[][][][]).forEach((poly) => poly.forEach((r) => out.push(r)));
  }
  return out;
}

export default function NepalMap({
  src = "/nepal-provinces.geojson",
  counts = {},
  points = [],
  accent = "#006241",
  height = 420,
  onProvinceClick,
}: Props) {
  const [features, setFeatures] = useState<FeatureLike[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; games: number; pct: number } | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => { if (!r.ok) throw new Error(`Map file not found (${r.status})`); return r.json(); })
      .then((gj) => { if (alive) setFeatures(gj.features ?? []); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [src]);

  // ── Projection: fit to WIDTH, derive height from Nepal's real aspect ratio ──
  const W = 680, PAD = 20;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  features.forEach((f) => ringsOf(f.geometry).forEach((ring) => ring.forEach(([lng, lat]) => {
    if (lng < minX) minX = lng; if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
  })));
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  // Fit to width; height follows the shape's true ratio (Nepal is wide + short).
  const scale = (W - PAD * 2) / spanX;
  const H = features.length ? spanY * scale + PAD * 2 : height;
  const offX = PAD, offY = PAD;
  const px = (lng: number) => offX + (lng - minX) * scale;
  const py = (lat: number) => offY + (maxY - lat) * scale; // flip Y

  const pathFor = (f: FeatureLike) =>
    ringsOf(f.geometry).map((ring) =>
      ring.map(([lng, lat], i) => `${i === 0 ? "M" : "L"}${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join("") + "Z"
    ).join("");

  const centroidFor = (f: FeatureLike): [number, number] => {
    let sx = 0, sy = 0, n = 0;
    ringsOf(f.geometry).forEach((ring) => ring.forEach(([lng, lat]) => { sx += px(lng); sy += py(lat); n++; }));
    return n ? [sx / n, sy / n] : [W / 2, H / 2];
  };

  // Bucket raw points into provinces (point-in-polygon), merge with explicit counts.
  const pointCounts: Record<string, number> = {};
  if (points.length && features.length) {
    points.forEach(([lng, lat]) => {
      const hit = features.find((f) => ringsOf(f.geometry).some((ring) => inRing(lng, lat, ring)));
      if (hit) { const n = featureName(hit); pointCounts[n] = (pointCounts[n] ?? 0) + 1; }
    });
  }
  const mergedCounts: Record<string, number> = { ...pointCounts };
  Object.keys(counts).forEach((k) => { mergedCounts[k] = (mergedCounts[k] ?? 0) + counts[k]; });

  const gamesFor = (name: string) => {
    const key = Object.keys(mergedCounts).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? mergedCounts[key] : 0;
  };
  const maxGames = Math.max(1, ...Object.values(mergedCounts));

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <style>{`
        @keyframes np-pulse { 0%,100%{ r:12; opacity:.28 } 50%{ r:19; opacity:.1 } }
        .np-prov { fill:#8b93b0; stroke:#fff; stroke-width:1; transition:fill .2s; cursor:pointer; }
        .np-prov:hover { fill:#fff; }
        [data-theme="paper"] .np-prov { fill:#9aa2bd; stroke:#fff; }
      `}</style>

      {error && (
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8, color: "var(--faint, #8b93b0)", fontSize: 14, textAlign: "center", padding: 20 }}>
          <span>Couldn&apos;t load the Nepal map.</span>
          <span style={{ fontSize: 12 }}>Add <code>public/nepal-provinces.geojson</code> — {error}</span>
        </div>
      )}

      {!error && (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Map of Nepal's provinces">
          <g>
            {features.map((f, i) => (
              <path key={i} className="np-prov" d={pathFor(f)}
                onMouseEnter={() => {
                  const name = featureName(f);
                  const g = gamesFor(name);
                  setHover({ name, games: g, pct: Math.round((g / maxGames) * 100) });
                }}
                onMouseMove={(e) => {
                  const r = wrapRef.current?.getBoundingClientRect();
                  if (!r) return;
                  let x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
                  if (x + 236 > r.width) x = e.clientX - r.left - 252;
                  if (y + 190 > r.height) y = r.height - 200;
                  setTipPos({ x: Math.max(0, x), y: Math.max(0, y) });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  const name = featureName(f);
                  // geographic centroid in [lat,lng]
                  let sx = 0, sy = 0, n = 0;
                  ringsOf(f.geometry).forEach((ring) => ring.forEach(([lng, lat]) => { sx += lng; sy += lat; n++; }));
                  const center: [number, number] = n ? [sy / n, sx / n] : [27.7, 85.3];
                  if (onProvinceClick) onProvinceClick(name, center);
                }}
              />
            ))}
          </g>
          <g fill="none">
            {features.map((f, i) => {
              const [cx, cy] = centroidFor(f);
              return (
                <g key={`p${i}`} style={{ pointerEvents: "none" }}>
                  <circle cx={cx} cy={cy} r={12} fill={accent} opacity={0.22}
                    style={{ animation: `np-pulse ${2.2 + (i % 3) * 0.3}s ease-in-out infinite` }} />
                  <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={accent} strokeWidth={2.5} />
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {hover && (
        <div style={{
          position: "absolute", left: tipPos.x, top: tipPos.y, width: 236, pointerEvents: "none", zIndex: 10,
          background: "#111317", borderRadius: 16, padding: "16px 18px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{hover.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8b93b0", marginBottom: 12 }}>
            Nepal
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 10 }}>
            {hover.games} active game{hover.games === 1 ? "" : "s"}
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "#2a2d34", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${hover.pct}%`, background: accent, borderRadius: 3, transition: "width .3s" }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#8b93b0", marginTop: 5 }}>{hover.pct}%</div>
        </div>
      )}
    </div>
  );
}
