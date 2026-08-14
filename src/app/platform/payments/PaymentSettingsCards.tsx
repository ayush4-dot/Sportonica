"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2 } from "lucide-react";
import {
  uploadPaymentQr, removePaymentQr, setPaymentMethodConfig,
} from "@/lib/payments/adminActions";
import { paymentQrPublicUrl } from "@/lib/payments/types";
import { isActionError } from "@/lib/actionError";
import type { PaymentMethodConfig } from "@/lib/payments/types";

type Row = PaymentMethodConfig & { updated_by_name: string | null };

export default function PaymentSettingsCards({ initialMethods }: { initialMethods: Row[] }) {
  return (
    <div className="pmc-grid">
      {initialMethods.map((m) => <MethodCard key={m.method} method={m} />)}
      <style>{PMC_CSS}</style>
    </div>
  );
}

function MethodCard({ method }: { method: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState(method.merchant_name);
  const [account, setAccount] = useState(method.account_identifier ?? "");
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErr("QR image must be under 5 MB."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        const res = await uploadPaymentQr(method.method, file);
        if (isActionError(res)) { setErr(res.message); return; }
        router.refresh();
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : "Upload failed.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function removeQr() {
    startTransition(async () => {
      try {
        const res = await removePaymentQr(method.method);
        if (isActionError(res)) { setErr(res.message); return; }
        router.refresh();
      }
      catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't remove QR."); }
    });
  }

  function toggleEnabled() {
    startTransition(async () => {
      try {
        const res = await setPaymentMethodConfig(method.method, { enabled: !method.enabled });
        if (isActionError(res)) { setErr(res.message); return; }
        router.refresh();
      }
      catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't update status."); }
    });
  }

  function saveDetails() {
    startTransition(async () => {
      try {
        const res = await setPaymentMethodConfig(method.method, { merchant_name: merchantName, account_identifier: account });
        if (isActionError(res)) { setErr(res.message); return; }
        setEditing(false);
        router.refresh();
      } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't save."); }
    });
  }

  const qrUrl = paymentQrPublicUrl(method.qr_path);

  return (
    <div className="pmc-card">
      <div className="pmc-head">
        <h3>{method.method === "esewa" ? "eSewa" : "Khalti"}</h3>
        <span className={`pmc-status ${method.enabled ? "on" : "off"}`}>
          <span className="dot" /> {method.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      <div className="pmc-qr">
        {qrUrl ? <img src={qrUrl} alt={`${method.method} QR`} /> : <span>No QR uploaded</span>}
      </div>

      {editing ? (
        <div className="pmc-edit">
          <label>Merchant name</label>
          <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
          <label>{method.method === "esewa" ? "eSewa number / merchant ID" : "Khalti number / merchant ID"}</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="98XXXXXXXX" />
          <div className="pmc-edit-actions">
            <button className="dt-btn ok" disabled={pending} onClick={saveDetails}>Save</button>
            <button className="dt-btn" disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="pmc-info" onClick={() => setEditing(true)}>
          <div className="pmc-info-name">{method.merchant_name}</div>
          <div className="pmc-info-acct">{method.account_identifier || "No account number set — click to add"}</div>
        </div>
      )}

      <div className="pmc-meta">
        <span>Last updated: {new Date(method.updated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <span>Updated by: {method.updated_by_name ?? "—"}</span>
      </div>

      {err && <div className="pmc-err">{err}</div>}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFilePick} style={{ display: "none" }} />
      <div className="pmc-actions">
        <button className="dt-btn" disabled={pending} onClick={() => fileRef.current?.click()}>
          <Upload size={12} /> {method.qr_path ? "Replace QR" : "Upload QR"}
        </button>
        {method.qr_path && (
          <button className="dt-btn bad" disabled={pending} onClick={removeQr}>
            <Trash2 size={12} /> Remove QR
          </button>
        )}
        <button className={`dt-btn ${method.enabled ? "bad" : "ok"}`} disabled={pending} onClick={toggleEnabled}>
          {method.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}

const PMC_CSS = `
.pmc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 30px; }
.pmc-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(242,237,230,0.09); border-radius: 16px; padding: 18px; }
[data-theme="paper"] .pmc-card { background: #fff; border-color: rgba(20,23,30,0.1); }
.pmc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.pmc-head h3 { font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 800; margin: 0; }
.pmc-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; }
.pmc-status .dot { width: 7px; height: 7px; border-radius: 999px; }
.pmc-status.on { color: #2E7D5B; }
.pmc-status.on .dot { background: #2E7D5B; }
.pmc-status.off { opacity: 0.5; }
.pmc-status.off .dot { background: currentColor; }
.pmc-qr {
  aspect-ratio: 1; max-width: 200px; margin: 0 auto 14px; border-radius: 12px;
  background: #fff; display: grid; place-items: center; overflow: hidden;
  border: 1px solid rgba(128,128,128,0.2);
}
.pmc-qr img { width: 100%; height: 100%; object-fit: contain; padding: 10px; box-sizing: border-box; }
.pmc-qr span { font-size: 12px; color: #8A95A3; }
.pmc-info { cursor: pointer; text-align: center; padding: 4px 0 12px; border-radius: 8px; }
.pmc-info:hover { background: rgba(128,128,128,0.06); }
.pmc-info-name { font-weight: 700; font-size: 14px; }
.pmc-info-acct { font-family: 'Inter', sans-serif; font-size: 13px; opacity: 0.7; margin-top: 2px; }
.pmc-edit { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.pmc-edit label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; margin-top: 6px; }
.pmc-edit input {
  padding: 9px 11px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.3);
  background: transparent; color: inherit; font-family: inherit; font-size: 13.5px;
}
.pmc-edit-actions { display: flex; gap: 8px; margin-top: 8px; }
.pmc-meta { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; opacity: 0.5; margin: 10px 0; }
.pmc-err { color: #ef4444; font-size: 12px; margin-bottom: 8px; }
.pmc-actions { display: flex; gap: 8px; flex-wrap: wrap; }
`;
