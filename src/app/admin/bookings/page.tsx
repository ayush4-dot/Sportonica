"use client";

import { useState } from "react";
import { useVenue, useAdminBookings } from "@/lib/hooks/useAdminData";
import { CheckCircle2, XCircle, Search, User, MessageSquare, AlertTriangle, Clock, Loader2, MapPin } from "lucide-react";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

type FilterStatus = "all"|"confirmed"|"pending"|"waitlist"|"cancelled";

export default function BookingsPage() {
  const { venue, loading: vLoading } = useVenue();
  const { bookings, loading: bLoading, updateBooking } = useAdminBookings(venue?.id ?? null);

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  const loading = vLoading || bLoading;

  const filtered = bookings.filter(b => {
    const matchFilter = filter === "all" || b.status === filter;
    const matchSearch = !search ||
      (b.player_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.sport ?? "").toLowerCase().includes(search.toLowerCase()) ||
      b.id.includes(search);
    return matchFilter && matchSearch;
  });

  const counts = {
    all:       bookings.length,
    pending:   bookings.filter(b => b.status === "pending").length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    waitlist:  bookings.filter(b => b.status === "waitlist").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
  };

  const tabColors: Record<FilterStatus, string> = {
    all: paper, pending: flood, confirmed: "#22c55e", waitlist: "#60a5fa", cancelled: "#ef4444"
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading bookings…
    </div>
  );

  if (!venue) return (
    <p style={{ color: slate, padding: "20px" }}>Set up your venue first. <a href="/admin/venue" style={{ color: pink }}>Go to Venue →</a></p>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Bookings</h1>
          <p className="adm-page-sub">{bookings.length} total booking{bookings.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const, alignItems: "center" }}>
        {(["all","pending","confirmed","waitlist","cancelled"] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 16px", borderRadius: "100px", border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: "12px", fontFamily: "'Inter',sans-serif",
            background: filter === f ? `${tabColors[f]}18` : "rgba(255,255,255,0.04)",
            color: filter === f ? tabColors[f] : slate,
            outline: filter === f ? `1.5px solid ${tabColors[f]}44` : "1.5px solid transparent",
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "100px", padding: "1px 6px", fontSize: "10px" }}>
              {counts[f]}
            </span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", position: "relative" as const }}>
          <Search size={14} color={slate} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player or sport…"
            style={{ padding: "7px 14px 7px 32px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: "100px", color: paper, fontSize: "13px", fontFamily: "'Inter',sans-serif", outline: "none", width: "200px" }} />
        </div>
      </div>

      {/* Pending alert */}
      {counts.pending > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,201,60,0.08)", border: "1px solid rgba(255,201,60,0.2)", borderRadius: "12px", padding: "12px 16px" }}>
          <AlertTriangle size={15} color={flood} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: paper }}><strong style={{ color: flood }}>{counts.pending} booking{counts.pending > 1 ? "s" : ""}</strong> need your confirmation.</span>
          <button onClick={() => setFilter("pending")} style={{ marginLeft: "auto", background: "rgba(255,201,60,0.15)", border: "1px solid rgba(255,201,60,0.25)", color: flood, borderRadius: "8px", padding: "5px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Review</button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px", color: slate }}>
          {bookings.length === 0 ? "No bookings yet — they'll appear here once players book your slots." : "No bookings match this filter."}
        </div>
      ) : (
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr><th>Player</th><th>Sport</th><th>Court</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={12} color={slate} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{b.player_name ?? b.user_id.slice(0, 8) + "…"}</span>
                      </div>
                    </td>
                    <td style={{ color: flood }}>{b.sport ?? "—"}</td>
                    <td>
                      {b.court ? (
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(b.court + " Kathmandu")}`} target="_blank" rel="noopener noreferrer" style={{ color: slate, textDecoration: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                          <MapPin size={11} color={pink} />{b.court}
                        </a>
                      ) : <span style={{ color: slate }}>—</span>}
                    </td>
                    <td style={{ color: turf, fontWeight: 600 }}>Rs. {Number(b.amount).toLocaleString()}</td>
                    <td>
                      <span className={b.payment_status === "paid" ? "adm-badge adm-badge-green" : b.payment_status === "partial" ? "adm-badge adm-badge-yellow" : "adm-badge adm-badge-red"}>
                        {b.payment_status}
                      </span>
                    </td>
                    <td>
                      <span className={
                        b.status === "confirmed" ? "adm-badge adm-badge-green" :
                        b.status === "pending"   ? "adm-badge adm-badge-yellow" :
                        b.status === "waitlist"  ? "adm-badge adm-badge-blue" :
                        "adm-badge adm-badge-red"
                      }>{b.status}</span>
                    </td>
                    <td style={{ fontSize: "12px", color: slate }}>{new Date(b.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "5px" }}>
                        {b.status === "pending" && (
                          <>
                            <button onClick={() => updateBooking(b.id, { status: "confirmed" })} title="Confirm" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "6px", padding: "5px", cursor: "pointer", color: "#22c55e", display: "flex" }}>
                              <CheckCircle2 size={13} />
                            </button>
                            <button onClick={() => updateBooking(b.id, { status: "cancelled" })} title="Cancel" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", padding: "5px", cursor: "pointer", color: "#ef4444", display: "flex" }}>
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                        {b.status === "confirmed" && (
                          <button onClick={() => updateBooking(b.id, { status: "cancelled" })} title="Cancel" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "6px", padding: "5px", cursor: "pointer", color: "#ef4444", display: "flex" }}>
                            <XCircle size={13} />
                          </button>
                        )}
                        {b.status === "waitlist" && (
                          <button onClick={() => updateBooking(b.id, { status: "confirmed" })} title="Confirm from waitlist" style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: "6px", padding: "5px", cursor: "pointer", color: "#60a5fa", display: "flex" }}>
                            <CheckCircle2 size={13} />
                          </button>
                        )}
                        <button title="Message" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "5px", cursor: "pointer", color: slate, display: "flex" }}>
                          <MessageSquare size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waitlist */}
      {bookings.some(b => b.status === "waitlist") && (
        <div className="adm-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <Clock size={15} color="#60a5fa" />
            <span style={{ fontWeight: 700, fontSize: "14px", color: paper }}>Waitlist</span>
            <span style={{ fontSize: "12px", color: slate }}>— confirm manually or auto-fill when slot opens</span>
          </div>
          {bookings.filter(b => b.status === "waitlist").map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: inkMid, borderRadius: "10px", marginBottom: "8px" }}>
              <User size={14} color={slate} />
              <span style={{ fontWeight: 600, fontSize: "13px", flex: 1 }}>{b.player_name ?? b.user_id.slice(0, 8) + "…"}</span>
              <span style={{ fontSize: "12px", color: flood }}>{b.sport ?? "—"}</span>
              <button onClick={() => updateBooking(b.id, { status: "confirmed" })} className="adm-btn-primary" style={{ padding: "5px 12px", fontSize: "12px" }}>
                Confirm
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
