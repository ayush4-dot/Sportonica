"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Clock, Zap, CircleDot,
  Trophy, Activity, Wind, Target,
  ChevronRight, X, User,
  Home, Map, PlusCircle, CreditCard,
  Search, Menu, ArrowRight, Loader2, AlertCircle,
} from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import KhelumnaMap from "@/components/KhelumnaMap";
import { useEvents, bookEvent, SPORT_COLOR, type EventRow } from "@/lib/hooks/useEvents";
import { useProfile } from "@/lib/hooks/useProfile";

const ink     = "#0B0D11";
const inkSoft = "#13161C";
const paper   = "#F2EDE6";
const pink    = "#DE3163";
const flood   = "#FFC93C";
const turf    = "#2E7D5B";
const slate   = "#8A95A3";

const STYLES = `
  @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulseScale { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.18);opacity:0.55} }
  * { box-sizing: border-box; }
  .disc-nav-links { display:flex; gap:36px; }
  .disc-hamburger { display:none; background:transparent; border:none; cursor:pointer; color:${paper}; }
  .disc-mobile-menu { display:none; flex-direction:column; background:#15181D; border-top:1px solid rgba(255,255,255,0.08); }
  .disc-mobile-menu a { display:block; padding:14px 24px; font-size:15px; font-weight:600; color:${paper}; text-decoration:none; border-bottom:1px solid rgba(255,255,255,0.06); font-family:'Inter',sans-serif; }
  .disc-mobile-open { display:flex !important; }
  .disc-filter-bar { top:65px; }
  .disc-section { padding:1.5rem 2.5rem 0; }
  .disc-stage { display:grid; grid-template-columns:390px 1fr; height:72vh; min-height:460px; border-radius:20px; overflow:hidden; box-shadow:0 4px 32px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.07); }
  .disc-list { overflow-y:auto; padding:1.25rem 1rem; background:${inkSoft}; border-right:1px solid rgba(255,255,255,0.07); }
  .disc-list::-webkit-scrollbar { width:4px; }
  .disc-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:4px; }
  .disc-event-card { transition:transform 0.15s; }
  .disc-event-card:hover { transform:translateX(-1px); }
  .disc-cta-section { padding:64px 48px 80px; text-align:center; }
  .disc-cta-card { margin:0 auto; padding:48px 40px; max-width:560px; background:${inkSoft}; border-radius:20px; border:1px solid rgba(255,255,255,0.07); box-shadow:0 4px 32px rgba(0,0,0,0.4); }
  @media (max-width:900px) {
    .disc-nav-links { display:none !important; }
    .disc-nav-cta-desktop { display:none !important; }
    .disc-hamburger { display:block !important; }
    .disc-filter-bar { top:57px; }
    .disc-section { padding:1rem 1rem 0; }
    .disc-stage { grid-template-columns:1fr; height:auto; border-radius:16px; }
    .disc-list { border-right:none; border-bottom:1px solid rgba(255,255,255,0.07); max-height:50vh; }
    .disc-map { height:50vh; }
    .disc-cta-section { padding:40px 20px 56px; }
    .disc-cta-card { padding:32px 20px; }
  }
`;

const NAV_LINKS = [
  { label: "Home",       href: "/",         icon: <Home size={15} /> },
  { label: "Discover",   href: "/discover",  icon: <Map size={15} /> },
  { label: "Host event", href: "/create",    icon: <PlusCircle size={15} /> },
  { label: "League",     href: "/league",    icon: <Trophy size={15} /> },
  { label: "My card",    href: "/profile",   icon: <CreditCard size={15} /> },
];

const SPORT_TABS = [
  { label: "All sports", icon: <Activity size={15} /> },
  { label: "Football",   icon: <CircleDot size={15} /> },
  { label: "Basketball", icon: <Target size={15} /> },
  { label: "Volleyball", icon: <Wind size={15} /> },
  { label: "Tennis",     icon: <Activity size={15} /> },
  { label: "Cricket",    icon: <Trophy size={15} /> },
  { label: "Running",    icon: <Zap size={15} /> },
];

