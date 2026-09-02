"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserX, LogIn, Pencil, Trash2, Loader2 } from "lucide-react";
import { setBookingState } from "@/lib/admin/actions";
import { editCourtBooking, cancelCourtBooking } from "@/lib/bookings/actions";
import { isActionError } from "@/lib/actionError";
import type { CourtBooking, Court } from "@/lib/admin/types";
import { BookingBadge, PaymentStatusBadge, money, timeRange, dayLabel } from "../ui";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function BookingsTable({ bookings, courts }: { bookings: CourtBooking[]; courts: Court[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "checked_in" | "no_show">("all");
  const [err, setErr] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<CourtBooking | null>(null);

  function act(b: CourtBooking, state: string) {
    setBusyId(b.id);
    setErr(null);
    startTransition(async () => {
      const res = await setBookingState(b.id, b.venue_id, state);
      setBusyId(null);
      if (isActionError(res)) { setErr(res.message); return; }
      router.refresh();
    });
  }

  const filtered = bookings.filter((b) => {
    if (filter === "upcoming") return new Date(b.starts_at) > new Date();
    if (filter === "checked_in") return b.state === "checked_in";
    if (filter === "no_show") return b.state === "no_show";
    return true;
  });

  return (
    <div className="adm-card">
      {err && <div className="adm-badge danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="adm-flex" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "upcoming", "checked_in", "no_show"] as const).map((f) => (
          <div key={f} className={`adm-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "checked_in" ? "checked in" : f === "no_show" ? "no-shows" : f}
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="adm-dim" style={{ fontSize: 13, padding: "20px 0" }}>No bookings match this filter.</div>
      ) : (
        <table className="adm-table">
          <thead>
            <tr><th>When</th><th>Court</th><th>Customer</th><th>Amount</th><th>Status</th><th>Payment</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const court = courts.find((c) => c.id === b.court_id);
              const past = new Date(b.ends_at) < new Date();
              const canCheckIn = ["reserved", "paid", "confirmed"].includes(b.state);
              return (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{dayLabel(b.starts_at)}</div>
                    <div className="adm-num adm-dim" style={{ fontSize: 11 }}>{timeRange(b.starts_at, b.ends_at)}</div>
                  </td>
                  <td>{court?.name ?? "—"}<div className="adm-dim" style={{ fontSize: 11 }}>{court?.sport}</div></td>
                  <td>
                    {b.customer_name ?? "Player"}<div className="adm-dim" style={{ fontSize: 11 }}>{b.source}</div>
                    {b.phone && <div className="adm-num adm-dim" style={{ fontSize: 11 }}>{b.phone}</div>}
                  </td>
                  <td className="adm-num">{money(Number(b.price))}</td>
                  <td><BookingBadge state={b.state} /></td>
                  <td><PaymentStatusBadge status={b.payment_status} /></td>
                  <td>
                    <div className="adm-flex" style={{ gap: 6, justifyContent: "flex-end" }}>
                      {b.state !== "cancelled" && (
                        <button className="adm-btn sm ghost" onClick={() => setEditRow(b)} title="Edit details">
                          <Pencil size={13} />
                        </button>
                      )}
                      {canCheckIn && (
                        <button className="adm-btn sm ghost" disabled={pending && busyId === b.id}
                          onClick={() => act(b, "checked_in")} title="Check in">
                          <LogIn size={13} />
                        </button>
                      )}
                      {b.state === "checked_in" && (
                        <button className="adm-btn sm ghost" onClick={() => act(b, "played")} title="Mark played">
                          <Check size={13} />
                        </button>
                      )}
                      {past && canCheckIn && (
                        <button className="adm-btn sm ghost danger" onClick={() => act(b, "no_show")} title="No-show">
                          <UserX size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editRow && (
        <AdminEditBookingModal
          booking={editRow}
          courts={courts}
          onClose={() => { setEditRow(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function AdminEditBookingModal({
  booking, courts, onClose,
}: { booking: CourtBooking; courts: Court[]; onClose: () => void }) {
  const venueCourts = courts.filter((c) => c.venue_id === booking.venue_id);
  const [name, setName] = useState(booking.customer_name ?? "");
  const [phone, setPhone] = useState(booking.phone ?? "");
  const [courtId, setCourtId] = useState(booking.court_id);
  const [start, setStart] = useState(toLocalInput(booking.starts_at));
  const durH = Math.max(
    0.5,
    Math.round(((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 3_600_000) * 2) / 2
  );
  const [dur, setDur] = useState(String(durH));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const timeChanged =
      courtId !== booking.court_id
      || new Date(start).toISOString() !== new Date(booking.starts_at).toISOString()
      || Number(dur) !== durH;
    const res = await editCourtBooking({
      id: booking.id,
      customerName: name.trim() !== (booking.customer_name ?? "") ? name.trim() : null,
      phone: phone.trim() !== (booking.phone ?? "") ? phone.trim() : null,
      courtId: timeChanged ? courtId : null,
      startsAt: timeChanged ? new Date(start).toISOString() : null,
      endsAt: timeChanged ? new Date(new Date(start).getTime() + Number(dur) * 3_600_000).toISOString() : null,
    });
    setBusy(false);
    if (isActionError(res)) { setErr(res.message); return; }
    onClose();
  }

  async function cancelBooking() {
    if (!confirm("Cancel this booking? The slot frees up.")) return;
    setBusy(true); setErr(null);
    const res = await cancelCourtBooking(booking.id);
    setBusy(false);
    if (isActionError(res)) { setErr(res.message); return; }
    onClose();
  }

  return (
    <>
      <div className="adm-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: 495, width: "min(460px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto",
        }}
        className="adm-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: "var(--a-disp)", fontSize: 17, marginBottom: 14 }}>Edit booking</h3>
        {err && <div className="adm-badge danger" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="adm-field">
          <label className="adm-label">Customer name</label>
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Phone</label>
          <input className="adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Court</label>
          <select className="adm-select" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            {venueCourts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>)}
          </select>
        </div>
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Start</label>
            <input className="adm-input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="adm-field">
            <label className="adm-label">Hours</label>
            <select className="adm-select" value={dur} onChange={(e) => setDur(e.target.value)}>
              {["0.5", "1", "1.5", "2", "3"].map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <div className="adm-flex" style={{ gap: 8, marginTop: 4 }}>
          <button className="adm-btn primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} /> : <Check size={13} />} Save
          </button>
          <button className="adm-btn danger" onClick={cancelBooking} disabled={busy}>
            <Trash2 size={13} /> Cancel booking
          </button>
          <button className="adm-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </>
  );
}
