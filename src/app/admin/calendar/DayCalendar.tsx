"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Ban, UserPlus, Wrench } from "lucide-react";
import { createBlock, bookCourt, deleteBlock } from "@/lib/admin/actions";
import type { Court, CourtBooking, CourtBlock, CourtHours } from "@/lib/admin/types";

const KTM_TZ = "Asia/Kathmandu";

function toKtmDateStr(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: KTM_TZ }); // YYYY-MM-DD
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ });
}
// Build an ISO timestamp for a given Ktm date + "HH:MM"
function ktmIso(dateStr: string, time: string) {
  // Kathmandu is UTC+5:45, fixed (no DST) — safe to hardcode offset.
  return `${dateStr}T${time}:00+05:45`;
}

export default function DayCalendar({
  courts, bookings, blocks, hoursByCourt, initialDate,
}: {
  courts: Court[];
  bookings: CourtBooking[];
  blocks: CourtBlock[];
  hoursByCourt: Record<string, CourtHours[]>;
  initialDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dateStr, setDateStr] = useState(initialDate);
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [modal, setModal] = useState<null | { kind: "block" | "book"; start: string }>(null);
  const [err, setErr] = useState<string | null>(null);

  const court = courts.find((c) => c.id === courtId);
  const dow = new Date(ktmIso(dateStr, "12:00")).getDay();
  const hours = (hoursByCourt[courtId] ?? []).find((h) => h.dow === dow);

  // Render an hourly rail between open and close.
  const rail = useMemo(() => {
    if (!hours) return [];
    const openH = parseInt(hours.open_time.slice(0, 2), 10);
    const closeH = parseInt(hours.close_time.slice(0, 2), 10);
    const rows: number[] = [];
    for (let h = openH; h < closeH; h++) rows.push(h);
    return rows;
  }, [hours]);

  const dayBookings = bookings.filter(
    (b) => b.court_id === courtId && toKtmDateStr(new Date(b.starts_at)) === dateStr
      && !["cancelled", "refunded", "dropped"].includes(b.state)
  );
  const dayBlocks = blocks.filter(
    (b) => b.court_id === courtId && toKtmDateStr(new Date(b.starts_at)) === dateStr
  );

  function shiftDay(delta: number) {
    const d = new Date(ktmIso(dateStr, "12:00"));
    d.setDate(d.getDate() + delta);
    setDateStr(toKtmDateStr(d));
  }

  function pxTop(iso: string) {
    if (!rail.length) return 0;
    const mins = (new Date(iso).getTime() - new Date(ktmIso(dateStr, `${String(rail[0]).padStart(2, "0")}:00`)).getTime()) / 60000;
    return (mins / 60) * 44;
  }
  function pxHeight(startIso: string, endIso: string) {
    const mins = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
    return Math.max((mins / 60) * 44 - 4, 20);
  }

  return (
    <div className="adm-body" style={{ maxWidth: 860 }}>
      {/* Controls */}
      <div className="adm-between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div className="adm-flex">
          <button className="adm-btn sm ghost" onClick={() => shiftDay(-1)}><ChevronLeft size={15} /></button>
          <input type="date" className="adm-input mono" style={{ width: 160, padding: "8px 10px" }}
            value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          <button className="adm-btn sm ghost" onClick={() => shiftDay(1)}><ChevronRight size={15} /></button>
        </div>
        <select className="adm-select" style={{ width: 200 }} value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          {courts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>)}
        </select>
      </div>

      <div className="adm-card">
        {!court ? (
          <div className="adm-dim" style={{ fontSize: 13 }}>No courts to show. Add a court first.</div>
        ) : !hours ? (
          <div className="adm-empty" style={{ padding: "32px 20px" }}>
            <h3>Closed on this day</h3>
            <p>This court has no opening hours set for {new Date(ktmIso(dateStr, "12:00")).toLocaleDateString("en-GB", { weekday: "long" })}. Set hours on the venue page.</p>
          </div>
        ) : (
          <>
            <div className="adm-between" style={{ marginBottom: 14 }}>
              <div className="adm-mono adm-dim" style={{ fontSize: 11 }}>
                OPEN {hours.open_time.slice(0, 5)}–{hours.close_time.slice(0, 5)} · {dayBookings.length} booked · {dayBlocks.length} blocked
              </div>
              <div className="adm-flex">
                <button className="adm-btn sm" onClick={() => setModal({ kind: "book", start: `${String(rail[0] ?? 6).padStart(2, "0")}:00` })}>
                  <UserPlus size={13} /> Add booking
                </button>
                <button className="adm-btn sm" onClick={() => setModal({ kind: "block", start: `${String(rail[0] ?? 6).padStart(2, "0")}:00` })}>
                  <Ban size={13} /> Block slot
                </button>
              </div>
            </div>

            <div className="adm-cal">
              <div>
                {rail.map((h) => (
                  <div key={h} className="adm-cal-hour">{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>
              <div style={{ position: "relative" }}>
                {rail.map((h) => <div key={h} className="adm-cal-track" />)}
                {dayBookings.map((b) => (
                  <div key={b.id} className={`adm-cal-block ${b.source === "walk_in" || b.source === "phone" ? "walk_in" : "booking"}`}
                    style={{ top: pxTop(b.starts_at), height: pxHeight(b.starts_at, b.ends_at) }}>
                    <b>{hhmm(b.starts_at)}–{hhmm(b.ends_at)}</b>
                    <span>{b.customer_name ?? "Player"} · Rs {b.price}</span>
                  </div>
                ))}
                {dayBlocks.map((bl) => (
                  <div key={bl.id} className="adm-cal-block block"
                    style={{ top: pxTop(bl.starts_at), height: pxHeight(bl.starts_at, bl.ends_at) }}
                    onClick={() => startTransition(async () => { await deleteBlock(bl.id, court.venue_id); router.refresh(); })}
                    title="Click to remove block">
                    <b><Wrench size={9} style={{ verticalAlign: -1 }} /> {bl.reason.replace("_", " ")}</b>
                    <span>{hhmm(bl.starts_at)}–{hhmm(bl.ends_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {modal && court && (
        <SlotModal
          kind={modal.kind}
          court={court}
          dateStr={dateStr}
          defaultStart={modal.start}
          pending={pending}
          err={err}
          onClose={() => { setModal(null); setErr(null); }}
          onSubmit={(payload) => {
            setErr(null);
            startTransition(async () => {
              try {
                if (modal.kind === "block") {
                  await createBlock({
                    court_id: court.id, venue_id: court.venue_id,
                    starts_at: ktmIso(dateStr, payload.start), ends_at: ktmIso(dateStr, payload.end),
                    reason: payload.reason, note: payload.note,
                  });
                } else {
                  await bookCourt({
                    court_id: court.id, venue_id: court.venue_id,
                    starts_at: ktmIso(dateStr, payload.start), ends_at: ktmIso(dateStr, payload.end),
                    customer_name: payload.note || "Walk-in", source: "walk_in",
                  });
                }
                setModal(null);
                router.refresh();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed");
              }
            });
          }}
        />
      )}
    </div>
  );
}

function SlotModal({
  kind, court, defaultStart, pending, err, onClose, onSubmit,
}: {
  kind: "block" | "book";
  court: Court;
  dateStr: string;
  defaultStart: string;
  pending: boolean;
  err: string | null;
  onClose: () => void;
  onSubmit: (p: { start: string; end: string; reason: string; note: string }) => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => {
    const h = (parseInt(defaultStart.slice(0, 2), 10) + 1) % 24;
    return `${String(h).padStart(2, "0")}:00`;
  });
  const [reason, setReason] = useState(kind === "block" ? "maintenance" : "walk_in");
  const [note, setNote] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
      display: "grid", placeItems: "center", padding: 20,
    }} onClick={onClose}>
      <div className="adm-card" style={{ maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div className="adm-card-t">{kind === "block" ? "Block a slot" : "Add walk-in booking"}</div>
        <div className="adm-card-sub">{court.name} · {court.sport}</div>
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Start</label>
            <input type="time" className="adm-input mono" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="adm-field">
            <label className="adm-label">End</label>
            <input type="time" className="adm-input mono" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {kind === "block" ? (
          <div className="adm-field">
            <label className="adm-label">Reason</label>
            <select className="adm-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="maintenance">Maintenance</option>
              <option value="walk_in">Walk-in (offline)</option>
              <option value="phone_booking">Phone booking</option>
              <option value="manual">Other</option>
            </select>
          </div>
        ) : (
          <div className="adm-field">
            <label className="adm-label">Customer name</label>
            <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who's this booking for?" />
          </div>
        )}
        {kind === "block" && (
          <div className="adm-field">
            <label className="adm-label">Note <span className="adm-dim">(optional)</span></label>
            <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        {err && <div className="adm-badge danger" style={{ marginBottom: 12 }}>{err}</div>}
        <div className="adm-flex">
          <button className="adm-btn primary sm" disabled={pending}
            onClick={() => onSubmit({ start, end, reason, note })}>
            {pending ? "Saving…" : kind === "block" ? "Block slot" : "Add booking"}
          </button>
          <button className="adm-btn ghost sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
