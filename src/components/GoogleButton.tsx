"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";

// Google's own mark — required by their branding guidelines if you say
// "Sign in with Google".
function GoogleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.7 35.9 44 30.6 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function GoogleButton({
  next = "/discover",
  label = "Continue with Google",
}: { next?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    console.log("[GoogleButton] clicked — starting OAuth", { next });
    setPending(true); setErr(null);
    // The ?next= query param on redirectTo isn't reliably preserved
    // through the full Google → Supabase → app round trip (it's landed
    // back on the default /discover instead more than once) —
    // sessionStorage survives that trip in the same tab regardless of
    // what happens to the URL, so AppHeader.tsx picks this up once the
    // session actually appears and finishes the redirect from there.
    try {
      if (next && next !== "/discover") sessionStorage.setItem("post-login-redirect", next);
    } catch { /* private mode / storage disabled — falls back to /discover, not fatal */ }
    const sb = createClient();
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    console.log("[GoogleButton] supabase replied", { data, error });
    if (error) { setErr(error.message); setPending(false); return; }
    if (!data?.url) return;
    // Google blocks OAuth entirely inside an embedded/wrapped WebView
    // (Error 400: disallowed_useragent) — in the native app this has to
    // open in the system browser (Custom Tabs / SFSafariViewController)
    // instead of navigating the app's own WebView. CapacitorBridge.tsx
    // listens for the app being reopened via the Universal/App Link once
    // Google → /auth/callback finishes and brings the user back in.
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: data.url });
    } else {
      window.location.href = data.url;
    }
  }

  return (
    <>
      <button type="button" className="g-btn" onClick={signIn} disabled={pending}>
        <GoogleMark />
        {pending ? "Opening Google…" : label}
      </button>
      {err && <p className="g-err">{err}</p>}

      <style>{`
        .g-btn {
          width: 100%; display: inline-flex; align-items: center; justify-content: center;
          gap: 10px; padding: 13px 18px; border-radius: 12px; cursor: pointer;
          background: #FFFFFF; color: #1F1F1F; border: 1px solid rgba(0,0,0,0.12);
          font-family: inherit; font-size: 14.5px; font-weight: 600;
          transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s;
        }
        .g-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px -10px rgba(0,0,0,.5); }
        .g-btn:disabled { opacity: .65; cursor: default; }
        .g-err { color: #ef4444; font-size: 12.5px; margin: 8px 0 0; }
      `}</style>
    </>
  );
}
