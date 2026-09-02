"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload, AlertCircle } from "lucide-react";
import { getPaymentMethods, uploadPaymentProof, submitPayment } from "@/lib/payments/actions";
import { bookingLabel, paymentQrPublicUrl } from "@/lib/payments/types";
import { isActionError } from "@/lib/actionError";
import type { BookingType, Payment, PaymentMethod, PaymentMethodConfig } from "@/lib/payments/types";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const METHOD_LABELS: Record<PaymentMethod, string> = {
  esewa: "eSewa", khalti: "Khalti", fonepay: "Fonepay", bank_transfer: "Bank Transfer",
};

const INSTRUCTIONS = [
  "Open eSewa or Khalti on your phone.",
  "Scan the QR code below.",
  "Pay the exact amount shown.",
  "Enter the transaction/reference ID from your payment app.",
  "Upload a screenshot of the completed payment.",
  "Submit for verification.",
];

// Shown when paying a tournament host directly (hostMethod set) rather
// than Sportonica's platform QR.
const INSTRUCTIONS_HOST = [
  "Open your payment app on your phone.",
  "Scan the organizer's QR below.",
  "Pay the exact amount shown, to the organizer.",
  "Enter the transaction/reference ID from your payment app.",
  "Upload a screenshot of the completed payment.",
  "Submit — the organizer verifies it.",
];

/** When set, the payer pays this fixed recipient (a tournament host's own
 *  QR) instead of choosing a Sportonica platform method. */
export type HostMethod = {
  qrUrl: string | null;
  merchantName: string;
  account: string | null;
  method: PaymentMethod;
};

