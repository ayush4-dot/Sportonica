"use client";

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { AtSign, ArrowLeft, MailCheck } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import SubmitButton from "@/components/auth/SubmitButton";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeEmail, isValidEmail, looksLikeEmail } from "@/lib/validation/identity";

const SUPPORT = "support@sportonica.com";
// Phone-only accounts have a synthetic @phone.sportonica.com address with
// no real inbox — an email reset link can never reach them.
const PHONE_HELP =
  `Password recovery needs an email address. If you signed up with a phone number, contact ${SUPPORT} and we'll help you back in.`;

function ForgotPasswordInner() {
  const sb = createClient();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email")?.trim() ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailValid = useMemo(() => isValidEmail(email.trim()), [email]);

  async function submit() {
    const id = email.trim();
    if (!id) { setErr("Enter the email address for your account."); return; }
    if (!looksLikeEmail(id)) { setErr(PHONE_HELP); return; }
    if (!isValidEmail(id)) { setErr("Enter a valid email address."); return; }

    setLoading(true); setErr(null);
    // Route the email link through the existing PKCE callback, which
    // exchanges the code for a session and forwards to /reset-password.
    await sb.auth.resetPasswordForEmail(normalizeEmail(id), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Always land on the same confirmation — never reveal whether an
    // account exists for this address.
    setLoading(false);
    setSent(true);
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
          <h2>Locked out? <em>Happens to everyone.</em></h2>
          <p>We&apos;ll email you a link to set a new password and get you back on the court.</p>
        </div>
        <div className="auth-foot">NEPAL · SINCE 2026</div>
      </div>

      <div className="auth-form-wrap">
        <AuthCard>
          {sent ? (
            <>
              <div className="auth-check-icon" aria-hidden><MailCheck size={22} /></div>
              <h1>Check your inbox</h1>
              <p className="sub">
                If an account exists for <b>{email.trim()}</b>, a password-reset link is on
                its way. It expires in an hour — check your spam folder if you don&apos;t see it.
              </p>
              <div className="auth-alt">
                <Link href="/login">Back to sign in</Link>
              </div>
            </>
          ) : (
            <>
              <h1>Reset your password</h1>
              <p className="sub">Enter your account email and we&apos;ll send you a reset link.</p>

              <AuthInput
                label="Email address"
                value={email}
                onChange={setEmail}
                type="email"
                icon={<AtSign size={17} />}
                autoComplete="email"
                inputMode="email"
                valid={emailValid}
                onEnter={submit}
              />

              {err && <div className="auth-error">{err}</div>}

              <SubmitButton loading={loading} onClick={submit}>Send reset link</SubmitButton>

              <div className="auth-alt">
                <Link href="/login"><ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back to sign in</Link>
              </div>
            </>
          )}
        </AuthCard>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="auth" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