function getSportIcon(sport: string, size = 14) {
  switch (sport) {
    case "Basketball": return <Target size={size} />;
    case "Football":   return <CircleDot size={size} />;
    case "Volleyball": return <Wind size={size} />;
    case "Tennis":     return <Activity size={size} />;
    case "Cricket":    return <Trophy size={size} />;
    case "Running":    return <Zap size={size} />;
    default:           return <CircleDot size={size} />;
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff > 0 && diff < 3 * 3600000) {
    const mins = Math.round(diff / 60000);
    return `in ${mins} min`;
  }
  return d.toLocaleDateString([], { weekday: "short" }) + " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Discover() {
  const router = useRouter();
  const { profile } = useProfile();

  const [activeSport, setActiveSport]     = useState("All sports");
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [showFlash, setShowFlash]         = useState(false);
  const [flashEvent, setFlashEvent]       = useState<EventRow | null>(null);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [bookingId, setBookingId]         = useState<string | null>(null);
  const [bookMsg, setBookMsg]             = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const sportFilter = activeSport === "All sports" ? undefined : activeSport;
  const { events, loading, error, reload } = useEvents({ sport: sportFilter, limit: 50 });

  // Show flash popup for first flash event
  useEffect(() => {
    const f = events.find(e => e.flash);
    if (f) { setFlashEvent(f); setShowFlash(true); }
  }, [events]);

  const handleBook = async (ev: EventRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!profile) {
      sessionStorage.setItem("khelumna_pending_intent", JSON.stringify({ type: "join", eventId: ev.id }));
      router.push("/login");
      return;
    }
    if (bookingId === ev.id) return;
    setBookingId(ev.id);
    const { error: err } = await bookEvent(ev.id);
    setBookingId(null);
    if (err === "already_booked") {
      setBookMsg({ id: ev.id, msg: "Already joined!", ok: true });
    } else if (err === "not_authenticated") {
      sessionStorage.setItem("khelumna_pending_intent", JSON.stringify({ type: "join", eventId: ev.id }));
      router.push("/login");
      return;
    } else if (err) {
      setBookMsg({ id: ev.id, msg: err, ok: false });
    } else {
      setBookMsg({ id: ev.id, msg: "Joined ✓", ok: true });
      void reload();
    }
    setTimeout(() => setBookMsg(null), 2500);
  };

  const mapPins = events
    .filter(e => e.venue_lat && e.venue_lng)
    .map(e => ({
      id:    e.id,
      lat:   e.venue_lat!,
      lng:   e.venue_lng!,
      label: e.title,
      sport: e.sport,
      flash: e.flash,
      color: e.sport_color ?? SPORT_COLOR[e.sport] ?? pink,
    }));

  return (
    <>
      <style>{STYLES}</style>
      <AnimatedBackground accent1="#FFC93C" accent2="#DE3163" accent3="#2E7D5B" />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", background: ink, color: paper, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column", overflowX: "hidden" }}>

        {/* NAV */}
        <nav style={{ background: "rgba(11,13,17,0.82)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 64px", gap: "16px" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "2px", textDecoration: "none" }}>
              <span style={{ fontSize: "22px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Khelum</span>
              <span style={{ fontSize: "22px", fontWeight: 800, color: pink, fontFamily: "'Bricolage Grotesque',sans-serif" }}> Na.</span>
            </a>
            <div className="disc-nav-links">
              {NAV_LINKS.map(l => (
                <a key={l.label} href={l.href} style={{ color: l.href === "/discover" ? pink : slate, textDecoration: "none", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>{l.icon}{l.label}</a>
              ))}
            </div>
            <div className="disc-nav-cta-desktop" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <a href="/profile">
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: inkSoft, border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <User size={16} color={slate} />
                </div>
              </a>
              <a href="/discover">
                <button style={{ background: pink, border: "none", color: "#fff", padding: "10px 20px", borderRadius: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif", boxShadow: `0 6px 20px ${pink}44` }}>
                  <Search size={14} /> Find game
                </button>
              </a>
            </div>
            <button className="disc-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
          <div className={`disc-mobile-menu${menuOpen ? " disc-mobile-open" : ""}`}>
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} style={{ color: l.href === "/discover" ? pink : paper }} onClick={() => setMenuOpen(false)}>{l.label}</a>
            ))}
          </div>
        </nav>

        {/* SPORT FILTER */}
        <div className="disc-filter-bar" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 2.5rem", display: "flex", gap: "0.25rem", overflowX: "auto", scrollbarWidth: "none" as const, background: "rgba(11,13,17,0.9)", backdropFilter: "blur(20px)", position: "sticky", zIndex: 99 }}>
          {SPORT_TABS.map(s => (
            <button key={s.label} onClick={() => setActiveSport(s.label)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "14px 16px", background: "none", border: "none", borderBottom: activeSport === s.label ? `2px solid ${pink}` : "2px solid transparent", fontSize: "0.82rem", fontWeight: activeSport === s.label ? 700 : 500, color: activeSport === s.label ? pink : slate, cursor: "pointer", whiteSpace: "nowrap" as const, fontFamily: "'Inter',sans-serif", transition: "all 0.15s" }}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {/* MAIN STAGE */}
        <div className="disc-section">
          <p style={{ fontSize: "0.78rem", color: slate, margin: "0 0 0.75rem 0.25rem", fontWeight: 600 }}>
            {loading ? "Loading events…" : error ? "Could not load events" : `${events.length} upcoming event${events.length !== 1 ? "s" : ""}`}
          </p>

          <div className="disc-stage">
            {/* LEFT — EVENT LIST */}
            <div className="disc-list">
              {loading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", gap: "10px", color: slate }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…
                </div>
              )}
              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "16px", color: "#ef4444", fontSize: "13px" }}>
                  <AlertCircle size={14} />{error}
                </div>
              )}
              {!loading && !error && events.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: slate }}>
                  <p style={{ marginBottom: "12px" }}>No events found.</p>
                  <a href="/create" style={{ color: pink, fontWeight: 700, textDecoration: "none" }}>Host one →</a>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {events.map(ev => {
                  const color = ev.sport_color ?? SPORT_COLOR[ev.sport] ?? pink;
                  const isBooking = bookingId === ev.id;
                  const msg = bookMsg?.id === ev.id ? bookMsg : null;
                  const pct = Math.round(((ev.confirmed_count) / ev.max_players) * 100);
                  return (
                    <div key={ev.id} className="disc-event-card" onClick={() => setSelectedId(ev.id === selectedId ? null : ev.id)} style={{ background: selectedId === ev.id ? "#1E2330" : "#16191F", border: `1.5px solid ${selectedId === ev.id ? pink : "rgba(255,255,255,0.07)"}`, borderRadius: "16px", padding: "1rem 1.1rem", cursor: "pointer", boxShadow: selectedId === ev.id ? "0 4px 20px rgba(0,0,0,0.3)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.55rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", padding: "4px 10px", borderRadius: "100px", color }}>
                          {getSportIcon(ev.sport)}<span style={{ fontSize: "0.73rem", fontWeight: 700 }}>{ev.sport}</span>
                        </div>
                        {ev.flash ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#E85D24", color: "#fff", fontSize: "0.68rem", fontWeight: 700, padding: "3px 9px", borderRadius: "100px" }}>
                            <Zap size={10} fill="#fff" /> Flash
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.73rem", color: slate, display: "flex", alignItems: "center", gap: "3px" }}>
                            <MapPin size={11} />{ev.venue}
                          </span>
                        )}
                      </div>

                      <p style={{ fontWeight: 700, fontSize: "0.9rem", color: paper, margin: "0 0 0.45rem", lineHeight: 1.3 }}>{ev.title}</p>

                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: slate, marginBottom: "0.85rem", alignItems: "center" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={11} />{fmtTime(ev.event_date)}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><CircleDot size={11} />{ev.fee === 0 ? "Free" : `Rs. ${ev.fee}`}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: "0.7rem", color: ev.slots_remaining <= 2 ? "#ef4444" : slate, margin: "0 0 4px", display: "flex", alignItems: "center", gap: "3px" }}>
                            <ChevronRight size={10} />
                            {ev.slots_remaining > 0 ? `${ev.slots_remaining} slot${ev.slots_remaining > 1 ? "s" : ""} left` : "Full"}
                          </p>
                          <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? "#ef4444" : ev.flash ? "#E85D24" : color, borderRadius: "2px" }} />
                          </div>
                        </div>
                        <button
                          onClick={e => handleBook(ev, e)}
                          disabled={isBooking || ev.slots_remaining === 0}
                          style={{ background: msg?.ok ? turf : ev.flash ? "#E85D24" : pink, color: "#fff", border: "none", padding: "8px 18px", borderRadius: "100px", fontSize: "0.78rem", fontWeight: 700, cursor: (isBooking || ev.slots_remaining === 0) ? "default" : "pointer", opacity: (isBooking || ev.slots_remaining === 0) ? 0.7 : 1, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          {isBooking ? <Loader2 size={11} style={{ animation: "spin 0.7s linear infinite" }} /> : null}
                          {msg ? msg.msg : ev.slots_remaining === 0 ? "Full" : ev.flash ? <><Zap size={11} /> Join now</> : "Book"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT — MAP */}
            <div className="disc-map" style={{ position: "relative", overflow: "hidden" }}>
              <KhelumnaMap
                center={[27.7172, 85.324]}
                zoom={14}
                height="100%"
                pins={mapPins.length > 0 ? mapPins : events.map((ev, i) => ({
                  id: ev.id,
                  lat: 27.7172 + (i * 0.003 - 0.006),
                  lng: 85.324  + (i * 0.004 - 0.008),
                  label: ev.title,
                  sport: ev.sport,
                  flash: ev.flash,
                  color: ev.sport_color ?? pink,
                }))}
              />
              {/* FLASH POPUP */}
              {showFlash && flashEvent && (
                <div style={{ position: "absolute", bottom: "1.5rem", right: "1.5rem", background: inkSoft, border: "1.5px solid #E85D24", borderRadius: "18px", padding: "1.25rem", width: "290px", boxShadow: "0 4px 32px rgba(0,0,0,0.5)", zIndex: 1000, animation: "slideUp 0.35s ease" }}>
                  <button onClick={() => setShowFlash(false)} style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", cursor: "pointer", color: slate, display: "flex", padding: "2px" }}>
                    <X size={16} />
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.75rem" }}>
                    <div style={{ width: "32px", height: "32px", background: "rgba(232,93,36,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Zap size={16} color="#E85D24" fill="#E85D24" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "#E85D24", fontFamily: "'Bricolage Grotesque',sans-serif" }}>Flash Match!</span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: paper, fontWeight: 600, margin: "0 0 0.3rem" }}>{flashEvent.title}</p>
                  <p style={{ fontSize: "0.75rem", color: slate, lineHeight: 1.5, margin: "0 0 0.75rem" }}>
                    {flashEvent.venue} · {flashEvent.slots_remaining} slot{flashEvent.slots_remaining !== 1 ? "s" : ""} left · {flashEvent.fee === 0 ? "Free" : `Rs. ${flashEvent.fee}`}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={e => handleBook(flashEvent, e)} style={{ flex: 1, background: "#E85D24", color: "#fff", border: "none", padding: "11px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                      <Zap size={13} fill="#fff" /> I&apos;m in!
                    </button>
                    <button onClick={() => setShowFlash(false)} style={{ flex: 1, background: "rgba(255,255,255,0.07)", color: slate, border: "1px solid rgba(255,255,255,0.1)", padding: "11px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <section className="disc-cta-section" style={{ position: "relative", overflow: "hidden", marginTop: "auto" }}>
          <div style={{ position: "absolute", bottom: "-100px", left: "50%", transform: "translateX(-50%)", width: "400px", height: "250px", background: `radial-gradient(circle, ${pink}18 0%, transparent 70%)`, pointerEvents: "none" }} />
          <div className="disc-cta-card" style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, margin: "0 0 14px", letterSpacing: "-1px", color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Don&apos;t see your game?
            </h2>
            <p style={{ fontSize: "15px", color: slate, marginBottom: "28px", lineHeight: 1.6 }}>
              Host your own event and let Kathmandu&apos;s players come to you.
            </p>
            <a href="/create">
              <button style={{ background: pink, border: "none", color: "#fff", padding: "14px 32px", borderRadius: "12px", fontSize: "16px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: `0 6px 20px ${pink}44`, fontFamily: "'Inter',sans-serif" }}>
                Host an event <ArrowRight size={18} />
              </button>
            </a>
          </div>
        </section>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </>
  );
}