export default function PaymentStep({
  bookingType,
  bookingId,
  amount,
  summary,
  footer,
  hostMethod,
}: {
  bookingType: BookingType;
  bookingId: string;
  amount: number;
  /** Booking summary rows (venue, date, time, court/sport…) shown above the amount — whatever context the caller already has. */
  summary?: { label: string; value: string }[];
  /** Extra actions rendered under the "submitted" confirmation (e.g. "Done" / "See my games"). */
  footer?: React.ReactNode;
  /** Pay a fixed recipient (tournament host QR) instead of the platform method picker. */
  hostMethod?: HostMethod;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Paying a tournament host directly — the recipient is fixed, so there's
  // no platform-method lookup to wait on.
  const [methods, setMethods] = useState<PaymentMethodConfig[] | null>(hostMethod ? [] : null);
  const [method, setMethod] = useState<PaymentMethod | null>(hostMethod ? hostMethod.method : null);
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Payment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hostMethod) return;
    let cancelled = false;
    getPaymentMethods()
      .then((rows) => {
        if (cancelled) return;
        if (isActionError(rows)) { setMethods([]); return; }
        setMethods(rows);
        const firstEnabled = rows.find((m) => m.enabled);
        if (firstEnabled) setMethod(firstEnabled.method);
      })
      .catch(() => { if (!cancelled) setMethods([]); });
    return () => { cancelled = true; };
    // hostMethod presence is fixed for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const active = methods?.find((m) => m.method === method) ?? null;
  const enabledMethods = methods?.filter((m) => m.enabled) ?? [];
  const methodReady = hostMethod ? !!hostMethod.qrUrl : !!active?.enabled;
  const canSubmit = !!method && methodReady && transactionId.trim().length > 0 && !!file && !pending;

  const panelQrUrl = hostMethod ? hostMethod.qrUrl : (active ? paymentQrPublicUrl(active.qr_path) : null);
  const panelMerchant = hostMethod ? hostMethod.merchantName : (active?.merchant_name ?? "");
  const panelAccount = hostMethod ? hostMethod.account : (active?.account_identifier ?? null);
  const panelSteps = hostMethod ? INSTRUCTIONS_HOST : INSTRUCTIONS;

  function submit() {
    if (!method || !file) return;
    setErr(null);
    startTransition(async () => {
      try {
        const path = await uploadPaymentProof(bookingType, bookingId, file);
        if (isActionError(path)) {
          if (path.message === "UNAUTHORIZED") { router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
          setErr(path.message); return;
        }
        const payment = await submitPayment(bookingType, bookingId, method, transactionId.trim(), path);
        if (isActionError(payment)) {
          if (payment.message === "UNAUTHORIZED") { router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
          setErr(payment.message); return;
        }
        setSubmitted(payment);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not submit your payment. Try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="pymt">
        <style>{PYMT_CSS}</style>
        <div className="pymt-done">
          <div className="pymt-done-mark"><Check size={28} color="#fff" /></div>
          <h3>Payment Submitted</h3>
          <div className="pymt-done-rows">
            <Row label="Booking" value={bookingLabel(bookingType, bookingId)} />
            {summary?.map((s) => <Row key={s.label} label={s.label} value={s.value} />)}
            <Row label="Amount" value={rs(submitted.expected_amount)} />
            <Row label="Payment" value={METHOD_LABELS[submitted.payment_method]} />
            <Row label="Transaction" value={submitted.transaction_id} />
            <Row label="Status" value="Awaiting Verification" accent />
          </div>
          <p className="pymt-done-msg">
            Your payment has been submitted successfully. Our team will verify the payment and confirm your booking.
          </p>
          {footer && <div className="pymt-done-footer">{footer}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="pymt">
      <style>{PYMT_CSS}</style>

      {summary && summary.length > 0 && (
        <div className="pymt-summary">
          <span className="pymt-summary-t">Booking Summary</span>
          {summary.map((s) => <Row key={s.label} label={s.label} value={s.value} />)}
        </div>
      )}

      <div className="pymt-amt">
        <span className="pymt-amt-lbl">Amount to Pay</span>
        <span className="pymt-amt-val">{rs(amount)}</span>
      </div>

      {!hostMethod && methods === null ? (
        <p className="pymt-hint">Loading payment options…</p>
      ) : !hostMethod && enabledMethods.length === 0 ? (
        <div className="pymt-warn">
          <AlertCircle size={15} />
          No payment method is available right now. Please try again shortly or contact support.
        </div>
      ) : (
        <>
          {!hostMethod && (
            <>
              <p className="pymt-hint">Choose Payment Method</p>
              <div className="pymt-methods">
                {enabledMethods.map((m) => (
                  <button
                    key={m.method}
                    className={`pymt-method ${method === m.method ? "on" : ""}`}
                    onClick={() => setMethod(m.method)}
                  >
                    {METHOD_LABELS[m.method]}
                  </button>
                ))}
              </div>
            </>
          )}

          {(hostMethod || active) && (
            <div className="pymt-panel">
              <h4>
                {hostMethod
                  ? `Pay the organizer via ${METHOD_LABELS[hostMethod.method]}`
                  : `Pay with ${METHOD_LABELS[active!.method]}`}
              </h4>

              {panelQrUrl ? (
                <img className="pymt-qr" src={panelQrUrl} alt="Payment QR code" />
              ) : (
                <div className="pymt-qr pymt-qr-empty">
                  <AlertCircle size={20} />
                  <span>{hostMethod ? "The organizer hasn't added a QR yet — contact them." : "QR not configured yet — contact support."}</span>
                </div>
              )}

              <div className="pymt-done-rows" style={{ marginTop: 14 }}>
                <Row label={hostMethod ? "Pay to" : "Merchant"} value={panelMerchant || "—"} />
                <Row label={METHOD_LABELS[(hostMethod ? hostMethod.method : active!.method)]} value={panelAccount || "—"} />
                <Row label="Amount" value={rs(amount)} accent />
              </div>

              <ol className="pymt-steps">
                {panelSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>

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
              <p className="pymt-fine">
                {hostMethod
                  ? "A screenshot is evidence, not automatic proof — the organizer verifies the amount and transaction ID before your team is confirmed."
                  : "A screenshot is evidence, not automatic proof — our team verifies the merchant, amount and transaction ID before your booking is confirmed."}
              </p>
            </div>
          )}
        </>
      )}
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

// Self-contained styling (not dependent on an ambient .play/.bk-* scope)
// so the same component works inside every different wizard/modal shell
// that renders it (BookingFlow, GameJoinPanel, PlayTogetherPaymentModal,
// PlayTogetherWizard, ...). Colors match the app's existing
// green/cream/ink palette — no new colors introduced.
export const PYMT_CSS = `
.pymt { font-family: 'Inter', system-ui, sans-serif; color: var(--paper, #F2EDE6); }
.pymt-amt { text-align: center; padding: 6px 0 18px; }
.pymt-amt-lbl { display: block; font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; opacity: .55; margin-bottom: 6px; }
.pymt-amt-val { font-family: 'Inter', sans-serif; font-size: 34px; font-weight: 800; color: #006241; }
.pymt-hint { font-size: 13px; opacity: .65; margin: 0 0 10px; text-align: center; }
.pymt-warn {
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  background: rgba(217,119,6,.1); border: 1px solid rgba(217,119,6,.3); color: #d97706;
  border-radius: 12px; padding: 12px 14px;
}
.pymt-methods { display: flex; gap: 10px; margin-bottom: 18px; }
.pymt-method {
  flex: 1; padding: 12px; border-radius: 11px; border: 1px solid rgba(242,237,230,.15);
  background: rgba(255,255,255,.03); cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 700;
  color: inherit; transition: all .2s ease;
}
.pymt-method.on { border-color: #006241; background: rgba(0,98,65,.14); color: #4ADE80; }
.pymt-summary {
  border: 1px solid rgba(242,237,230,.12); border-radius: 14px; margin-bottom: 16px; overflow: hidden;
  background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,0));
}
.pymt-summary-t {
  display: block; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
  opacity: .55; padding: 11px 14px 9px; border-bottom: 1px solid rgba(242,237,230,.08);
}
.pymt-summary .pymt-row { padding: 8px 14px; }
.pymt-summary .pymt-row + .pymt-row { border-top: 1px solid rgba(242,237,230,.055); }
.pymt-panel {
  background: rgba(255,255,255,.03); border: 1px solid rgba(242,237,230,.1);
  border-radius: 16px; padding: 20px;
}
.pymt-panel h4 { margin: 0 0 14px; font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 700; }
.pymt-qr {
  display: block; width: 100%; max-width: 260px; aspect-ratio: 1; margin: 0 auto;
  border-radius: 14px; background: #fff; object-fit: contain; padding: 12px; box-sizing: border-box;
}
.pymt-qr-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  color: #d97706; background: rgba(217,119,6,.08); border: 1px dashed rgba(217,119,6,.4); font-size: 12px; text-align: center; padding: 20px;
}
.pymt-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; }
.pymt-row-l { opacity: .6; }
.pymt-row-v { font-weight: 700; font-family: 'Inter', sans-serif; }
.pymt-row-v.accent { color: #006241; }
.pymt-steps { margin: 16px 0; padding-left: 20px; font-size: 12.5px; opacity: .75; line-height: 1.8; }
.pymt-label { display: block; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .6; margin: 16px 0 8px; }
.pymt-in {
  width: 100%; box-sizing: border-box; background: rgba(0,0,0,.15); border: 1px solid rgba(242,237,230,.15);
  border-radius: 10px; padding: 12px 14px; color: inherit; font-family: 'Inter', sans-serif; font-size: 14px;
}
.pymt-in:focus { outline: none; border-color: #006241; }
.pymt-in::placeholder { color: rgba(242,237,230,.35); }
.pymt-upload {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px; border-radius: 11px; border: 1px dashed rgba(242,237,230,.25);
  background: transparent; color: inherit; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer;
}
.pymt-upload:hover { border-color: #006241; color: #4ADE80; }
.pymt-shot { position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; border: 1px solid rgba(242,237,230,.15); max-height: 220px; }
.pymt-shot img { width: 100%; max-height: 220px; object-fit: contain; background: #000; display: block; }
.pymt-shot-replace {
  position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,.7); color: #fff;
  font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px;
}
.pymt-err { color: #ef4444; font-size: 12.5px; margin-top: 10px; }
.pymt-submit {
  width: 100%; margin-top: 16px; padding: 14px; border-radius: 12px; border: none;
  background: #006241; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.pymt-submit:disabled { opacity: .5; cursor: not-allowed; }
.pymt-fine { font-size: 11px; opacity: .5; text-align: center; margin: 10px 0 0; line-height: 1.5; }

.pymt-done { text-align: center; padding: 10px 0; }
.pymt-done-mark {
  width: 60px; height: 60px; border-radius: 50%; background: #1e3932; display: grid; place-items: center;
  margin: 0 auto 16px;
}
.pymt-done h3 { font-family: 'Inter', sans-serif; font-size: 21px; margin: 0 0 16px; }
.pymt-done-rows {
  text-align: left; background: rgba(255,255,255,.03); border: 1px solid rgba(242,237,230,.1);
  border-radius: 12px; padding: 4px 16px; margin-bottom: 16px;
}
.pymt-done-msg { font-size: 13.5px; opacity: .75; line-height: 1.55; max-width: 380px; margin: 0 auto; }
.pymt-done-footer { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }

[data-theme="paper"] .pymt-method { background: rgba(20,23,30,.03); border-color: rgba(20,23,30,.12); }
[data-theme="paper"] .pymt-panel { background: rgba(20,23,30,.02); border-color: rgba(20,23,30,.1); }
[data-theme="paper"] .pymt-in { background: #fff; border-color: rgba(20,23,30,.14); }
[data-theme="paper"] .pymt-in::placeholder { color: rgba(20,23,30,.35); }
[data-theme="paper"] .pymt-done-rows { background: #fff; border-color: rgba(20,23,30,.1); }
[data-theme="paper"] .pymt-summary { background: #fff; border-color: rgba(20,23,30,.1); }
[data-theme="paper"] .pymt-summary-t { border-bottom-color: rgba(20,23,30,.08); }
[data-theme="paper"] .pymt-summary .pymt-row + .pymt-row { border-top-color: rgba(20,23,30,.06); }
`;
