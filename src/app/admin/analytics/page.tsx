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
  );
}
