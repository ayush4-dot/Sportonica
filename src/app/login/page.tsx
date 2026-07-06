"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import { Building2, ChevronRight } from "lucide-react";

const ink     = "#0B0D11";
const inkSoft = "#13161C";
const inkMid  = "#1C2029";
const paper   = "#F2EDE6";
const pink    = "#DE3163";
const flood   = "#FFC93C";
const turf    = "#2E7D5B";
const slate   = "#8A95A3";

const VENUE_TYPES = ["Futsal court","Basketball court","Cricket ground","Volleyball court","Badminton hall","Multi-sport complex"];

type Mode = "signin" | "signup" | "venue";

export default function LoginPage() {
  const [mode, setMode]             = useState<Mode>("signin");
  const [name, setName]             = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [venueName, setVenueName]   = useState("");
  const [venueType, setVenueType]   = useState("Futsal court");
  const [phone, setPhone]           = useState("");
  const [address, setAddress]       = useState("");
  const [error, setError]           = useState("");
  const [info, setInfo]             = useState("");
  const [loading, setLoading]       = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);

  const supabase = createClient();
  const router   = useRouter();

  const signInWithGoogle = async () => {
    setError("");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const resumeOrGoHome = async (isVenueOwner = false) => {
    if (isVenueOwner) {
      router.push("/admin");
      return;
    }
    const raw = sessionStorage.getItem("khelumna_pending_intent");
    if (raw) {
      sessionStorage.removeItem("khelumna_pending_intent");
      const intent = JSON.parse(raw) as { type: "join" | "host"; eventId?: string };
      if (intent.type === "host") { router.push("/create"); return; }
      if (intent.type === "join" && intent.eventId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from("bookings").insert({ event_id: intent.eventId, user_id: user.id, status: "confirmed" });
        router.push("/discover");
        return;
      }
    }
    router.push("/");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);

    if (mode === "signin") {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) { setError(err.message); return; }
      const isOwner = data.user?.user_metadata?.role === "venue_owner" || data.user?.user_metadata?.role === "admin";
      await resumeOrGoHome(isOwner);

    } else if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, role: "player" } },
      });
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (data.session) await resumeOrGoHome(false);
      else { setInfo("Check your email to confirm your account, then sign in."); setMode("signin"); }

    } else {
      // venue owner registration
      if (!venueName || !phone || !address) {
        setError("Please fill in all venue fields.");
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase.auth.signUp({
        email, password,
        options: {
          data: {
            full_name: name,
            role: "venue_owner",
            venue_name: venueName,
            venue_type: venueType,
            phone,
            address,
          },
        },
      });
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (data.session) {
        await resumeOrGoHome(true);
      } else {
        setInfo("Check your email to confirm your account. Once confirmed, sign in and you'll be taken to your admin panel.");
        setMode("signin");
      }
    }
  };

  const input = (field: string): React.CSSProperties => ({
    width: "100%", padding: "12px 16px", borderRadius: "12px",
    border: `1.5px solid ${focusField === field ? pink : "rgba(255,255,255,0.08)"}`,
    background: "rgba(255,255,255,0.05)", color: paper, fontSize: "14px",
    outline: "none", fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
    boxShadow: focusField === field ? `0 0 0 3px rgba(222,49,99,0.15)` : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  });

  const cardMaxWidth = mode === "venue" ? "520px" : "440px";

  const tabConfig: { id: Mode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Sign up" },
    { id: "venue",  label: "🏟️ Register venue" },
  ];

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes spinLoader {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulseScale {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.18); opacity: 0.55; }
        }
        ::placeholder { color: ${slate}; opacity: 1; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
      `}</style>

      <AnimatedBackground accent1="#DE3163" accent2="#FFC93C" accent3="#2E7D5B" />

      <div style={{
        position: "relative", zIndex: 1, minHeight: "100vh", background: ink,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', sans-serif", padding: "20px", overflow: "hidden",
      }}>
        {/* Glows */}
        <div style={{ position: "absolute", top: "-80px", right: "-60px", width: "480px", height: "480px", borderRadius: "50%", background: `radial-gradient(circle, ${pink}33 0%, transparent 70%)`, filter: "blur(40px)", pointerEvents: "none", animation: "floatY 7s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-120px", left: "-80px", width: "420px", height: "420px", borderRadius: "50%", background: `radial-gradient(circle, ${flood}28 0%, transparent 70%)`, filter: "blur(40px)", pointerEvents: "none", animation: "floatY 9s ease-in-out infinite 1s" }} />

        <div style={{
          width: "100%", maxWidth: cardMaxWidth,
          background: inkSoft, borderRadius: "24px",
          padding: mode === "venue" ? "40px 40px" : "44px 40px",
          border: mode === "venue" ? `1px solid rgba(255,201,60,0.15)` : "1px solid rgba(255,255,255,0.08)",
          boxShadow: mode === "venue"
            ? `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,201,60,0.08)`
            : `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(222,49,99,0.08)`,
          position: "relative", zIndex: 1,
          animation: "slideUp 0.5s ease",
          transition: "max-width 0.3s ease",
        }}>

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <a href="/" style={{ textDecoration: "none", display: "inline-block" }}>
              <span style={{ fontSize: "26px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque', sans-serif" }}>Khelum</span>
              <span style={{ fontSize: "26px", fontWeight: 800, color: pink,  fontFamily: "'Bricolage Grotesque', sans-serif" }}> Na.</span>
            </a>
            <p style={{ fontSize: "13px", color: slate, marginTop: "6px" }}>
              {mode === "signin" ? "Sign in to find your game"
               : mode === "signup" ? "Create a player account"
               : "Register your venue and get your admin panel"}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "4px", marginBottom: "24px", gap: "2px" }}>
            {tabConfig.map(t => (
              <button key={t.id} onClick={() => { setMode(t.id); setError(""); setInfo(""); }} style={{
                flex: 1, padding: "8px 6px", borderRadius: "9px", border: "none",
                cursor: "pointer", fontSize: t.id === "venue" ? "12px" : "13px",
                fontWeight: 700, fontFamily: "'Inter', sans-serif",
                background: mode === t.id
                  ? t.id === "venue" ? "rgba(255,201,60,0.18)" : pink
                  : "transparent",
                color: mode === t.id
                  ? t.id === "venue" ? flood : "#fff"
                  : slate,
                transition: "all 0.2s",
                boxShadow: mode === t.id && t.id !== "venue" ? `0 2px 8px ${pink}44` : "none",
                outline: mode === t.id && t.id === "venue" ? `1.5px solid rgba(255,201,60,0.3)` : "none",
                whiteSpace: "nowrap" as const,
              }}>{t.label}</button>
            ))}
          </div>

          {/* Venue owner badge */}
          {mode === "venue" && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,201,60,0.08)", border: "1px solid rgba(255,201,60,0.2)", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px" }}>
              <Building2 size={16} color={flood} style={{ flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: paper }}>Court / Venue Owner</div>
                <div style={{ fontSize: "12px", color: slate, marginTop: "2px" }}>You&apos;ll get a full admin panel — bookings, slots, revenue & analytics.</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Player signup name */}
            {mode === "signup" && (
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Full name" required style={input("name")}
                onFocus={() => setFocusField("name")} onBlur={() => setFocusField(null)} />
            )}

            {/* Venue owner fields */}
            {mode === "venue" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Your full name" required style={input("ownerName")}
                    onFocus={() => setFocusField("ownerName")} onBlur={() => setFocusField(null)} />
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="Phone number" required style={input("phone")}
                    onFocus={() => setFocusField("phone")} onBlur={() => setFocusField(null)} />
                </div>

                <input type="text" value={venueName} onChange={e => setVenueName(e.target.value)}
                  placeholder="Venue / court name (e.g. Balaju Sports Complex)" required style={input("venueName")}
                  onFocus={() => setFocusField("venueName")} onBlur={() => setFocusField(null)} />

                {/* Venue type chips */}
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: slate, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: "8px" }}>Type of venue</div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px" }}>
                    {VENUE_TYPES.map(vt => (
                      <button type="button" key={vt} onClick={() => setVenueType(vt)} style={{
                        padding: "6px 12px", borderRadius: "100px", border: "none",
                        cursor: "pointer", fontSize: "12px", fontWeight: 600,
                        fontFamily: "'Inter',sans-serif", transition: "all 0.15s",
                        background: venueType === vt ? "rgba(255,201,60,0.15)" : inkMid,
                        color: venueType === vt ? flood : slate,
                        outline: venueType === vt ? `1.5px solid rgba(255,201,60,0.35)` : "1.5px solid rgba(255,255,255,0.06)",
                      }}>{vt}</button>
                    ))}
                  </div>
                </div>

                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Address (e.g. Balaju, Kathmandu)" required style={input("address")}
                  onFocus={() => setFocusField("address")} onBlur={() => setFocusField(null)} />
              </>
            )}

            {/* Email + password (all modes) */}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required style={input("email")}
              onFocus={() => setFocusField("email")} onBlur={() => setFocusField(null)} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)" required minLength={6} style={input("password")}
              onFocus={() => setFocusField("password")} onBlur={() => setFocusField(null)} />

            {error && <p style={{ color: pink, fontSize: "13px", margin: 0 }}>{error}</p>}
            {info  && <p style={{ color: flood, fontSize: "13px", margin: 0 }}>{info}</p>}

            <button type="submit" disabled={loading} style={{
              background: mode === "venue" ? flood : pink,
              color: mode === "venue" ? "#0B0D11" : "#fff",
              border: "none", padding: "14px", borderRadius: "12px",
              fontSize: "15px", fontWeight: 700, fontFamily: "'Inter', sans-serif",
              cursor: loading ? "default" : "pointer", marginTop: "4px",
              opacity: loading ? 0.8 : 1,
              boxShadow: mode === "venue" ? `0 6px 20px ${flood}44` : `0 6px 20px ${pink}44`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            }}>
              {loading
                ? <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2.5px solid rgba(0,0,0,0.2)", borderTopColor: mode === "venue" ? "#0B0D11" : "#fff", display: "inline-block", animation: "spinLoader 0.7s linear infinite" }} />
                : mode === "venue" ? <Building2 size={16} /> : null
              }
              {loading ? "Please wait…"
               : mode === "signin" ? "Sign in"
               : mode === "signup" ? "Create account"
               : <>Register venue <ChevronRight size={15}/></>}
            </button>
          </form>

          {/* Divider + Google (not shown for venue mode) */}
          {mode !== "venue" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "20px 0" }}>
                <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
                <span style={{ fontSize: "12px", color: slate }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
              </div>
              <button onClick={signInWithGoogle} style={{
                width: "100%", background: "#fff", border: "none", padding: "13px",
                borderRadius: "12px", fontSize: "14px", fontWeight: 600,
                fontFamily: "'Inter', sans-serif", color: "#1e293b", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Venue mode footer note */}
          {mode === "venue" && (
            <p style={{ textAlign: "center" as const, fontSize: "12px", color: slate, marginTop: "16px", lineHeight: 1.5 }}>
              Already registered? <button onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: flood, fontWeight: 700, cursor: "pointer", fontSize: "12px", fontFamily: "'Inter',sans-serif" }}>Sign in here</button>
            </p>
          )}

        </div>
      </div>
    </>
  );
}
