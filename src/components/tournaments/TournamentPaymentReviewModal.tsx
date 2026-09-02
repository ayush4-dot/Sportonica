"use client";

import { useEffect, useState, useTransition } from "react";
import { X, ShieldCheck } from "lucide-react";
import {
  getSignedTournamentPaymentProofUrl, reviewTournamentPaymentAsHost,
} from "@/lib/tournaments/actions";
import { REJECTION_REASONS } from "@/lib/payments/types";
import { isActionError } from "@/lib/actionError";
import type { Payment } from "@/lib/payments/types";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const METHOD_LABEL: Record<string, string> = {
  esewa: "eSewa", khalti: "Khalti", fonepay: "Fonepay", bank_transfer: "Bank Transfer",
};

type Row = Payment & { customer_name: string; booking_label: string };

// The host's own version of ReviewPaymentModal — a payment made to the
// host's QR, verified by the host (verify_tournament_payment RPC) rather
// than a super admin. Same two-step confirm + reason flow as
// PlayTogetherPaymentReviewModal.
export default function TournamentPaymentReviewModal({
  payment, tournamentId, onClose, onReviewed,
}: {
  payment: Row;
  tournamentId: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSignedTournamentPaymentProofUrl(payment.id)
      .then((url) => setScreenshotUrl(isActionError(url) ? null : url))
      .catch(() => setScreenshotUrl(null));
  }, [payment.id]);

  function approve() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await reviewTournamentPaymentAsHost(payment.id, true, tournamentId);
        if (isActionError(res)) { setErr(res.message); return; }
        onReviewed();
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not verify this payment."); }
    });
  }

  function reject() {
    if (!reason) { setErr("Pick a rejection reason first."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        const res = await reviewTournamentPaymentAsHost(payment.id, false, tournamentId, reason, note.trim() || undefined);
        if (isActionError(res)) { setErr(res.message); return; }
        onReviewed();
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not reject this payment."); }
    });
  }

  return (
    <div className="tprm-scrim" onClick={onClose}>
      <div className="tprm-card" onClick={(e) => e.stopPropagation()}>
        <div className="tprm-head">
          <h3>Verify payment</h3>
          <button className="tprm-x" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tprm-sec-t">Team</div>
        <Row label="Team" value={payment.booking_label} />
        <Row label="Paid by" value={payment.customer_name} />

        <div className="tprm-sec-t">Payment</div>
        <Row label="Amount" value={rs(payment.expected_amount)} accent />
        <Row label="Method" value={METHOD_LABEL[payment.payment_method] ?? payment.payment_method} />
        <Row label="Transaction ID" value={payment.transaction_id || "—"} />
        <Row label="Account paid to" value={payment.merchant_account_snapshot || "—"} />
        <Row
          label="Submitted"
          value={new Date(payment.submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        />

        <div className="tprm-shot">
          {screenshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={screenshotUrl} alt="Payment screenshot" />
          ) : (
            <span>Loading screenshot…</span>
          )}
        </div>

        {err && <div className="tprm-err">{err}</div>}

        {!confirming && !rejecting && (
          <div className="tprm-actions">
            <button className="tprm-btn ok" disabled={pending} onClick={() => setConfirming(true)}>Verify</button>
            <button className="tprm-btn bad" disabled={pending} onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}

        {confirming && (
          <div className="tprm-confirm">
            <p><ShieldCheck size={14} /> Confirm you&apos;ve checked this payment actually reached you before confirming the team.</p>
            <div className="tprm-actions">
              <button className="tprm-btn ok" disabled={pending} onClick={approve}>{pending ? "Verifying…" : "Confirm verify"}</button>
              <button className="tprm-btn" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {rejecting && (
          <div className="tprm-confirm">
            <p>The team will be notified and can re-register if registration is still open.</p>
            <label className="tprm-label">Rejection reason</label>
            <select className="tprm-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Pick a reason…</option>
              {Object.entries(REJECTION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="tprm-label">Note (optional)</label>
            <textarea className="tprm-select" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Any extra detail for the team" />
            <div className="tprm-actions">
              <button className="tprm-btn bad" disabled={pending || !reason} onClick={reject}>{pending ? "Rejecting…" : "Confirm reject"}</button>
              <button className="tprm-btn" disabled={pending} onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .tprm-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
          z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .tprm-card { width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto;
          background: var(--ink-2, #12151b); border: 1px solid var(--line, rgba(242,237,230,.12));
          border-radius: 18px; padding: 22px; color: var(--paper, #F2EDE6); }
        [data-theme="paper"] .tprm-card { background: #fff; border-color: rgba(20,23,30,.1); color: #14171e; }
        .tprm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .tprm-head h3 { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 800; margin: 0; }
        .tprm-x { background: none; border: none; color: inherit; opacity: .6; cursor: pointer; padding: 12px; margin: -6px -6px -6px 0; }
        .tprm-sec-t { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
          opacity: .5; margin: 16px 0 6px; }
        .tprm-label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; opacity: .55; margin: 10px 0 6px; }
        .tprm-select { width: 100%; box-sizing: border-box; padding: 9px 11px; min-height: 44px; border-radius: 8px;
          border: 1px solid var(--line, rgba(128,128,128,.3)); background: transparent; color: inherit;
          font-family: inherit; font-size: 13.5px; }
        .tprm-shot { margin-top: 14px; border-radius: 12px; overflow: hidden; background: #000;
          display: grid; place-items: center; min-height: 120px; border: 1px solid rgba(128,128,128,.2); }
        .tprm-shot img { width: 100%; max-height: 320px; object-fit: contain; }
        .tprm-shot span { color: #8A95A3; font-size: 12.5px; padding: 20px; }
        .tprm-err { color: #ef4444; font-size: 12.5px; margin-top: 12px; }
        .tprm-actions { display: flex; gap: 8px; margin-top: 14px; }
        .tprm-actions .tprm-btn { flex: 1; min-width: 0; }
        @media (max-width: 340px) { .tprm-actions { flex-direction: column; } }
        .tprm-confirm { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line, rgba(128,128,128,.15)); }
        .tprm-confirm p { display: flex; align-items: center; gap: 8px; font-size: 12.5px; opacity: .8; margin: 0 0 4px; }
        .tprm-btn { font-size: 12.5px; font-weight: 700; padding: 9px 14px; min-height: 44px; box-sizing: border-box;
          border-radius: 999px; border: 1px solid var(--line, rgba(128,128,128,.3)); background: transparent; color: inherit; cursor: pointer; }
        .tprm-btn:disabled { opacity: .35; cursor: default; }
        .tprm-btn.ok { border-color: rgba(46,125,91,0.5); color: #2E7D5B; }
        .tprm-btn.ok:hover:not(:disabled) { background: rgba(46,125,91,0.12); }
        .tprm-btn.bad { border-color: rgba(239,68,68,0.5); color: #ef4444; }
        .tprm-btn.bad:hover:not(:disabled) { background: rgba(239,68,68,0.12); }
      `}</style>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5, gap: 12 }}>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right", fontFamily: accent ? "'Inter', sans-serif" : undefined, color: accent ? "#006241" : undefined }}>
        {value}
      </span>
    </div>
  );
}
