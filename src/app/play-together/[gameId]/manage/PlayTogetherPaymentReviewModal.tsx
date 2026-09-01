"use client";

import { useEffect, useState, useTransition } from "react";
import { X, ShieldCheck, MessageCircle } from "lucide-react";
import { getSignedGamePaymentProofUrl } from "@/lib/playTogether/actions";
import { playerWhatsappUrl, PLAY_TOGETHER_PAYMENT_REJECTION_REASONS } from "@/lib/playTogether/types";
import { isActionError } from "@/lib/actionError";
import type { GamePlayerWithProfile } from "@/lib/playTogether/queries";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const METHOD_LABEL: Record<string, string> = {
  host_qr: "Host QR", esewa: "eSewa", khalti: "Khalti", bank_transfer: "Bank Transfer", cash: "Cash",
};

export default function PlayTogetherPaymentReviewModal({
  request, sport, onClose, onReview,
}: {
  request: GamePlayerWithProfile;
  sport: string;
  onClose: () => void;
  onReview: (approve: boolean, reason?: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSignedGamePaymentProofUrl(request.id)
      .then((url) => setScreenshotUrl(isActionError(url) ? null : url))
      .catch(() => setScreenshotUrl(null));
  }, [request.id]);

  const name = request.profiles?.full_name ?? request.profiles?.name ?? "Player";
  const phone = request.profiles?.phone;
  const waUrl = phone ? playerWhatsappUrl(phone, `Hey! Reviewing your payment for the ${sport} game.`) : null;

  function approve() {
    setErr(null);
    startTransition(async () => {
      try { await onReview(true); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not verify this payment."); }
    });
  }

  function reject() {
    if (!reason) { setErr("Pick a reason first."); return; }
    setErr(null);
    startTransition(async () => {
      try { await onReview(false, reason); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not reject this payment."); }
    });
  }

  return (
    <div className="ptrm-scrim" onClick={onClose}>
      <div className="ptrm-card" onClick={(e) => e.stopPropagation()}>
        <div className="ptrm-head">
          <h3>Verify payment</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {waUrl && (
              <a className="ptrm-wa" href={waUrl} target="_blank" rel="noopener noreferrer" title="Message on WhatsApp">
                <MessageCircle size={16} />
              </a>
            )}
            <button className="ptrm-x" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ptrm-player">
          {request.profiles?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ptrm-avatar" src={request.profiles.avatar_url} alt={name} />
          ) : (
            <div className="ptrm-avatar ptrm-avatar-fallback">{name.charAt(0).toUpperCase()}</div>
          )}
          <span className="ptrm-player-name">{name}</span>
        </div>

        <div className="ptrm-sec-t">Player</div>
        <Row label="Name" value={name} />
        <Row label="Phone" value={phone || "Not provided"} />

        <div className="ptrm-sec-t">Payment</div>
        <Row label="Amount" value={rs(request.contribution_amount)} accent />
        <Row label="Method" value={METHOD_LABEL[request.payment_method ?? ""] ?? "—"} />
        <Row label="Transaction ID" value={request.transaction_id || "—"} />
        <Row
          label="Submitted"
          value={request.payment_submitted_at ? new Date(request.payment_submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        />

        <div className="ptrm-shot">
          {screenshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={screenshotUrl} alt="Payment screenshot" />
          ) : (
            <span>Loading screenshot…</span>
          )}
        </div>

        {err && <div className="ptrm-err">{err}</div>}

        {!confirming && !rejecting && (
          <div className="ptrm-actions">
            <button className="ptrm-btn ok" disabled={pending} onClick={() => setConfirming(true)}>Verify</button>
            <button className="ptrm-btn bad" disabled={pending} onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}

        {confirming && (
          <div className="ptrm-confirm">
            <p><ShieldCheck size={14} /> Confirm you&apos;ve checked this payment actually reached you before adding {name} to the group.</p>
            <div className="ptrm-actions">
              <button className="ptrm-btn ok" disabled={pending} onClick={approve}>{pending ? "Verifying…" : "Confirm verify"}</button>
              <button className="ptrm-btn" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {rejecting && (
          <div className="ptrm-confirm">
            <p>{name} will be notified and can resubmit valid proof if their payment window hasn&apos;t closed.</p>
            <label className="ptrm-label">Reason</label>
            <select className="ptrm-select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Pick a reason…</option>
              {Object.entries(PLAY_TOGETHER_PAYMENT_REJECTION_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="ptrm-actions">
              <button className="ptrm-btn bad" disabled={pending || !reason} onClick={reject}>{pending ? "Rejecting…" : "Confirm reject"}</button>
              <button className="ptrm-btn" disabled={pending} onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ptrm-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
          z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .ptrm-card { width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto;
          background: var(--ink-2); border: 1px solid var(--line); border-radius: 18px; padding: 22px; color: var(--paper); }
        .ptrm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .ptrm-head h3 { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 800; margin: 0; }
        /* Icon-only buttons had no padding at all — just the bare 16-18px
           icon as the tap target. Pad them out toward 44px; there's plenty
           of slack in this header row for the extra box size. */
        .ptrm-x { background: none; border: none; color: inherit; opacity: .6; cursor: pointer;
          padding: 12px; margin: -6px -6px -6px 0; }
        .ptrm-wa { display: inline-flex; color: #2E7D5B; opacity: .8; padding: 12px; margin: -6px; }
        .ptrm-wa:hover { opacity: 1; }
        .ptrm-player { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
        .ptrm-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .ptrm-avatar-fallback { display: grid; place-items: center; background: var(--turf, #006241);
          color: #fff; font-weight: 800; font-size: 15px; }
        .ptrm-player-name { font-weight: 700; font-size: 15px; }
        .ptrm-sec-t { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
          opacity: .5; margin: 16px 0 6px; }
        .ptrm-label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; opacity: .55; margin: 10px 0 6px; }
        .ptrm-select {
          width: 100%; box-sizing: border-box; padding: 9px 11px; min-height: 44px; border-radius: 8px;
          border: 1px solid var(--line); background: transparent; color: inherit;
          font-family: inherit; font-size: 13.5px;
        }
        .ptrm-shot { margin-top: 14px; border-radius: 12px; overflow: hidden; background: #000;
          display: grid; place-items: center; min-height: 120px; border: 1px solid rgba(128,128,128,.2); }
        .ptrm-shot img { width: 100%; max-height: 320px; object-fit: contain; }
        .ptrm-shot span { color: #8A95A3; font-size: 12.5px; padding: 20px; }
        .ptrm-err { color: #ef4444; font-size: 12.5px; margin-top: 12px; }
        .ptrm-actions { display: flex; gap: 8px; margin-top: 14px; }
        .ptrm-actions .ptrm-btn { flex: 1; min-width: 0; }
        @media (max-width: 340px) {
          .ptrm-actions { flex-direction: column; }
        }
        .ptrm-confirm { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
        .ptrm-confirm p { display: flex; align-items: center; gap: 8px; font-size: 12.5px; opacity: .8; margin: 0 0 4px; }
        .ptrm-btn {
          font-size: 12.5px; font-weight: 700; padding: 9px 14px; min-height: 44px; box-sizing: border-box;
          border-radius: 999px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer;
        }
        .ptrm-btn:disabled { opacity: .35; cursor: default; }
        .ptrm-btn.ok { border-color: rgba(46,125,91,0.5); color: #2E7D5B; }
        .ptrm-btn.ok:hover:not(:disabled) { background: rgba(46,125,91,0.12); }
        .ptrm-btn.bad { border-color: rgba(239,68,68,0.5); color: #ef4444; }
        .ptrm-btn.bad:hover:not(:disabled) { background: rgba(239,68,68,0.12); }
      `}</style>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ fontWeight: 700, fontFamily: accent ? "'Inter', sans-serif" : undefined, color: accent ? "#006241" : undefined }}>
        {value}
      </span>
    </div>
  );
}
