"use client";

import { useState, useTransition } from "react";
import { Check, Lock, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccount } from "@/lib/auth/actions";
import { isActionError } from "@/lib/actionError";
import { PASSWORD_MIN } from "@/lib/validation/password";

export default function SecuritySettings({ name }: { name: string }) {
  const [pending, startTransition] = useTransition();

  // ── Change password ──
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  function changePassword() {
    setPwMsg(null);
    if (pw.length < PASSWORD_MIN) { setPwMsg(`Password needs at least ${PASSWORD_MIN} characters.`); return; }
    if (pw !== confirm) { setPwMsg("Those passwords don't match."); return; }
    startTransition(async () => {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (error) {
        const m = error.message.toLowerCase();
        setPwMsg(
          m.includes("different from the old")
            ? "Choose a password you haven't used before."
            : "Couldn't update your password. Please try again.",
        );
        return;
      }
      setPw(""); setConfirm("");
      setPwOk(true);
      setTimeout(() => setPwOk(false), 2200);
    });
  }

  // ── Delete account ──
  const [danger, setDanger] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [delMsg, setDelMsg] = useState<string | null>(null);
  const canDelete = ack && typed.trim().toUpperCase() === "DELETE";

  function removeAccount() {
    if (!canDelete) return;
    setDelMsg(null);
    startTransition(async () => {
      const res = await deleteMyAccount();
      if (isActionError(res)) { setDelMsg(res.message); return; }
      try { await createClient().auth.signOut(); } catch { /* going home regardless */ }
      window.location.href = "/";
    });
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Change password */}
      <div className="pf-card">
        <h2 className="pf-card-t"><Lock size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Password</h2>
        <p style={{ fontSize: 12.5, color: "var(--pf-dim)", marginTop: -4, marginBottom: 16 }}>
          Sets a password you can use to sign in with your email — handy even if you normally
          use Google or your phone number.
        </p>

        <Field label="New password">
          <input className="pf-in" type="password" autoComplete="new-password"
            value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input className="pf-in" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && changePassword()} />
        </Field>

        {pwMsg && <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 10 }}>{pwMsg}</div>}

        <div style={{ marginTop: 16 }}>
          <button className="pf-btn" onClick={changePassword} disabled={pending || !pw || !confirm}>
            {pwOk ? <><Check size={15} /> Password updated</> : pending ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="pf-card" style={{ borderColor: "rgba(239,68,68,0.35)" }}>
        <h2 className="pf-card-t" style={{ color: "#dc2626" }}>
          <ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Delete account
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--pf-dim)", marginTop: -4 }}>
          Permanently deletes your account, profile, and play history. Bookings you&apos;ve
          paid for are not refunded automatically. This can&apos;t be undone.
        </p>

        {!danger ? (
          <button className="pf-btn ghost" style={{ marginTop: 14, borderColor: "rgba(239,68,68,0.4)", color: "#dc2626" }}
            onClick={() => setDanger(true)}>
            Delete my account
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I understand this permanently deletes my Sportonica account, {name}.</span>
            </label>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--pf-dim)", marginBottom: 7 }}>
                Type <b>DELETE</b> to confirm
              </label>
              <input className="pf-in" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" />
            </div>

            {delMsg && <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 12 }}>{delMsg}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="pf-btn ghost" onClick={() => { setDanger(false); setAck(false); setTyped(""); setDelMsg(null); }} disabled={pending}>
                Cancel
              </button>
              <button className="pf-btn" style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={removeAccount} disabled={pending || !canDelete}>
                {pending ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .pf-in {
          width: 100%; box-sizing: border-box;
          background: transparent; border: 1px solid var(--pf-hair);
          border-radius: 10px; padding: 13px 14px; color: inherit;
          font-family: inherit; font-size: 14px;
        }
        .pf-in:focus { outline: none; border-color: #006241; box-shadow: 0 0 0 3px rgba(0,98,65,0.12); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--pf-dim)", marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}
