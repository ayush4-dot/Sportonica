"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const sb = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect"); // where they were headed, if gated
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!email || !password) { setErr("Enter your email and password."); return; }
    setLoading(true); setErr(null);

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setLoading(false); return; }

    // 1) If they were sent here from a gated page, return them there.
    // 2) Otherwise route by role: owners → console, players → discover.
    if (redirect) {
      router.push(redirect);
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
          <div className="auth-brand-mark">K</div>
          <div className="auth-brand-name">Khelam Na</div>
        </div>
        <div className="auth-tagline">
          <h2>The game&apos;s already on. <em>Come find it.</em></h2>
          <p>Book courts, host matches, and fill your ground — all from one place.</p>
        </div>
        <div className="auth-foot">KATHMANDU · SINCE 2026</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="sub">Sign in to keep playing.</p>

          <div className="auth-field">
            <label>Email</label>
            <input className="auth-input" type="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input className="auth-input" type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()} />
          </div>

          {err && <div className="auth-error">{err}</div>}

          <button className="auth-btn" onClick={login} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="auth-or"><span>or</span></div>
          <GoogleButton next={redirect ?? "/discover"} label="Sign in with Google" />

          <div className="auth-alt">
            New here?{" "}
            <Link href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : "/signup"}>
              Create an account
            </Link>
          </div>
        </div>
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
