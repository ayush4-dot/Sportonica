"use client";

import { useState, useTransition } from "react";
import { Check, Clock, X as XIcon, CalendarCheck } from "lucide-react";
import { setVenueBookingStatus } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, type TournamentStatus } from "@/lib/tournaments/types";

type Row = { id: string; name: string; status: string; venue_booking_status: string; starts_at: string; venue_name: string };

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: "neutral", pending_approval: "warn", published: "ok", registration_open: "ok",
  registration_closed: "warn", live: "ok", completed: "neutral", cancelled: "danger",
};
// Plain words, not the DB column name — a Vendor confirms whether they're
// hosting, they never see "venue_booking_status".
const BOOKING_LABEL: Record<string, string> = { pending: "Needs your answer", confirmed: "You're hosting", declined: "You declined" };
const BOOKING_BADGE: Record<string, string> = { pending: "warn", confirmed: "ok", declined: "danger" };
const BOOKING_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={12} />, confirmed: <Check size={12} />, declined: <XIcon size={12} />,
};

export default function VenueBookingsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function respond(id: string, status: "confirmed" | "declined", name: string) {
    setErr(null);
    setConfirmMsg(null);
    startTransition(async () => {
      const res = await setVenueBookingStatus(id, status);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, venue_booking_status: status } : r)));
      setConfirmMsg(status === "confirmed" ? `You're hosting "${name}".` : `Declined "${name}".`);
      setTimeout(() => setConfirmMsg(null), 4000);
    });
  }

  function decline(id: string, name: string) {
    if (!window.confirm(`Decline "${name}"? The organizer will need to pick a different venue — this can't be undone.`)) return;
    respond(id, "declined", name);
  }

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 12px" }}>
        <CalendarCheck size={22} style={{ opacity: 0.35, marginBottom: 8 }} />
        <p style={{ fontSize: 13.5, opacity: 0.65, margin: 0 }}>
          Nothing proposed yet — when an organizer sets up a tournament at your venue, it&apos;ll show up here for you to confirm.
        </p>
      </div>
    );
  }

  return (
    <div>
      {err && <div role="alert" style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {confirmMsg && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          <Check size={14} /> {confirmMsg}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--a-line, rgba(128,128,128,.25))", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.name}</div>
                <div className="adm-dim" style={{ fontSize: 12, marginTop: 2 }}>
                  {r.venue_name} · {new Date(r.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className={`adm-badge ${STATUS_BADGE[r.status as TournamentStatus] ?? "neutral"}`}>{STATUS_LABELS[r.status as TournamentStatus] ?? r.status}</span>
                <span className={`adm-badge ${BOOKING_BADGE[r.venue_booking_status] ?? "neutral"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {BOOKING_ICON[r.venue_booking_status]} {BOOKING_LABEL[r.venue_booking_status] ?? r.venue_booking_status}
                </span>
              </div>
            </div>

            {r.venue_booking_status === "pending" && r.status === "draft" && (
              <>
                <p style={{ fontSize: 13, opacity: 0.7, margin: "8px 0 12px" }}>
                  Confirm if you&apos;re happy to host this — the organizer can&apos;t submit it for review until you do.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="adm-btn sm primary" disabled={pending} onClick={() => respond(r.id, "confirmed", r.name)}>Confirm</button>
                  <button className="adm-btn sm" disabled={pending} onClick={() => decline(r.id, r.name)}>Decline</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
