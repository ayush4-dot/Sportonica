"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Upload, Phone } from "lucide-react";
import { uploadGamePaymentProof, submitPlayTogetherPayment } from "@/lib/playTogether/actions";
import { hostQrPublicUrl, friendlyPlayTogetherError } from "@/lib/playTogether/types";
import { isActionError } from "@/lib/actionError";
import { PYMT_CSS } from "@/components/payments/PaymentStep";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

function useCountdown(deadline: string) {
  const [msLeft, setMsLeft] = useState(() => new Date(deadline).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setMsLeft(new Date(deadline).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  const clamped = Math.max(msLeft, 0);
  const hh = Math.floor(clamped / 3_600_000);
  const mm = Math.floor((clamped % 3_600_000) / 60_000);
  const ss = Math.floor((clamped % 60_000) / 1000);
  const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return { msLeft, expired: msLeft <= 0, label };
}

export default function PlayTogetherPaymentModal({
  gamePlayerId, gameId, sport, venueName, contribution, paymentDeadline, hostQrPath, hostPhone,
  resubmit, onClose, onSubmitted,
}: {
  gamePlayerId: string;
  gameId: string;
  sport: string;
  venueName: string;
  contribution: number;
  paymentDeadline: string;
  hostQrPath: string | null;
  hostPhone: string | null;
  resubmit?: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [payingNow, setPayingNow] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { expired, label } = useCountdown(paymentDeadline);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(f.type)) { setErr("Upload a JPG, PNG or WebP screenshot."); return; }
    if (f.size > 5 * 1024 * 1024) { setErr("Screenshot must be under 5 MB."); return; }
    setErr(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  const canSubmit = transactionId.trim().length > 0 && !!file && !pending && !expired;

  function submit() {
    if (!file) return;
    setErr(null);
    startTransition(async () => {
      try {
        const path = await uploadGamePaymentProof(gamePlayerId, file);
        if (isActionError(path)) { setErr(path.message); return; }
        const submitted = await submitPlayTogetherPayment({
          gamePlayerId, gameId, method: "host_qr", transactionId: transactionId.trim(), proofPath: path,
        });
        if (isActionError(submitted)) { setErr(submitted.message); return; }
        onSubmitted();
      } catch (e) {
        setErr(e instanceof Error ? e.message : friendlyPlayTogetherError("Could not submit your payment. Try again."));
      }
    });
  }

  return (
    <div className="ptpm-scrim" onClick={onClose}>
      <div className="pymt ptpm-card" onClick={(e) => e.stopPropagation()}>
        <style>{PYMT_CSS}</style>
        <style>{PTPM_CSS}</style>

        <h3 className="ptpm-h">{resubmit ? "Resubmit Your Payment" : "Complete Your Payment"}</h3>

        <div className="pymt-done-rows">
          <Row label="Game" value={`${sport}`} />
          <Row label="Venue" value={venueName} />
          <Row label="Amount" value={rs(contribution)} accent />
          <Row label="Time remaining" value={expired ? "Expired" : label} accent={!expired} />
        </div>

        {resubmit && (
          <p className="ptpm-warn">Your last submission couldn&apos;t be verified — check the details and try again.</p>
        )}
        {expired && (
          <p className="ptpm-warn">Your payment window has closed. This request has been cancelled.</p>
        )}

        {!payingNow && !expired && (
          <div className="ptpm-actions">
            <button className="pymt-submit" onClick={() => setPayingNow(true)}>Pay Now</button>
            <button className="ptpm-later" onClick={onClose}>I&apos;ll Pay Later</button>
          </div>
        )}

        {payingNow && !expired && (
          <>
            {(hostQrPath || hostPhone) && (
              <div className="pymt-panel" style={{ marginTop: 14 }}>
                <h4>Pay the host directly</h4>
                {hostPhone && (
                  <p className="pymt-hint" style={{ marginBottom: 10 }}>
                    <Phone size={12} style={{ verticalAlign: -2 }} /> {hostPhone}
                  </p>
                )}
                {hostQrPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pymt-qr" src={hostQrPublicUrl(hostQrPath) ?? ""} alt="Host's payment QR" />
                )}
              </div>
            )}

            <p className="ptpm-warn" style={{ marginTop: 12 }}>
              Your payment is not confirmed immediately. The host must verify it before you become a
              confirmed participant.
            </p>

            <label className="pymt-label">Transaction / Reference ID</label>
            <input
              className="pymt-in"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. ES12345 or a1b2c3d4"
            />

            <label className="pymt-label">Payment Screenshot</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} style={{ display: "none" }} />
            {previewUrl ? (
              <div className="pymt-shot" onClick={() => fileRef.current?.click()}>
                <img src={previewUrl} alt="Payment screenshot preview" />
                <span className="pymt-shot-replace">Replace</span>
              </div>
            ) : (
              <button className="pymt-upload" onClick={() => fileRef.current?.click()} type="button">
                <Upload size={15} /> Upload Screenshot
              </button>
            )}

            {err && <div className="pymt-err">{err}</div>}

            <button className="pymt-submit" onClick={submit} disabled={!canSubmit}>
              {pending ? "Submitting…" : "Submit Payment"}
            </button>
            <button className="ptpm-later" style={{ marginTop: 8 }} onClick={onClose} disabled={pending}>
              I&apos;ll Pay Later
            </button>
          </>
        )}

        {expired && (
          <button className="ptpm-later" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="pymt-row">
      <span className="pymt-row-l">{label}</span>
      <span className={`pymt-row-v ${accent ? "accent" : ""}`}>{value}</span>
    </div>
  );
}

const PTPM_CSS = `
.ptpm-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
  z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; }
.ptpm-card { width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto;
  background: #12151b; border: 1px solid rgba(242,237,230,.12); border-radius: 18px; padding: 22px; }
[data-theme="paper"] .ptpm-card { background: #fff; border-color: rgba(20,23,30,.1); }
.ptpm-h { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 800; margin: 0 0 10px; }
.ptpm-warn { font-size: 12.5px; color: #d97706; background: rgba(217,119,6,.08); border: 1px solid rgba(217,119,6,.3);
  border-radius: 10px; padding: 10px 12px; margin: 10px 0 0; }
.ptpm-actions { margin-top: 16px; }
.ptpm-later { width: 100%; margin-top: 8px; padding: 12px; border-radius: 12px;
  border: 1px solid rgba(242,237,230,.15); background: transparent; color: inherit;
  font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
[data-theme="paper"] .ptpm-later { border-color: rgba(20,23,30,.14); }
.ptpm-later:disabled { opacity: .5; cursor: default; }
`;
