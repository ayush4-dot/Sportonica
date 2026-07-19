<<<<<<< HEAD
import Link from "next/link";
import { Building2, Plus, CalendarClock } from "lucide-react";
import { getMyVenues, getCourtsForVenues, getUpcomingBookings } from "@/lib/admin/queries";
import { Topbar, Stat, BookingBadge, money, timeRange, dayLabel, VerifyBadge } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const venues = await getMyVenues();
  const venueIds = venues.map((v) => v.id);
  const courts = await getCourtsForVenues(venueIds);
  const upcoming = await getUpcomingBookings(venueIds, 8);

  const todayStr = new Date().toDateString();
  const todays = upcoming.filter((b) => new Date(b.starts_at).toDateString() === todayStr);
  const todayRevenue = todays
    .filter((b) => !["cancelled", "refunded", "dropped"].includes(b.state))
    .reduce((s, b) => s + Number(b.price), 0);

  if (venues.length === 0) {
    return (
      <>
        <Topbar title="Overview" crumb="KHELUM NA / CONSOLE" />
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><Building2 size={22} /></div>
            <h3>Add your first venue</h3>
            <p>Set up your ground, add courts and opening hours, and start taking bookings. It takes about two minutes.</p>
            <Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Overview"
        crumb="KHELUM NA / CONSOLE"
        action={<Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>}
      />
      <div className="adm-body">
        <div className="adm-stats">
          <Stat label="Venues" value={venues.length} accent="var(--a-sodium)" />
          <Stat label="Courts" value={courts.length} accent="var(--a-turf)" />
          <Stat label="Today's games" value={todays.length} accent="var(--a-sky)" />
          <Stat label="Today's revenue" value={money(todayRevenue)} accent="var(--a-lime)" />
        </div>

        <div className="adm-grid-2" style={{ alignItems: "start" }}>
          {/* Upcoming bookings */}
          <div className="adm-card">
            <div className="adm-between" style={{ marginBottom: 4 }}>
              <div>
                <div className="adm-card-t">Upcoming bookings</div>
                <div className="adm-card-sub">Next games across your venues</div>
              </div>
              <Link href="/admin/bookings" className="adm-btn sm ghost">View all</Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="adm-dim" style={{ fontSize: 13, padding: "20px 0" }}>
                No upcoming bookings yet. They'll appear here as players book.
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>When</th><th>Court</th><th>Customer</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {upcoming.map((b) => {
                    const court = courts.find((c) => c.id === b.court_id);
                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{dayLabel(b.starts_at)}</div>
                          <div className="adm-num adm-dim" style={{ fontSize: 11 }}>{timeRange(b.starts_at, b.ends_at)}</div>
                        </td>
                        <td>{court?.name ?? "—"}<div className="adm-dim" style={{ fontSize: 11 }}>{court?.sport}</div></td>
                        <td>{b.customer_name ?? "Player"}</td>
                        <td className="adm-num">{money(Number(b.price))}</td>
                        <td><BookingBadge state={b.state} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Venue health */}
          <div className="adm-card">
            <div className="adm-card-t">Your venues</div>
            <div className="adm-card-sub">Verification & status</div>
            {venues.map((v) => {
              const vCourts = courts.filter((c) => c.venue_id === v.id);
              return (
                <Link
                  key={v.id}
                  href={`/admin/venues/${v.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="adm-between" style={{
                    padding: "14px 0", borderBottom: "1px solid var(--a-line)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</div>
                      <div className="adm-dim" style={{ fontSize: 12 }}>
                        {vCourts.length} court{vCourts.length !== 1 ? "s" : ""} · {v.venue_type}
                      </div>
                    </div>
                    <VerifyBadge status={v.verification_status} />
                  </div>
                </Link>
              );
            })}
            {venues.some((v) => v.verification_status === "unverified") && (
              <div style={{ marginTop: 14, fontSize: 12 }} className="adm-dim">
                <CalendarClock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                Unverified venues can still take bookings, with a payout cap until verified.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
=======
"use client";

import { useVenue, useAdminBookings, useSlots } from "@/lib/hooks/useAdminData";
import {
  TrendingUp, Users, CalendarDays, DollarSign,
  Zap, ArrowUpRight, Clock, CheckCircle2, XCircle,
  AlertCircle, Building2, Loader2, MapPin,
} from "lucide-react";
import KhelumnaMap from "@/components/KhelumnaMap";

const inkMid = "#1C2029";
const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";

function FillBar({ fill, cap, color }: { fill: number; cap: number; color: string }) {
  const pct = cap > 0 ? Math.round((fill / cap) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "4px" }} />
      </div>
      <span style={{ fontSize: "12px", color: slate, fontFamily: "'JetBrains Mono',monospace", minWidth: "36px" }}>{fill}/{cap}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "adm-badge adm-badge-green",
    pending:   "adm-badge adm-badge-yellow",
    waitlist:  "adm-badge adm-badge-blue",
    cancelled: "adm-badge adm-badge-red",
  };
  return <span className={map[status] ?? "adm-badge adm-badge-slate"}>{status}</span>;
}

export default function AdminOverview() {
  const { venue, loading: vLoading } = useVenue();
  const { bookings, loading: bLoading, updateBooking } = useAdminBookings(venue?.id ?? null);
  const { slots, loading: sLoading } = useSlots(venue?.id ?? null);

  const loading = vLoading || bLoading || sLoading;

  // Derived stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayBookings = bookings.filter(b => b.created_at.startsWith(todayStr));
  const todayRevenue  = todayBookings.reduce((s, b) => s + Number(b.amount || 0), 0);
  const pendingCount  = bookings.filter(b => b.status === "pending").length;

  // Today's slots from court_slots
  const now = new Date();
  const todaySlots = slots.filter(s => {
    const d = new Date(s.start_time);
    return d.toISOString().slice(0, 10) === todayStr && new Date(s.end_time) > now;
  }).slice(0, 4);

  const recentBookings = bookings.slice(0, 5);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh", gap: "10px", color: slate }}>
      <Loader2 size={20} style={{ animation: "spin-slow 1s linear infinite" }} />
      <span>Loading dashboard…</span>
    </div>
  );

  // No venue yet
  if (!venue) return (
    <div style={{ textAlign: "center", padding: "64px 24px" }}>
      <Building2 size={40} color={slate} style={{ margin: "0 auto 16px", display: "block" }} />
      <h2 style={{ fontSize: "20px", fontWeight: 800, color: paper, marginBottom: "8px", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
        No venue set up yet
      </h2>
      <p style={{ color: slate, marginBottom: "24px" }}>Add your venue details to start managing bookings.</p>
      <a href="/admin/venue">
        <button className="adm-btn-primary">Set up venue →</button>
      </a>
    </div>
  );

  const stats = [
    { label: "Today's Revenue",  value: `Rs. ${todayRevenue.toLocaleString()}`, icon: DollarSign,   color: turf   },
    { label: "Bookings Today",   value: String(todayBookings.length),           icon: CalendarDays, color: "#60a5fa" },
    { label: "Pending Review",   value: String(pendingCount),                   icon: AlertCircle,  color: flood  },
    { label: "Total Bookings",   value: String(bookings.length),                icon: TrendingUp,   color: pink   },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* Header */}
      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Good morning 👋</h1>
          <p className="adm-page-sub">{venue.name} — {venue.status}</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <a href="/admin/flash">
            <button className="adm-btn-primary" style={{ background: "#E85D24", boxShadow: "0 4px 16px rgba(232,93,36,0.35)" }}>
              <Zap size={15} fill="#fff" /> New Flash Match
            </button>
          </a>
          <a href="/admin/slots">
            <button className="adm-btn-secondary"><CalendarDays size={15} /> Add Slot</button>
          </a>
        </div>
      </div>

      {/* Stat cards */}
      <div className="adm-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="adm-stat-card" style={{ animation: "slideUp 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={s.color} />
                </div>
              </div>
              <div style={{ fontSize: "26px", fontWeight: 800, color: paper, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-1px", marginBottom: "4px" }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: slate }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Two-col: today's slots + quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px" }}>

        {/* Today's slots */}
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Today&apos;s Slots</span>
            <a href="/admin/slots" style={{ fontSize: "12px", color: pink, textDecoration: "none", fontWeight: 600 }}>View all →</a>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {todaySlots.length === 0 ? (
              <p style={{ color: slate, fontSize: "13px", padding: "12px 0" }}>No slots scheduled for today. <a href="/admin/slots" style={{ color: pink }}>Add some →</a></p>
            ) : todaySlots.map(slot => {
              const start = new Date(slot.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const end   = new Date(slot.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const color = slot.status === "booked" ? pink : slot.status === "blocked" ? slate : turf;
              return (
                <div key={slot.id} style={{ display: "grid", gridTemplateColumns: "130px 70px 90px 1fr 80px", alignItems: "center", gap: "12px", padding: "10px 12px", background: inkMid, borderRadius: "10px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: paper, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" as const }}>{start}–{end}</span>
                  <span style={{ fontSize: "12px", color: slate }}>{slot.court_number}</span>
                  <span style={{ fontSize: "12px", color: flood, fontWeight: 600 }}>{slot.sport}</span>
                  <FillBar fill={0} cap={10} color={color} />
                  <span className={`adm-badge ${slot.status === "booked" ? "adm-badge-blue" : slot.status === "blocked" ? "adm-badge-red" : "adm-badge-green"}`}>{slot.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { label: "Venue status",     sub: venue.status,               icon: Building2,   color: turf,      href: "/admin/venue"    },
            { label: "Pending bookings", sub: `${pendingCount} need review`, icon: AlertCircle, color: flood,   href: "/admin/bookings" },
            { label: "Revenue today",    sub: `Rs. ${todayRevenue.toLocaleString()}`, icon: DollarSign, color: "#60a5fa", href: "/admin/revenue" },
            { label: "Flash match",      sub: "Manage flash",             icon: Zap,         color: "#E85D24", href: "/admin/flash"    },
          ].map(item => {
            const Icon = item.icon;
            return (
              <a key={item.label} href={item.href} style={{ textDecoration: "none" }}>
                <div className="adm-stat-card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", cursor: "pointer" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: `${item.color}18`, border: `1px solid ${item.color}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} color={item.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: paper }}>{item.label}</div>
                    <div style={{ fontSize: "12px", color: slate, marginTop: "2px", textTransform: "capitalize" as const }}>{item.sub}</div>
                  </div>
                  <ArrowUpRight size={14} color={slate} style={{ marginLeft: "auto" }} />
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Recent bookings */}
      <div className="adm-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Recent Bookings</span>
          <a href="/admin/bookings" style={{ fontSize: "12px", color: pink, textDecoration: "none", fontWeight: 600 }}>View all →</a>
        </div>
        {recentBookings.length === 0 ? (
          <p style={{ color: slate, fontSize: "13px", padding: "20px" }}>No bookings yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr><th>Player</th><th>Sport</th><th>Court</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {recentBookings.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.player_name ?? b.user_id.slice(0, 8) + "…"}</td>
                    <td style={{ color: flood }}>{b.sport ?? "—"}</td>
                    <td style={{ color: slate }}>{b.court ?? "—"}</td>
                    <td style={{ color: turf, fontWeight: 600 }}>Rs. {Number(b.amount).toLocaleString()}</td>
                    <td><span className={b.payment_status === "paid" ? "adm-badge adm-badge-green" : b.payment_status === "partial" ? "adm-badge adm-badge-yellow" : "adm-badge adm-badge-red"}>{b.payment_status}</span></td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      {b.status === "pending" && (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => updateBooking(b.id, { status: "confirmed" })} style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "#22c55e", display: "flex" }}><CheckCircle2 size={13} /></button>
                          <button onClick={() => updateBooking(b.id, { status: "cancelled" })} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", padding: "4px 6px", cursor: "pointer", color: "#ef4444", display: "flex" }}><XCircle size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alerts */}
      {pendingCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,201,60,0.08)", border: "1px solid rgba(255,201,60,0.2)", borderRadius: "12px", padding: "12px 16px" }}>
          <Clock size={15} color={flood} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: paper }}><strong style={{ color: flood }}>{pendingCount} booking{pendingCount > 1 ? "s" : ""}</strong> awaiting your confirmation.</span>
          <a href="/admin/bookings" style={{ marginLeft: "auto" }}>
            <button style={{ background: "rgba(255,201,60,0.15)", border: "1px solid rgba(255,201,60,0.25)", color: flood, borderRadius: "8px", padding: "5px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Review</button>
          </a>
        </div>
      )}

      {/* Venue map */}
      {venue.lat && venue.lng && (
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MapPin size={15} color={pink} />
              <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>{venue.name}</span>
              <span style={{ fontSize: "12px", color: slate }}>{venue.address}</span>
            </div>
            <a href={`https://www.google.com/maps/search/${encodeURIComponent((venue.address ?? "") + " Kathmandu")}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "12px", color: pink, textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
              Open in Google Maps ↗
            </a>
          </div>
          <KhelumnaMap
            center={[venue.lat, venue.lng]}
            zoom={15}
            height="220px"
            borderRadius="0"
            pins={[{ id: "venue", lat: venue.lat, lng: venue.lng, label: venue.name, color: pink }]}
          />
        </div>
      )}

    </div>
>>>>>>> f7ffbe7b879f70291023e1d0f4280bb6ad38dbf8
  );
}
