"use client";

import { useState, useTransition } from "react";
import { setVenueBookingStatus } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, type TournamentStatus } from "@/lib/tournaments/types";

type Row = { id: string; name: string; status: string; venue_booking_status: string; starts_at: string; venue_name: string };

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: "neutral", pending_approval: "warn", published: "ok", registration_open: "ok",
  registration_closed: "warn", live: "ok", completed: "neutral", cancelled: "danger",
};
const BOOKING_BADGE: Record<string, string> = { pending: "warn", confirmed: "ok", declined: "danger" };

export default function VenueBookingsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function respond(id: string, status: "confirmed" | "declined") {
    setErr(null);
    startTransition(async () => {
      const res = await setVenueBookingStatus(id, status);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, venue_booking_status: status } : r)));
    });
  }

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, opacity: 0.6 }}>Nothing scheduled at your venue yet.</p>;
  }

  return (
    <div>
      {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <table className="adm-table">
        <thead><tr><th>Tournament</th><th>Venue</th><th>Starts</th><th>Status</th><th>Booking</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td className="adm-dim">{r.venue_name}</td>
              <td className="adm-num adm-dim" style={{ fontSize: 12 }}>
                {new Date(r.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </td>
              <td><span className={`adm-badge ${STATUS_BADGE[r.status as TournamentStatus] ?? "neutral"}`}>{STATUS_LABELS[r.status as TournamentStatus] ?? r.status}</span></td>
              <td><span className={`adm-badge ${BOOKING_BADGE[r.venue_booking_status] ?? "neutral"}`}>{r.venue_booking_status}</span></td>
              <td>
                {r.venue_booking_status === "pending" && r.status === "draft" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="adm-btn sm primary" disabled={pending} onClick={() => respond(r.id, "confirmed")}>Confirm</button>
                    <button className="adm-btn sm" disabled={pending} onClick={() => respond(r.id, "declined")}>Decline</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
