"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CircleDot, Target, Wind, Activity, Zap, Trophy,
  MapPin, Calendar, Clock, Users, DollarSign,
  ChevronRight, ChevronLeft, Check, Home,
  Map, PlusCircle, CreditCard, Menu, X, Search,
} from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import KhelumnaMap from "@/components/KhelumnaMap";

const ink     = "#0B0D11";
const inkSoft = "#13161C";
const inkMid  = "#1C2029";
const paper   = "#F2EDE6";
const pink    = "#DE3163";
const turf    = "#2E7D5B";
const slate   = "#8A95A3";

const NAV_LINKS = [
  { label: "Home",       href: "/",        icon: <Home size={15} /> },
  { label: "Discover",   href: "/discover", icon: <Map size={15} /> },
  { label: "Host event", href: "/create",   icon: <PlusCircle size={15} /> },
  { label: "League",     href: "/league",   icon: <Trophy size={15} /> },
  { label: "My card",    href: "/profile",  icon: <CreditCard size={15} /> },
];

const SPORTS = [
  { name: "Football",   icon: <CircleDot size={28} />, color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  { name: "Cricket",    icon: <Target size={28} />,    color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  { name: "Basketball", icon: <Activity size={28} />,  color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { name: "Volleyball", icon: <Wind size={28} />,      color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { name: "Badminton",  icon: <Zap size={28} />,       color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  { name: "Tennis",     icon: <Activity size={28} />,  color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
];

const POSITIONS: Record<string, string[]> = {
  Football:   ["Goalkeeper", "Defender", "Midfielder", "Forward"],
  Cricket:    ["Batsman", "Bowler", "All-rounder", "Wicketkeeper"],
  Basketball: ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"],
  Volleyball: ["Setter", "Libero", "Outside Hitter", "Middle Blocker"],
  Badminton:  ["Singles", "Doubles"],
  Tennis:     ["Singles", "Doubles"],
};

const STYLES = `
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pulseScale {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.18); opacity: 0.55; }
  }
  @keyframes floatY {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-7px); }
  }
  @keyframes spinLoader {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  ::placeholder { color: ${slate}; opacity: 1; }
  .create-sport-card { transition: transform 0.18s, box-shadow 0.18s; }
  .create-sport-card:hover { transform: scale(1.03); }

  .create-nav-links { display: flex; gap: 36px; }
  .create-hamburger { display: none; background: transparent; border: none; cursor: pointer; color: ${paper}; }
  .create-mobile-menu { display: none; flex-direction: column; background: #15181D; border-top: 1px solid rgba(255,255,255,0.08); }
  .create-mobile-menu a { padding: 14px 24px; color: ${paper}; text-decoration: none; font-weight: 600; font-family: 'Inter',sans-serif; border-bottom: 1px solid rgba(255,255,255,0.06); display: block; }
  .create-mobile-open { display: flex !important; }

  @media (max-width: 900px) {
    .create-nav-links { display: none !important; }
    .create-nav-cta-desktop { display: none !important; }
    .create-hamburger { display: block !important; }
  }
`;

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: `1.5px solid ${focused ? pink : "rgba(255,255,255,0.08)"}`,
    background: "rgba(255,255,255,0.05)",
    fontSize: "0.9rem",
    fontFamily: "'Inter',sans-serif",
    color: paper,
    outline: "none",
    boxSizing: "border-box" as const,
    boxShadow: focused ? "0 0 0 3px rgba(222,49,99,0.15)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
}

export default function CreateEvent() {
  const router   = useRouter();
  const supabase = createClient();
  const [step, setStep]           = useState(1);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sport, setSport]         = useState("");
  const [date, setDate]           = useState("");
  const [time, setTime]           = useState("");
  const [venue, setVenue]         = useState("");
  const [venueLat, setVenueLat]   = useState<number | null>(null);
  const [venueLng, setVenueLng]   = useState<number | null>(null);
  const [slots, setSlots]         = useState("10");
  const [fee, setFee]             = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [focusField, setFocusField]   = useState<string | null>(null);

  const selectedSport = SPORTS.find((s) => s.name === sport);

  const publishEvent = async () => {
    setSubmitError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      sessionStorage.setItem("khelumna_pending_intent", JSON.stringify({ type: "host" }));
      router.push("/login");
      return;
    }
    setSubmitting(true);
    const eventDate = new Date(`${date}T${time || "00:00"}`);
    const sportColors: Record<string, string> = {
      Football: "#22c55e", Cricket: "#f97316", Basketball: "#FFC93C",
      Volleyball: "#3b82f6", Badminton: "#a855f7", Tennis: "#ec4899",
    };
    const { error } = await supabase.from("events").insert({
      host_id:     user.id,
      sport,
      title:       `${sport} at ${venue}`,
      venue,
      event_date:  eventDate.toISOString(),
      max_players: parseInt(slots, 10) || 10,
      fee:         fee ? parseFloat(fee) : 0,
      description: description || null,
      venue_lat:   venueLat,
      venue_lng:   venueLng,
      sport_color: sportColors[sport] ?? "#DE3163",
      flash:       false,
    });
    setSubmitting(false);
    if (error) { setSubmitError(error.message); return; }
    setSubmitted(true);
  };

  const togglePosition = (pos: string) =>
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );

  const steps = [
    { num: 1, label: "Sport",   icon: <CircleDot size={16} /> },
    { num: 2, label: "Details", icon: <Calendar size={16} /> },
    { num: 3, label: "Slots",   icon: <Users size={16} /> },
  ];

  const resetForm = () => {
    setSubmitted(false); setStep(1); setSport(""); setDate(""); setTime("");
    setVenue(""); setVenueLat(null); setVenueLng(null);
    setSlots("10"); setFee(""); setPositions([]); setDescription("");
  };

  if (submitted) {
    return (
      <>
        <style>{STYLES}</style>
        <AnimatedBackground accent1="#DE3163" accent2="#2E7D5B" accent3="#FFC93C" />
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", background: ink, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>
          <div style={{ background: inkSoft, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "24px", padding: "3rem 2.5rem", textAlign: "center", maxWidth: "460px", width: "90%", boxShadow: "0 4px 32px rgba(0,0,0,0.4)", animation: "slideUp 0.4s ease" }}>
            <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", boxShadow: "0 0 24px rgba(34,197,94,0.25)" }}>
              <Check size={32} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 900, margin: "0 0 0.5rem", letterSpacing: "-0.5px", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Event published!</h2>
            <p style={{ color: slate, fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 0.5rem" }}>
              Your <strong style={{ color: paper }}>{sport}</strong> event at <strong style={{ color: paper }}>{venue}</strong> is now live.
            </p>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 16px", fontSize: "0.82rem", color: slate, margin: "1.25rem 0 1.75rem", fontFamily: "'JetBrains Mono',monospace" }}>
              khelumna.com/e/{sport.toLowerCase()}-{venue.toLowerCase().replace(/\s/g, "-")}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={resetForm} style={{ background: pink, color: "#fff", border: "none", padding: "12px 28px", borderRadius: "12px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif", boxShadow: `0 6px 20px ${pink}44` }}>
                <PlusCircle size={15} /> Host another
              </button>
              <a href="/discover">
                <button style={{ background: "rgba(255,255,255,0.07)", color: paper, border: "1px solid rgba(255,255,255,0.1)", padding: "12px 28px", borderRadius: "12px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif" }}>
                  <Map size={15} /> View on map
                </button>
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <AnimatedBackground accent1="#DE3163" accent2="#2E7D5B" accent3="#FFC93C" />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", background: ink, color: paper, fontFamily: "'Inter',sans-serif" }}>

        {/* NAV */}
        <nav style={{ background: "rgba(11,13,17,0.82)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 64px", gap: "16px" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "2px", textDecoration: "none" }}>
              <span style={{ fontSize: "22px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Khelum</span>
              <span style={{ fontSize: "22px", fontWeight: 800, color: pink, fontFamily: "'Bricolage Grotesque',sans-serif" }}> Na.</span>
            </a>
            <div className="create-nav-links" style={{ fontFamily: "'Inter',sans-serif" }}>
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} style={{ color: link.href === "/create" ? pink : slate, textDecoration: "none", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                  {link.icon}{link.label}
                </a>
              ))}
            </div>
            <div className="create-nav-cta-desktop">
              <a href="/discover">
                <button style={{ background: pink, border: "none", color: "#fff", padding: "10px 20px", borderRadius: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif", boxShadow: `0 6px 20px ${pink}44` }}>
                  <Search size={14} /> Find game
                </button>
              </a>
            </div>
            <button className="create-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          <div className={`create-mobile-menu${menuOpen ? " create-mobile-open" : ""}`}>
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href} style={{ color: link.href === "/create" ? pink : paper }} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        {/* PAGE CONTENT */}
        <div style={{ maxWidth: "700px", margin: "0 auto", padding: "3rem 1.5rem" }}>

          {/* Page header */}
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(222,49,99,0.1)", border: "1px solid rgba(222,49,99,0.2)", color: pink, fontSize: "12px", fontWeight: 700, padding: "6px 14px", borderRadius: "100px", marginBottom: "1rem", letterSpacing: "0.05em" }}>
              <PlusCircle size={12} /> HOST AN EVENT
            </div>
            <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 900, letterSpacing: "-1px", margin: "0 0 0.5rem", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Create your event
            </h1>
            <p style={{ color: slate, fontSize: "0.95rem" }}>Takes 2 minutes. Anyone can do it.</p>
          </div>

          {/* STEP INDICATOR */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2.5rem" }}>
            {steps.map((s, i) => (
              <div key={s.num} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "50%",
                    background: step > s.num ? "#22c55e" : step === s.num ? pink : inkMid,
                    border: step >= s.num ? "none" : `2px solid ${slate}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s",
                    boxShadow: step === s.num ? `0 0 0 4px rgba(222,49,99,0.2)` : step > s.num ? "0 0 0 4px rgba(34,197,94,0.15)" : "none",
                  }}>
                    {step > s.num
                      ? <Check size={18} color="#fff" />
                      : <span style={{ color: step === s.num ? "#fff" : slate }}>{s.icon}</span>
                    }
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: step >= s.num ? paper : slate, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: "100px", height: "2px", background: step > s.num ? "#22c55e" : "rgba(255,255,255,0.08)", margin: "0 8px", marginBottom: "22px", transition: "background 0.4s" }} />
                )}
              </div>
            ))}
          </div>

          {/* FORM CARD */}
          <div style={{ background: inkSoft, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "24px", padding: "2.5rem", boxShadow: "0 4px 32px rgba(0,0,0,0.4)" }}>

            {/* STEP 1 — SPORT */}
            {step === 1 && (
              <div style={{ animation: "slideUp 0.35s ease" }}>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.4rem", letterSpacing: "-0.3px", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>What sport are you hosting?</h2>
                <p style={{ color: slate, fontSize: "0.88rem", margin: "0 0 1.75rem" }}>Pick one to get started</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px", marginBottom: "2rem" }}>
                  {SPORTS.map((s) => (
                    <button key={s.name} onClick={() => setSport(s.name)} className="create-sport-card" style={{
                      background: sport === s.name ? s.bg : "rgba(255,255,255,0.04)",
                      border: `2px solid ${sport === s.name ? s.color : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "20px", padding: "1.25rem 1rem", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
                      boxShadow: sport === s.name ? `0 4px 20px ${s.color}33` : "none",
                    }}>
                      <span style={{ color: s.color }}>{s.icon}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: sport === s.name ? s.color : paper, fontFamily: "'Inter',sans-serif" }}>{s.name}</span>
                      {sport === s.name && (
                        <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={12} color="#fff" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => sport && setStep(2)} disabled={!sport} style={{
                  width: "100%", background: sport ? pink : "rgba(255,255,255,0.08)",
                  color: sport ? "#fff" : slate, border: "none", padding: "14px", borderRadius: "12px",
                  fontSize: "0.95rem", fontWeight: 700, cursor: sport ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  transition: "all 0.2s", boxShadow: sport ? `0 6px 20px ${pink}44` : "none",
                  fontFamily: "'Inter',sans-serif",
                }}>
                  Continue <ChevronRight size={18} />
                </button>
              </div>
            )}

            {/* STEP 2 — DETAILS */}
            {step === 2 && (
              <div style={{ animation: "slideUp 0.35s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.4rem" }}>
                  {selectedSport && <span style={{ color: selectedSport.color }}>{selectedSport.icon}</span>}
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-0.3px", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Event details</h2>
                </div>
                <p style={{ color: slate, fontSize: "0.88rem", margin: "0 0 1.75rem" }}>When and where is the {sport} happening?</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><Calendar size={13} /> Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      style={inputStyle(focusField === "date")}
                      onFocus={() => setFocusField("date")} onBlur={() => setFocusField(null)} />
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><Clock size={13} /> Start time</label>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                      style={inputStyle(focusField === "time")}
                      onFocus={() => setFocusField("time")} onBlur={() => setFocusField(null)} />
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><MapPin size={13} /> Venue / Location</label>
                  <input type="text" placeholder="e.g. Dasarath Stadium, Kalanki Ground…" value={venue} onChange={(e) => setVenue(e.target.value)}
                    style={inputStyle(focusField === "venue")}
                    onFocus={() => setFocusField("venue")} onBlur={() => setFocusField(null)} />
                  {/* Map preview + Google Maps link */}
                  <div style={{ marginTop: "10px", borderRadius: "12px", overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.08)", position: "relative" as const }}>
                    <KhelumnaMap
                      center={[27.7172, 85.324]}
                      zoom={13}
                      height="200px"
                      pickMode
                      pins={venue ? [{ id: "ev", lat: venueLat ?? 27.7172, lng: venueLng ?? 85.324, label: venue, color: pink }] : []}
                      onPick={(lat, lng) => { setVenueLat(lat); setVenueLng(lng); }}
                    />
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(venue || "Kathmandu Nepal")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ position: "absolute", bottom: "10px", right: "10px", zIndex: 1000, background: "rgba(11,13,17,0.85)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: paper, textDecoration: "none", display: "flex", alignItems: "center", gap: "5px", fontFamily: "'Inter',sans-serif" }}
                    >
                      <MapPin size={12} color={pink} /> Open in Google Maps
                    </a>
                  </div>
                </div>

                <div style={{ marginBottom: "1.75rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><Activity size={13} /> Description (optional)</label>
                  <textarea placeholder="Any rules, skill level, what to bring…" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    style={{ ...inputStyle(focusField === "desc"), resize: "vertical" } as React.CSSProperties}
                    onFocus={() => setFocusField("desc")} onBlur={() => setFocusField(null)} />
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={() => setStep(1)} style={{ background: "rgba(255,255,255,0.07)", color: paper, border: "1px solid rgba(255,255,255,0.1)", padding: "14px 20px", borderRadius: "12px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif" }}>
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button onClick={() => (date && time && venue) && setStep(3)} disabled={!date || !time || !venue} style={{
                    flex: 1, background: (date && time && venue) ? pink : "rgba(255,255,255,0.08)",
                    color: (date && time && venue) ? "#fff" : slate, border: "none", padding: "14px", borderRadius: "12px",
                    fontSize: "0.95rem", fontWeight: 700, cursor: (date && time && venue) ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: (date && time && venue) ? `0 6px 20px ${pink}44` : "none", fontFamily: "'Inter',sans-serif",
                  }}>
                    Continue <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 — SLOTS & FEE */}
            {step === 3 && (
              <div style={{ animation: "slideUp 0.35s ease" }}>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.4rem", letterSpacing: "-0.3px", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Players &amp; fee</h2>
                <p style={{ color: slate, fontSize: "0.88rem", margin: "0 0 1.75rem" }}>How many players and what does it cost?</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><Users size={13} /> Total slots</label>
                    <input type="number" min="2" max="100" value={slots} onChange={(e) => setSlots(e.target.value)}
                      style={inputStyle(focusField === "slots")}
                      onFocus={() => setFocusField("slots")} onBlur={() => setFocusField(null)} />
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><DollarSign size={13} /> Fee per player (Rs.)</label>
                    <input type="number" min="0" placeholder="0 = Free" value={fee} onChange={(e) => setFee(e.target.value)}
                      style={inputStyle(focusField === "fee")}
                      onFocus={() => setFocusField("fee")} onBlur={() => setFocusField(null)} />
                  </div>
                </div>

                {sport && POSITIONS[sport] && (
                  <div style={{ marginBottom: "1.75rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", fontWeight: 700, color: slate, marginBottom: "8px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                      <Target size={13} /> Positions needed <span style={{ fontSize: "0.7rem", fontWeight: 500, opacity: 0.6, textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "8px" }}>
                      {POSITIONS[sport].map((pos) => (
                        <button key={pos} onClick={() => togglePosition(pos)} style={{
                          padding: "7px 16px", borderRadius: "100px",
                          border: `1.5px solid ${positions.includes(pos) ? pink : "rgba(255,255,255,0.12)"}`,
                          background: positions.includes(pos) ? "rgba(222,49,99,0.12)" : "rgba(255,255,255,0.04)",
                          color: positions.includes(pos) ? pink : slate,
                          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                          transition: "all 0.15s", display: "flex", alignItems: "center", gap: "5px",
                          fontFamily: "'Inter',sans-serif",
                        }}>
                          {positions.includes(pos) && <Check size={12} />}{pos}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: slate, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: "0.75rem", margin: "0 0 0.75rem" }}>Event summary</p>
                  {[
                    { icon: <CircleDot size={14} />, label: "Sport",  val: sport },
                    { icon: <Calendar size={14} />,  label: "Date",   val: date },
                    { icon: <Clock size={14} />,     label: "Time",   val: time },
                    { icon: <MapPin size={14} />,    label: "Venue",  val: venue },
                    { icon: <Users size={14} />,     label: "Slots",  val: slots },
                    { icon: <DollarSign size={14} />,label: "Fee",    val: fee ? `Rs. ${fee}` : "Free" },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem" }}>
                      <span style={{ color: pink }}>{row.icon}</span>
                      <span style={{ color: slate, minWidth: "60px", fontFamily: "'Inter',sans-serif" }}>{row.label}</span>
                      <span style={{ fontWeight: 600, color: paper, fontFamily: "'Inter',sans-serif" }}>{row.val || "—"}</span>
                    </div>
                  ))}
                </div>

                {submitError && <p style={{ color: pink, fontSize: "0.85rem", marginBottom: "10px", fontFamily: "'Inter',sans-serif" }}>{submitError}</p>}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={() => setStep(2)} style={{ background: "rgba(255,255,255,0.07)", color: paper, border: "1px solid rgba(255,255,255,0.1)", padding: "14px 20px", borderRadius: "12px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif" }}>
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button onClick={publishEvent} disabled={submitting} style={{
                    flex: 1, background: pink, color: "#fff", border: "none", padding: "14px", borderRadius: "12px",
                    fontSize: "0.95rem", fontWeight: 700, cursor: submitting ? "default" : "pointer",
                    opacity: submitting ? 0.8 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: `0 6px 20px ${pink}44`, fontFamily: "'Inter',sans-serif",
                  }}>
                    {submitting
                      ? <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", display: "inline-block", animation: "spinLoader 0.7s linear infinite", flexShrink: 0 }} />
                      : <Zap size={16} fill="#fff" />
                    }
                    {submitting ? "Publishing…" : "Publish event"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// Suppress unused-import warning for turf
void turf;
