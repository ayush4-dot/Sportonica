"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_MIN } from "@/lib/validation/password";
import type { DeletionContext } from "@/lib/auth/deleteAccount";
import DeleteAccountDialog from "./DeleteAccountDialog";

export default function SecuritySettings({
  name,
  deletionContext,
}: {
  name: string;
  deletionContext: DeletionContext;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"warning" | "ready">("warning");

  // Coming back from the Google re-auth round trip lands here with ?reauth=1.
  // Re-open the dialog straight at the final confirmation step; the server
  // still independently checks that the session is freshly authenticated.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reauth") === "1") {
      setDialogStep("ready");
      setDialogOpen(true);
      router.replace("/profile/security");
    }
  }, [router]);

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

      {/* Danger zone — deliberately last, well below "Update password" */}
      <div className="pf-danger-card">
        <h2 className="pf-card-t">
          <ShieldAlert size={16} aria-hidden /> Delete Account
        </h2>
        <p>
          Permanently remove your Sportonica account and associated personal data. Future
          bookings are cancelled, and some records are anonymised rather than deleted where
          they must be kept for legal or accounting reasons. This can&apos;t be undone.
        </p>
        <button type="button" className="pf-danger-btn" onClick={() => { setDialogStep("warning"); setDialogOpen(true); }}>
          Delete Account
        </button>
      </div>

      <DeleteAccountDialog
        key={dialogOpen ? `${dialogStep}-open` : "closed"}
        open={dialogOpen}
        initialStep={dialogStep}
        onClose={() => setDialogOpen(false)}
        ctx={deletionContext}
        name={name}
      />

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
