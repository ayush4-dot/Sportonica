"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "player" | "venue_owner";

function SignupInner() {
  const sb = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("player");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signup() {
    if (!name || !email || !password) { setErr("Fill in every field to continue."); return; }
    if (password.length < 6) { setErr("Password needs at least 6 characters."); return; }
    setLoading(true); setErr(null); setNote(null);

    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name, role } },
    });
    if (error) { setErr(error.message); setLoading(false); return; }

    if (!data.session) {
      setNote("Almost there — check your email to confirm your account, then sign in.");
      setLoading(false);
      return;
    }

    if (redirect) router.push(redirect);
    else router.push(role === "venue_owner" ? "/admin" : "/discover");
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
          <h2>Two ways to <em>play.</em></h2>
          <p>Join as a player to host and find matches — or list your venue and start taking bookings today.</p>
        </div>
        <div className="auth-foot">KATHMANDU · SINCE 2026</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p className="sub">One minute, then you&apos;re in.</p>

          <div className="auth-field">
            <label>I want to</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <RoleCard active={role === "player"} onClick={() => setRole("player")} title="Play" desc="Host & join games" />
              <RoleCard active={role === "venue_owner"} onClick={() => setRole("venue_owner")} title="List a venue" desc="Take bookings" />
            </div>
          </div>

          <div className="auth-field">
            <label>Full name</label>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayush Poddar" />
          </div>
          <div className="auth-field">
            <label>Email</label>
            <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input className="auth-input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signup()}
              placeholder="At least 6 characters" />
          </div>

          {err && <div className="auth-error">{err}</div>}
          {note && <div className="auth-note">{note}</div>}

          <button className="auth-btn" onClick={signup} disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>

          <div className="auth-or"><span>or</span></div>
          <GoogleButton next={redirect ?? "/discover"} label="Sign up with Google" />

          <div className="auth-alt">
            Already have an account?{" "}
            <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login"}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        textAlign: "left", cursor: "pointer",
        background: active ? "rgba(167,139,250,0.12)" : "var(--panel)",
        border: `1px solid ${active ? "rgba(167,139,250,0.4)" : "var(--line-2)"}`,
        borderRadius: 11, padding: "12px 13px",
        transition: "all 0.35s cubic-bezier(0.22,1,0.36,1)",
        color: "inherit", fontFamily: "inherit",
      }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: active ? "var(--sodium)" : "var(--text)" }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>{desc}</div>
    </button>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth" />}>
      <SignupInner />
    </Suspense>
  );
}
