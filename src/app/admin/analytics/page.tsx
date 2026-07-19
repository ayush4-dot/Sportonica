<<<<<<< HEAD
import { Fragment } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyVenues, getCourtsForVenues } from "@/lib/admin/queries";
import type { CourtBooking } from "@/lib/admin/types";
import { DOW_LABELS } from "@/lib/admin/types";
import { Topbar, Stat, money } from "../ui";

export const dynamic = "force-dynamic";

const KTM_TZ = "Asia/Kathmandu";

export default async function AnalyticsPage() {
  const venues = await getMyVenues();
  const venueIds = venues.map((v) => v.id);
  const courts = await getCourtsForVenues(venueIds);

  const sb = await createClient();
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data } = venueIds.length
    ? await sb.from("court_bookings").select("*").in("venue_id", venueIds).gte("starts_at", since.toISOString())
    : { data: [] as CourtBooking[] };
  const bookings = (data as CourtBooking[]) ?? [];

  const active = bookings.filter((b) => !["cancelled", "refunded", "dropped"].includes(b.state));
  const revenue = active.reduce((s, b) => s + Number(b.price), 0);
  const noShows = bookings.filter((b) => b.state === "no_show").length;
  const noShowRate = bookings.length ? Math.round((noShows / bookings.length) * 100) : 0;

  // Occupancy heatmap: bookings per weekday × hour-band
  const HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
  const heat: number[][] = DOW_LABELS.map(() => HOURS.map(() => 0));
  let peak = 1;
  const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  active.forEach((b) => {
    const d = new Date(b.starts_at);
    const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: KTM_TZ });
    const dow = DOW_INDEX[wd] ?? 0;
    const hour = Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: KTM_TZ }).slice(0, 2));
    const band = HOURS.findIndex((h, i) => hour >= h && (i === HOURS.length - 1 || hour < HOURS[i + 1]));
    if (band >= 0) { heat[dow][band]++; peak = Math.max(peak, heat[dow][band]); }
  });

  // busiest slot
  let busiest = { dow: 0, band: 0, n: 0 };
  heat.forEach((row, d) => row.forEach((n, b) => { if (n > busiest.n) busiest = { dow: d, band: b, n }; }));

  return (
    <>
      <Topbar title="Analytics" crumb="MONEY / LAST 30 DAYS" />
      <div className="adm-body">
        {venueIds.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty-icon"><BarChart3 size={22} /></div>
            <h3>No data yet</h3>
            <p>Analytics appear once you've taken some bookings. Come back after your first games.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        ) : (
          <>
            <div className="adm-stats">
              <Stat label="Bookings (30d)" value={active.length} accent="var(--a-sodium)" />
              <Stat label="Revenue (30d)" value={money(revenue)} accent="var(--a-lime)" />
              <Stat label="Courts live" value={courts.length} accent="var(--a-turf)" />
              <Stat label="No-show rate" value={`${noShowRate}%`} accent={noShowRate > 15 ? "var(--a-pink)" : "var(--a-sky)"} />
            </div>

            {busiest.n > 0 && (
              <div className="adm-card" style={{ marginBottom: 18, borderColor: "rgba(255,201,60,0.2)" }}>
                <div style={{ fontSize: 13.5 }}>
                  <span style={{ fontWeight: 600 }}>Your goldmine:</span>{" "}
                  <span className="adm-mono" style={{ color: "var(--a-sodium)" }}>
                    {DOW_LABELS[busiest.dow]} {String(HOURS[busiest.band]).padStart(2, "0")}:00
                  </span>{" "}
                  <span className="adm-dim">is your busiest slot — {busiest.n} booking{busiest.n !== 1 ? "s" : ""} in the last month.</span>
                </div>
              </div>
            )}

            <div className="adm-card">
              <div className="adm-card-t">Occupancy heatmap</div>
              <div className="adm-card-sub">Bookings by day and time. Darker sodium = busier.</div>
              <div className="adm-heat">
                <div></div>
                {HOURS.map((h) => <div key={h} style={{ textAlign: "center", color: "var(--a-faint)" }}>{h}</div>)}
                {DOW_LABELS.map((label, d) => (
                  <Fragment key={d}>
                    <div style={{ display: "flex", alignItems: "center", color: "var(--a-faint)" }}>{label}</div>
                    {HOURS.map((_, b) => {
                      const n = heat[d][b];
                      const intensity = n / peak;
                      return (
                        <div key={`${d}-${b}`} className="adm-heat-cell"
                          title={`${label} ${HOURS[b]}:00 — ${n} booking${n !== 1 ? "s" : ""}`}
                          style={{
                            background: n === 0 ? "var(--a-panel-2)" : `rgba(255,201,60,${0.12 + intensity * 0.7})`,
                            display: "grid", placeItems: "center",
                            color: intensity > 0.5 ? "#0B0D11" : "var(--a-dim)",
                            fontWeight: 600,
                          }}>
                          {n || ""}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
=======
"use client";

import { useMemo, useState } from "react";
import { useVenue, useAdminBookings, useSlots } from "@/lib/hooks/useAdminData";
import { BarChart3, TrendingUp, Users, RefreshCw, Loader2 } from "lucide-react";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

function HorizBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ flex: 1, height, background: "rgba(255,255,255,0.07)", borderRadius: "100px", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: "100px", transition: "width 0.5s ease" }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<"7d"|"30d"|"90d">("30d");
  const { venue, loading: vLoading } = useVenue();
  const { bookings, loading: bLoading } = useAdminBookings(venue?.id ?? null);
  const { slots, loading: sLoading } = useSlots(venue?.id ?? null);

  const loading = vLoading || bLoading || sLoading;

  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d.toISOString();
  }, [rangeDays]);

  const recent = useMemo(() => bookings.filter(b => b.created_at >= cutoff), [bookings, cutoff]);

  // Fill rate by sport
  const sportFill = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of recent) {
      if (b.sport) map[b.sport] = (map[b.sport] ?? 0) + 1;
    }
    const total = recent.length || 1;
    return Object.entries(map)
      .map(([sport, count]) => ({ sport, rate: Math.round((count / total) * 100) }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 6);
  }, [recent]);

  // Peak hours
  const peakHours = useMemo(() => {
    const map: Record<number, number> = {};
    for (const b of recent) {
      const h = new Date(b.created_at).getHours();
      map[h] = (map[h] ?? 0) + 1;
    }
    const max = Math.max(...Object.values(map), 1);
    return Array.from({ length: 17 }, (_, i) => i + 6).map(h => ({
      hour: h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`,
      fill: Math.round(((map[h] ?? 0) / max) * 100),
    }));
  }, [recent]);

  // Player retention
  const retention = useMemo(() => {
    const userCounts: Record<string, number> = {};
    for (const b of bookings) userCounts[b.user_id] = (userCounts[b.user_id] ?? 0) + 1;
    const users = Object.values(userCounts);
    const total = users.length || 1;
    return {
      newPlayers:  Math.round((users.filter(c => c === 1).length / total) * 100),
      returning:   Math.round((users.filter(c => c >= 2 && c <= 5).length / total) * 100),
      regulars:    Math.round((users.filter(c => c > 5).length / total) * 100),
      totalUnique: users.length,
    };
  }, [bookings]);

  // Cancellation rate
  const cancelRate = recent.length > 0
    ? Math.round((recent.filter(b => b.status === "cancelled").length / recent.length) * 100)
    : 0;

  // Avg fill rate (slots booked / total slots)
  const avgFillRate = slots.length > 0
    ? Math.round((slots.filter(s => s.status === "booked").length / slots.length) * 100)
    : 0;

  const sportColors = [turf, flood, pink, "#3b82f6", "#a855f7", "#f97316"];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading analytics…
    </div>
  );

  if (!venue) return <p style={{ color: slate, padding: "20px" }}>Set up your venue first. <a href="/admin/venue" style={{ color: pink }}>Go to Venue →</a></p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Analytics</h1>
          <p className="adm-page-sub">Performance insights from {recent.length} booking{recent.length !== 1 ? "s" : ""} in the last {range}.</p>
        </div>
        <div style={{ display: "flex", background: inkMid, borderRadius: "8px", padding: "3px", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["7d","30d","90d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: "5px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700, fontFamily: "'Inter',sans-serif", background: range === r ? "rgba(255,255,255,0.1)" : "transparent", color: range === r ? paper : slate }}>{r}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="adm-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px" }}>
        {[
          { label: "Avg slot fill rate",  value: `${avgFillRate}%`,          color: turf,     icon: BarChart3  },
          { label: "Unique players",      value: String(retention.totalUnique), color: "#60a5fa", icon: Users    },
          { label: "Repeat player rate",  value: `${retention.returning + retention.regulars}%`, color: flood, icon: RefreshCw },
          { label: "Cancellation rate",   value: `${cancelRate}%`,            color: pink,     icon: TrendingUp },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="adm-stat-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} color={s.color} />
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: paper, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-1px", marginBottom: "4px" }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: slate }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Two col: fill by sport + peak hours */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

        <div className="adm-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <BarChart3 size={15} color={flood} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Bookings by Sport</span>
          </div>
          {sportFill.length === 0 ? (
            <p style={{ color: slate, fontSize: "13px" }}>No booking data yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {sportFill.map((s, i) => (
                <div key={s.sport}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: paper }}>{s.sport}</span>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: sportColors[i % sportColors.length], fontFamily: "'JetBrains Mono',monospace" }}>{s.rate}%</span>
                  </div>
                  <HorizBar pct={s.rate} color={sportColors[i % sportColors.length]} height={8} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="adm-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
            <TrendingUp size={15} color={pink} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Booking Activity by Hour</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "120px" }}>
            {peakHours.map((h, i) => {
              const isPeak = h.fill >= 70;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", height: "100%" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    <div style={{ width: "100%", borderRadius: "3px 3px 0 0", height: `${h.fill || 2}%`, background: isPeak ? pink : `${turf}88`, minHeight: "3px" }} title={h.hour} />
                  </div>
                  {i % 4 === 0 && <span style={{ fontSize: "8px", color: slate, whiteSpace: "nowrap" as const }}>{h.hour}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: pink }} />
              <span style={{ fontSize: "11px", color: slate }}>Peak</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: `${turf}88` }} />
              <span style={{ fontSize: "11px", color: slate }}>Normal</span>
            </div>
          </div>
        </div>

      </div>

      {/* Player retention */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <Users size={15} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Player Retention</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
          {[
            { label: "New players (1 booking)",    value: retention.newPlayers,  color: "#60a5fa" },
            { label: "Returning (2–5 bookings)",   value: retention.returning,   color: turf      },
            { label: "Regulars (6+ bookings)",     value: retention.regulars,    color: flood     },
          ].map(s => (
            <div key={s.label} style={{ background: inkMid, borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: "6px" }}>{s.value}%</div>
              <div style={{ fontSize: "12px", color: slate, marginBottom: "10px" }}>{s.label}</div>
              <HorizBar pct={s.value} color={s.color} height={5} />
            </div>
          ))}
        </div>
      </div>

    </div>
>>>>>>> f7ffbe7b879f70291023e1d0f4280bb6ad38dbf8
  );
}
