"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin, Clock, Zap, CircleDot,
  Trophy, Activity, Wind, Target,
  ChevronRight, X,
  Loader2, AlertCircle,
} from "lucide-react";
import KhelumnaMap from "@/components/KhelumnaMap";
import { useEvents, SPORT_COLOR, type EventRow } from "@/lib/hooks/useEvents";
import { useProfile } from "@/lib/hooks/useProfile";
import JoinModal from "./JoinModal";
import SportCoverflow from "@/components/SportCoverflow";

const SPORT_TABS = [
  { label: "All sports", icon: <Activity size={15} /> },
  { label: "Football", icon: <CircleDot size={15} /> },
  { label: "Basketball", icon: <Target size={15} /> },
  { label: "Volleyball", icon: <Wind size={15} /> },
  { label: "Tennis", icon: <Activity size={15} /> },
  { label: "Cricket", icon: <Trophy size={15} /> },
  { label: "Running", icon: <Zap size={15} /> },
];

function getSportIcon(sport: string, size = 14) {
  switch (sport) {
    case "Basketball": return <Target size={size} />;
    case "Football": return <CircleDot size={size} />;
    case "Volleyball": return <Wind size={size} />;
    case "Tennis": return <Activity size={size} />;
    case "Cricket": return <Trophy size={size} />;
    case "Running": return <Zap size={size} />;
    default: return <CircleDot size={size} />;
  }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff > 0 && diff < 3 * 3600000) {
    const mins = Math.round(diff / 60000);
    return `in ${mins} min`;
  }
  return (
    d.toLocaleDateString([], { weekday: "short" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export default function Discover() {
  const router = useRouter();
  const { profile } = useProfile();

  const [activeSport, setActiveSport] = useState("All sports");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [flashEvent, setFlashEvent] = useState<EventRow | null>(null);
  const [modalEvent, setModalEvent] = useState<EventRow | null>(null);

  const sportFilter = activeSport === "All sports" ? undefined : activeSport;
  const { events, loading, error, reload } = useEvents({ sport: sportFilter, limit: 50 });

  useEffect(() => {
    const f = events.find((e) => e.flash);
    if (f) {
      setFlashEvent(f);
      setShowFlash(true);
    }
  }, [events]);

  const handleBook = (ev: EventRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!profile) {
      sessionStorage.setItem("khelumna_pending_intent", JSON.stringify({ type: "join", eventId: ev.id }));
      router.push("/login");
      return;
    }
    setModalEvent(ev);
  };

  const mapPins = events
    .filter((e) => e.venue_lat && e.venue_lng)
    .map((e) => ({
      id: e.id,
      lat: e.venue_lat!,
      lng: e.venue_lng!,
      label: e.title,
      sport: e.sport,
      flash: e.flash,
      color: e.sport_color ?? SPORT_COLOR[e.sport] ?? "#DE3163",
    }));

  return (
    <main className="disc-root">
      <style>{CSS}</style>

      {/* ── Hero header ── */}
      <header className="disc-hero">
        <motion.p
          className="disc-eyebrow"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Live in Kathmandu
        </motion.p>
        <motion.h1
          className="disc-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Find your game
        </motion.h1>
        <motion.p
          className="disc-sub"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Pick a sport, scan the map, and join tonight — or{" "}
          <a href="/create">host your own</a>.
        </motion.p>
      </header>

      {/* ── 3D sport showcase ── */}
      <div style={{ padding: "8px 0 8px" }}>
        <SportCoverflow />
      </div>

      {/* ── Sport filter — glass chips ── */}
      <div className="disc-filter-wrap">
        <div className="disc-filter-float">
          {SPORT_TABS.map((s) => {
            const on = activeSport === s.label;
            return (
              <button
                key={s.label}
                className="disc-chip"
                data-on={on}
                onClick={() => setActiveSport(s.label)}
              >
                {on && (
                  <motion.span
                    layoutId="disc-sport-puck"
                    className="disc-chip-puck"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="disc-chip-inner">
                  {s.icon}
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main stage ── */}
      <section className="disc-section">
        <p className="disc-count">
          {loading
            ? "Loading events…"
            : error
              ? "Could not load events"
              : `${events.length} upcoming event${events.length !== 1 ? "s" : ""}`}
        </p>

        <div className="disc-stage">
          <div className="disc-list">
            {loading && (
              <div className="disc-empty">
                <Loader2 size={20} className="disc-spin" />
                <span>Loading events…</span>
              </div>
            )}
            {error && (
              <div className="disc-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            {!loading && !error && events.length === 0 && (
              <div className="disc-empty">
                <p>No events match that filter yet.</p>
                <a href="/host">Host one →</a>
              </div>
            )}
            <div className="disc-cards">
              {events.map((ev, i) => {
                const color = ev.sport_color ?? SPORT_COLOR[ev.sport] ?? "#DE3163";
                const isFull = ev.slots_remaining === 0;
                const pct = Math.round((ev.confirmed_count / ev.max_players) * 100);
                const selected = selectedId === ev.id;
                return (
                  <motion.article
                    key={ev.id}
                    className="disc-card"
                    data-on={selected}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.45 }}
                    onClick={() => setSelectedId(ev.id === selectedId ? null : ev.id)}
                  >
                    <div className="disc-card-top">
                      <span className="disc-sport-badge" style={{ color }}>
                        {getSportIcon(ev.sport)}
                        {ev.sport}
                      </span>
                      {ev.flash ? (
                        <span className="disc-flash-badge">
                          <Zap size={10} fill="currentColor" /> Flash
                        </span>
                      ) : (
                        <span className="disc-venue">
                          <MapPin size={11} />
                          {ev.venue}
                        </span>
                      )}
                    </div>

                    <h3 className="disc-card-title">{ev.title}</h3>

                    <div className="disc-card-meta">
                      <span>
                        <Clock size={11} />
                        {fmtTime(ev.event_date)}
                      </span>
                      <span>
                        <CircleDot size={11} />
                        {ev.fee === 0 ? "Free" : `Rs. ${ev.fee}`}
                      </span>
                    </div>

                    <div className="disc-card-foot">
                      <div className="disc-slots">
                        <p className={ev.slots_remaining <= 2 ? "disc-slots-warn" : ""}>
                          <ChevronRight size={10} />
                          {ev.slots_remaining > 0
                            ? `${ev.slots_remaining} slot${ev.slots_remaining > 1 ? "s" : ""} left`
                            : "Full"}
                        </p>
                        <div className="disc-bar">
                          <motion.div
                            className="disc-bar-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            style={{
                              background: pct >= 90 ? "#ef4444" : ev.flash ? "#E85D24" : color,
                            }}
                          />
                        </div>
                      </div>
                      <button
                        className="disc-book-btn"
                        onClick={(e) => handleBook(ev, e)}
                        disabled={isFull}
                        style={{
                          background: ev.flash ? "#E85D24" : "var(--pink)",
                          opacity: isFull ? 0.45 : 1,
                        }}
                      >
                        {isFull ? "Full" : ev.flash ? (
                          <>
                            <Zap size={11} /> Join
                          </>
                        ) : (
                          "Book"
                        )}
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>

          <div className="disc-map">
            <KhelumnaMap
              center={[27.7172, 85.324]}
              zoom={14}
              height="100%"
              pins={
                mapPins.length > 0
                  ? mapPins
                  : events.map((ev, i) => ({
                      id: ev.id,
                      lat: 27.7172 + (i * 0.003 - 0.006),
                      lng: 85.324 + (i * 0.004 - 0.008),
                      label: ev.title,
                      sport: ev.sport,
                      flash: ev.flash,
                      color: ev.sport_color ?? "#DE3163",
                    }))
              }
            />

            {showFlash && flashEvent && (
              <motion.div
                className="disc-flash-popup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <button className="disc-flash-close" onClick={() => setShowFlash(false)} aria-label="Close">
                  <X size={16} />
                </button>
                <div className="disc-flash-head">
                  <Zap size={16} color="#E85D24" fill="#E85D24" />
                  <span>Flash match</span>
                </div>
                <p className="disc-flash-title">{flashEvent.title}</p>
                <p className="disc-flash-meta">
                  {flashEvent.venue} · {flashEvent.slots_remaining} slots ·{" "}
                  {flashEvent.fee === 0 ? "Free" : `Rs. ${flashEvent.fee}`}
                </p>
                <div className="disc-flash-actions">
                  <button onClick={(e) => handleBook(flashEvent, e)} className="disc-flash-join">
                    <Zap size={13} fill="currentColor" /> I&apos;m in
                  </button>
                  <button onClick={() => setShowFlash(false)} className="disc-flash-skip">
                    Skip
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      <section className="disc-cta">
        <div className="disc-cta-inner">
          <h2>Don&apos;t see your game?</h2>
          <p>Host your own event and let Kathmandu&apos;s players come to you.</p>
          <a href="/create" style={{ background:"#DE3163", color:"#fff", border:"none", padding:"14px 28px", borderRadius:"12px", fontSize:"15px", fontWeight:700, cursor:"pointer", fontFamily:"'Inter',sans-serif", display:"inline-flex", alignItems:"center", gap:"8px", textDecoration:"none" }}>
            Host an event →
          </a>
        </div>
      </section>

      {modalEvent && <JoinModal event={modalEvent} onClose={() => setModalEvent(null)} />}
    </main>
  );
}

const CSS = `
.disc-root {
  --line: rgba(255, 255, 255, 0.1);
  min-height: 100vh;
  background: var(--ink);
  color: var(--chalk);
  font-family: 'Inter', system-ui, sans-serif;
  overflow-x: hidden;
  padding-top: 88px;
}

.disc-hero {
  padding: 32px clamp(20px, 5vw, 56px) 8px;
  max-width: 720px;
}
.disc-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--lime);
  margin: 0 0 14px;
}
.disc-title {
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(36px, 6vw, 64px);
  line-height: 0.98;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  color: var(--chalk);
}
.disc-sub {
  font-size: 16px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--chalk) 72%, transparent);
  margin: 0;
  max-width: 520px;
}
.disc-sub a { color: var(--lime); text-decoration: none; }

.disc-filter-wrap {
  padding: 20px clamp(20px, 5vw, 56px) 0;
  display: flex;
  justify-content: center;
}
.disc-filter-float {
  width: 100%;
  max-width: 960px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 12px 14px;
  border-radius: 999px;
  background: rgba(20, 24, 30, 0.55);
  backdrop-filter: blur(22px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.55);
}
.disc-filter-float::-webkit-scrollbar { display: none; }
.disc-chip {
  position: relative;
  border: none;
  background: transparent;
  cursor: pointer;
  flex: 0 0 auto;
  padding: 0;
}
.disc-chip-puck {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--lime);
}
.disc-chip-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 500;
  color: color-mix(in srgb, var(--chalk) 78%, transparent);
  white-space: nowrap;
}
.disc-chip[data-on="true"] .disc-chip-inner {
  color: var(--ink);
  font-weight: 700;
}

.disc-section { padding: 24px clamp(20px, 5vw, 56px) 0; }

/* Give the floating dock its own lane on desktop so it never overlaps
   the map or event list. Mobile dock sits at the bottom, so skip it there. */
@media (min-width: 781px) {
  .disc-section, .disc-hero, .disc-filter-wrap { padding-right: 104px; }
}
.disc-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--chalk) 55%, transparent);
  margin: 0 0 14px 4px;
  text-align: right;
}
.disc-stage {
  display: grid;
  grid-template-columns: minmax(300px, 390px) 1fr;
  height: min(72vh, 720px);
  min-height: 460px;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: linear-gradient(170deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
  box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.65);
}
.disc-list {
  overflow-y: auto;
  padding: 16px 14px;
  background: color-mix(in srgb, var(--inkSoft) 90%, transparent);
  border-right: 1px solid var(--line);
}
.disc-list::-webkit-scrollbar { width: 4px; }
.disc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
.disc-cards { display: flex; flex-direction: column; gap: 12px; }
.disc-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 14px 16px;
  cursor: pointer;
  background: linear-gradient(170deg, rgba(255,255,255,0.035), rgba(255,255,255,0));
  transition: border-color 0.25s, transform 0.2s;
}
.disc-card:hover { transform: translateY(-1px); }
.disc-card[data-on="true"] { border-color: color-mix(in srgb, var(--lime) 65%, transparent); }
.disc-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.disc-sport-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.04);
}
.disc-flash-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #E85D24;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}
.disc-venue {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: color-mix(in srgb, var(--chalk) 50%, transparent);
}
.disc-card-title {
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.25;
  margin: 0 0 10px;
  color: var(--chalk);
}
.disc-card-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: color-mix(in srgb, var(--chalk) 55%, transparent);
  margin-bottom: 14px;
}
.disc-card-meta span { display: flex; align-items: center; gap: 4px; }
.disc-card-foot { display: flex; align-items: center; gap: 12px; }
.disc-slots { flex: 1; }
.disc-slots p {
  font-size: 11px;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  color: color-mix(in srgb, var(--chalk) 55%, transparent);
}
.disc-slots-warn { color: #ef4444 !important; }
.disc-bar {
  height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
.disc-bar-fill { height: 100%; border-radius: 2px; }
.disc-book-btn {
  border: none;
  color: #fff;
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Inter', sans-serif;
}
.disc-map { position: relative; min-height: 280px; }
.disc-flash-popup {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: min(290px, calc(100% - 40px));
  padding: 18px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--inkSoft) 95%, transparent);
  border: 1px solid #E85D24;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  z-index: 500;
}
.disc-flash-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  color: var(--slate);
  cursor: pointer;
}
.disc-flash-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 800;
  font-family: 'Bricolage Grotesque', sans-serif;
  color: #E85D24;
}
.disc-flash-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.disc-flash-meta {
  font-size: 12px;
  color: color-mix(in srgb, var(--chalk) 60%, transparent);
  margin: 0 0 14px;
  line-height: 1.5;
}
.disc-flash-actions { display: flex; gap: 8px; }
.disc-flash-join {
  flex: 1;
  background: #E85D24;
  color: #fff;
  border: none;
  padding: 11px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.disc-flash-skip {
  flex: 1;
  background: rgba(255,255,255,0.06);
  color: var(--slate);
  border: 1px solid var(--line);
  padding: 11px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}
.disc-empty, .disc-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: color-mix(in srgb, var(--chalk) 55%, transparent);
  text-align: center;
}
.disc-empty a { color: var(--lime); font-weight: 700; text-decoration: none; }
.disc-error { color: #ef4444; flex-direction: row; }
.disc-spin { animation: disc-spin 1s linear infinite; }
@keyframes disc-spin { to { transform: rotate(360deg); } }

.disc-cta {
  padding: 72px clamp(20px, 5vw, 56px) 88px;
  text-align: center;
}
.disc-cta-inner {
  margin: 0 auto;
  max-width: 560px;
  padding: 48px 40px;
  border-radius: 24px;
  border: 1px solid var(--line);
  background:
    radial-gradient(80% 50% at 50% 0%, rgba(200,243,91,0.08), transparent 70%),
    linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
}
.disc-cta h2 {
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(28px, 5vw, 44px);
  letter-spacing: -0.02em;
  margin: 0 0 12px;
  color: var(--chalk);
}
.disc-cta p {
  font-size: 15px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--chalk) 65%, transparent);
  margin: 0 0 28px;
}

@media (max-width: 900px) {
  .disc-root { padding-top: 92px; }
  .disc-stage {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .disc-list {
    border-right: none;
    border-bottom: 1px solid var(--line);
    max-height: none;
  }
  .disc-map { height: 38vh; }
  .disc-cta-inner { padding: 32px 22px; }
}
`;
