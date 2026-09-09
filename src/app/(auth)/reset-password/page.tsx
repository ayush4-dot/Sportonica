"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import PasswordStrength from "@/components/auth/PasswordStrength";
import SubmitButton from "@/components/auth/SubmitButton";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_MIN } from "@/lib/validation/password";

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPasswordInner() {
  const sb = createClient();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The /auth/callback route exchanges the emailed code for a session and
  // forwards here. Give the cookie a beat to surface, and also listen for
  // the auth event in case it lands just after mount.
  useEffect(() => {
    let done = false;
    const settle = (hasSession: boolean) => {
      if (done) return;
      done = true;
      setPhase(hasSession ? "ready" : "invalid");
    };

    sb.auth.getSession().then(({ data }) => {
      if (data.session) settle(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) settle(true);
    });

    const t = setTimeout(() => settle(false), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [sb]);

  const strong = password.length >= PASSWORD_MIN;
  const confirmValid = useMemo(
    () => confirm.length > 0 && confirm === password && strong,
    [confirm, password, strong],
  );

  async function submit() {
    if (!strong) { setErr(`Password needs at least ${PASSWORD_MIN} characters.`); return; }
    if (password !== confirm) { setErr("Those passwords don't match."); return; }

    setLoading(true); setErr(null);
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      const m = error.message.toLowerCase();
      setErr(
        m.includes("different from the old")
          ? "Choose a password you haven't used before."
          : "Couldn't update your password. Your reset link may have expired — request a new one.",
      );
      setLoading(false);
      return;
    }
    setPhase("done");
    setTimeout(() => { router.push("/discover"); router.refresh(); }, 1200);
  }

  return (
    <div className="auth">
      <div className="auth-stage">
        <div className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark.png" alt="" className="auth-brand-mark" />
          <div className="auth-brand-name">Sportonica</div>
        </div>
        <div className="auth-tagline">
          <h2>New password, <em>fresh start.</em></h2>
          <p>Pick something you&apos;ll remember. You&apos;ll stay signed in on this device.</p>
        </div>
        <div className="auth-foot">NEPAL · SINCE 2026</div>
      </div>

      <div className="auth-form-wrap">
        <AuthCard>
          {phase === "checking" && (
            <>
              <h1>One moment…</h1>
              <p className="sub">Confirming your reset link.</p>
            </>
          )}

          {phase === "invalid" && (
            <>
              <h1>Link expired</h1>
              <p className="sub">
                This password-reset link is invalid or has already been used. Reset links
                last one hour — request a fresh one to continue.
              </p>
              <div className="auth-alt">
                <Link href="/forgot-password">Send a new reset link</Link>
              </div>
            </>
          )}

          {phase === "ready" && (
            <>
              <h1>Set a new password</h1>
              <p className="sub">Choose a new password for your account.</p>

              <AuthInput
                label="New password"
                value={password}
                onChange={setPassword}
                type="password"
                icon={<Lock size={16} />}
                autoComplete="new-password"
                onEnter={submit}
              />
              <PasswordStrength value={password} />
              <AuthInput
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                type="password"
                icon={<Lock size={16} />}
                autoComplete="new-password"
                valid={confirmValid}
                onEnter={submit}
              />

              {err && <div className="auth-error">{err}</div>}

              <SubmitButton loading={loading} onClick={submit}>Update password</SubmitButton>
            </>
          )}

          {phase === "done" && (
            <>
              <div className="auth-check-icon" aria-hidden><ShieldCheck size={22} /></div>
              <h1>Password updated</h1>
              <p className="sub">Taking you to Sportonica…</p>
            </>
          )}
        </AuthCard>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
