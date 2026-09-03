"use client";

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { Lock, AtSign } from "lucide-react";
import GoogleButton from "@/components/GoogleButton";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import IdentityBadge from "@/components/auth/IdentityBadge";
import SubmitButton from "@/components/auth/SubmitButton";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeEmail, isValidEmail, isValidLocalPhone, looksLikeEmail,
} from "@/lib/validation/identity";
import { safeRedirect } from "@/lib/validation/redirect";
import { resolveEmailForPhone } from "@/lib/auth/actions";
import { isActionError } from "@/lib/actionError";

// Shown for any failed sign-in regardless of cause, so an attacker can't
// tell "no such account" from "wrong password" (spec §21).
const BAD_CREDENTIALS = "The email/phone number or password is incorrect.";
const BAD_IDENTIFIER = "Enter a valid email address or a 10-digit mobile number.";

function LoginInner() {
  const sb = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const identifierValid = useMemo(() => {
    const id = identifier.trim();
    if (!id) return false;
    return looksLikeEmail(id) ? isValidEmail(id) : isValidLocalPhone(id);
  }, [identifier]);

  async function login() {
    const id = identifier.trim();
    if (!id || !password) { setErr("Enter your mobile number or email, and your password."); return; }

    let signInEmail: string;
    if (looksLikeEmail(id)) {
      if (!isValidEmail(id)) { setErr(BAD_IDENTIFIER); return; }
      signInEmail = normalizeEmail(id);
    } else {
      if (!isValidLocalPhone(id)) { setErr(BAD_IDENTIFIER); return; }
      setLoading(true); setErr(null);
      const resolved = await resolveEmailForPhone(id);
      if (isActionError(resolved)) { setErr(BAD_CREDENTIALS); setLoading(false); return; }
      signInEmail = resolved.email;
    }

    setLoading(true); setErr(null);
    const { data, error } = await sb.auth.signInWithPassword({ email: signInEmail, password });
    if (error) { setErr(BAD_CREDENTIALS); setLoading(false); return; }

    if (redirect) {
      router.push(safeRedirect(redirect));
    } else {
      const role = data.user?.user_metadata?.role;
      router.push(role === "venue_owner" || role === "admin" ? "/admin" : "/discover");
    }
    router.refresh();
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
          <h2>The game&apos;s already on. <em>Come find it.</em></h2>
          <p>Book courts, host matches, and fill your ground — all from one place.</p>
        </div>
        <div className="auth-foot">KATHMANDU · SINCE 2026</div>
      </div>

      <div className="auth-form-wrap">
        <AuthCard>
          <h1>Welcome back</h1>
          <p className="sub">Sign in to keep playing.</p>

          <AuthInput
            label="Mobile number or email"
            value={identifier}
            onChange={setIdentifier}
            icon={<AtSign size={17} />}
            autoComplete="username"
            inputMode="email"
            right={<IdentityBadge value={identifier} />}
            valid={identifierValid}
            onEnter={login}
          />
          <AuthInput
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            icon={<Lock size={16} />}
            autoComplete="current-password"
            onEnter={login}
          />

          {err && <div className="auth-error">{err}</div>}

          <SubmitButton loading={loading} onClick={login}>Sign in</SubmitButton>

          <div className="auth-or"><span>or</span></div>
          <GoogleButton next={safeRedirect(redirect)} label="Sign in with Google" />

          <div className="auth-alt">
            New here?{" "}
            <Link href={redirect ? `/signup?redirect=${encodeURIComponent(safeRedirect(redirect))}` : "/signup"}>
              Create an account
            </Link>
          </div>
        </AuthCard>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth" />}>
      <LoginInner />
    </Suspense>
  );
}
