"use client";

import { useEffect, useState, useTransition } from "react";
import { X, ShieldCheck, MessageCircle } from "lucide-react";
import {
  getSignedScreenshotUrl, getPaymentBookingDetails, reviewPayment,
} from "@/lib/payments/adminActions";
import { REJECTION_REASONS, whatsappNotifyUrl } from "@/lib/payments/types";
import type { Payment, RejectionReason } from "@/lib/payments/types";

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

type Row = Payment & { customer_name: string; booking_label: string };

export default function ReviewPaymentModal({
  payment, onClose, onReviewed,
}: { payment: Row; onClose: () => void; onReviewed: () => void }) {
  const [pending, startTransition] = useTransition();
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [details, setDetails] = useState<{ venue: string; date: string; time: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSignedScreenshotUrl(payment.id).then(setScreenshotUrl).catch(() => setScreenshotUrl(null));
    getPaymentBookingDetails(payment.id).then(setDetails).catch(() => setDetails(null));
  }, [payment.id]);

  function approve() {
    setErr(null);
    startTransition(async () => {
      try { await reviewPayment(payment.id, "APPROVE"); onReviewed(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not approve this payment."); }
    });
  }

  function reject() {
    if (!reason) { setErr("Pick a rejection reason first."); return; }
    setErr(null);
    startTransition(async () => {
      try { await reviewPayment(payment.id, "REJECT", reason, note.trim() || undefined); onReviewed(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not reject this payment."); }
    });
  }

  return (
    <div className="rpm-scrim" onClick={onClose}>
      <div className="rpm-card" onClick={(e) => e.stopPropagation()}>
        <div className="rpm-head">
          <h3>Review payment</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a
              className="rpm-wa"
              href={whatsappNotifyUrl(
                `Payment to verify — ${payment.booking_label} · ${payment.customer_name} · Rs ${Math.round(payment.expected_amount)} via ${payment.payment_method} · txn ${payment.transaction_id}`
              )}
              target="_blank" rel="noopener noreferrer"
              title="Notify via WhatsApp"
            >
              <MessageCircle size={16} />
            </a>
            <button className="rpm-x" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="rpm-sec-t">Booking Information</div>
        <Row label="Booking ID" value={payment.booking_label} />
        <Row label="Customer" value={payment.customer_name} />
        <Row label="Venue" value={details?.venue ?? "…"} />
        <Row label="Date" value={details?.date ?? "…"} />
        <Row label="Time" value={details?.time ?? "…"} />
        <Row label="Expected amount" value={money(payment.expected_amount)} accent />

        <div className="rpm-sec-t">Payment Information</div>
        <Row label="Payment method" value={payment.payment_method === "esewa" ? "eSewa" : "Khalti"} />
        <Row label="Transaction ID" value={payment.transaction_id} />
        <Row label="Submitted" value={new Date(payment.submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />

        <div className="rpm-shot">
          {screenshotUrl ? (
            <img src={screenshotUrl} alt="Payment screenshot" />
          ) : (
            <span>Loading screenshot…</span>
          )}
        </div>

        {err && <div className="rpm-err">{err}</div>}

        {!confirming && !rejecting && (
          <div className="rpm-actions">
            <button className="dt-btn ok" disabled={pending} onClick={() => setConfirming(true)}>
              Approve Payment
            </button>
            <button className="dt-btn bad" disabled={pending} onClick={() => setRejecting(true)}>
              Reject Payment
            </button>
          </div>
        )}

        {confirming && (
          <div className="rpm-confirm">
            <p><ShieldCheck size={14} /> Confirm that you have verified this payment against the Khelam Na merchant account.</p>
            <div className="rpm-actions">
              <button className="dt-btn ok" disabled={pending} onClick={approve}>
                {pending ? "Approving…" : "Approve Payment"}
              </button>
              <button className="dt-btn" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {rejecting && (
          <div className="rpm-confirm">
            <label className="rpm-label">Rejection reason</label>
            <select className="rpm-select" value={reason} onChange={(e) => setReason(e.target.value as RejectionReason)}>
              <option value="">Pick a reason…</option>
              {Object.entries(REJECTION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="rpm-label">Note (optional)</label>
            <textarea className="rpm-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Any extra detail for the customer or your records" />
            <div className="rpm-actions">
              <button className="dt-btn bad" disabled={pending || !reason} onClick={reject}>
                {pending ? "Rejecting…" : "Reject Payment"}
              </button>
              <button className="dt-btn" disabled={pending} onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .rpm-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
          z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .rpm-card { width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto;
          background: #12151b; border: 1px solid rgba(242,237,230,.12); border-radius: 18px; padding: 22px; }
        [data-theme="paper"] .rpm-card { background: #fff; border-color: rgba(20,23,30,.1); }
        .rpm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .rpm-head h3 { font-family: 'Bricolage Grotesque', sans-serif; font-size: 19px; font-weight: 800; margin: 0; }
        .rpm-x { background: none; border: none; color: inherit; opacity: .6; cursor: pointer; }
        .rpm-wa { display: inline-flex; color: #2E7D5B; opacity: .8; }
        .rpm-wa:hover { opacity: 1; }
        .rpm-sec-t { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
          opacity: .5; margin: 16px 0 6px; }
        .rpm-shot { margin-top: 14px; border-radius: 12px; overflow: hidden; background: #000;
          display: grid; place-items: center; min-height: 120px; border: 1px solid rgba(128,128,128,.2); }
        .rpm-shot img { width: 100%; max-height: 360px; object-fit: contain; }
        .rpm-shot span { color: #8A95A3; font-size: 12.5px; padding: 20px; }
        .rpm-err { color: #ef4444; font-size: 12.5px; margin-top: 12px; }
        .rpm-actions { display: flex; gap: 8px; margin-top: 14px; }
        .rpm-confirm { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(128,128,128,.15); }
        .rpm-confirm p { display: flex; align-items: center; gap: 8px; font-size: 12.5px; opacity: .8; margin: 0 0 4px; }
        .rpm-label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; opacity: .55; margin: 10px 0 6px; }
        .rpm-select, .rpm-textarea {
          width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 8px;
          border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit;
          font-family: inherit; font-size: 13.5px;
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ fontWeight: 700, fontFamily: accent ? "'JetBrains Mono', monospace" : undefined, color: accent ? "#006241" : undefined }}>
        {value}
      </span>
    </div>
  );
}
