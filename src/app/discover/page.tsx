"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin, Clock, Zap, CircleDot,
  Trophy, Activity, Wind, Target, Waves, ShieldCheck,
  ChevronRight, X,
  Loader2, AlertCircle,
} from "lucide-react";
import NepalMap from "@/components/NepalMap";
import KhelamnaMap from "@/components/KhelamnaMap";
import { useEvents, SPORT_COLOR, type EventRow } from "@/lib/hooks/useEvents";
import { useProfile } from "@/lib/hooks/useProfile";
import JoinModal from "./JoinModal";
import SportCoverflow from "@/components/SportCoverflow";
import DiscoverFilters, { DEFAULT_FILTERS, kmBetween, type Filters } from "./DiscoverFilters";

const SPORT_TABS = [
  { label: "All sports", icon: <Activity size={15} /> },
  { label: "Futsal", icon: <CircleDot size={15} /> },
  { label: "Basketball", icon: <Target size={15} /> },
  { label: "Cricket", icon: <Trophy size={15} /> },
  { label: "Volleyball", icon: <Wind size={15} /> },
  { label: "Badminton", icon: <Wind size={15} /> },
  { label: "Pickleball", icon: <Target size={15} /> },
  { label: "Tennis", icon: <Activity size={15} /> },
  { label: "Swimming", icon: <Waves size={15} /> },
  { label: "Running", icon: <Zap size={15} /> },
];

function getSportIcon(sport: string, size = 14) {
  switch (sport) {
    case "Basketball": return <Target size={size} />;
    case "Futsal": return <CircleDot size={size} />;
    case "Volleyball": return <Wind size={size} />;
    case "Badminton": return <Wind size={size} />;
    case "Pickleball": return <Target size={size} />;
    case "Tennis": return <Activity size={size} />;
    case "Cricket": return <Trophy size={size} />;
    case "Swimming": return <Waves size={size} />;
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
  // Human labels: people think in "tonight" / "tomorrow", not dates.
  const KTM_TZ = "Asia/Kathmandu";
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: KTM_TZ });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ });
  if (key(d) === key(new Date())) return `Tonight · ${time}`;
  if (key(d) === key(new Date(Date.now() + 86400000))) return `Tomorrow · ${time}`;
  return (
    d.toLocaleDateString([], { weekday: "short", timeZone: KTM_TZ }) + " · " + time
  );
}

function DiscoverInner() {
  const router = useRouter();
  const { profile } = useProfile();

  const searchParams = useSearchParams();
  const sportParam = searchParams.get("sport");
  const [activeSport, setActiveSport] = useState(sportParam ?? "All sports");
  const [showFlash, setShowFlash] = useState(false);
  const [flashEvent, setFlashEvent] = useState<EventRow | null>(null);
  const [modalEvent, setModalEvent] = useState<EventRow | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [sortBy, setSortBy] = useState<"soonest" | "nearest" | "cheapest" | "filling">("soonest");
  const [pageSize, setPageSize] = useState(12);
  const [drill, setDrill] = useState<{ name: string; center: [number, number] } | null>(null);

  const sportFilter = activeSport === "All sports" ? undefined : activeSport;
  const { events, loading, error, reload } = useEvents({ sport: sportFilter, limit: 50 });

  // ── Apply the filter bar to the fetched events ──────────────────
  const KTM = "Asia/Kathmandu";
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: KTM });
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(new Date(Date.now() + 86400000));
  const weekAhead = Date.now() + 7 * 86400000;

  const filtered = events.filter((ev) => {
    const when = new Date(ev.event_date);

    // time
    if (filters.time === "today" && dayKey(when) !== todayKey) return false;
    if (filters.time === "tomorrow" && dayKey(when) !== tomorrowKey) return false;
    if (filters.time === "week" && when.getTime() > weekAhead) return false;

    // price
    const fee = Number(ev.fee) || 0;
    if (filters.price === "free" && fee > 0) return false;
    if (filters.price === "under300" && fee >= 300) return false;
    if (filters.price === "under600" && fee >= 600) return false;

    // spots
    if (filters.spots === "open" && ev.slots_remaining <= 0) return false;
    if (filters.spots === "almost" && !(ev.slots_remaining > 0 && ev.slots_remaining <= 2)) return false;

    // skill level
    if (filters.skill !== "any" && (ev.skill_level ?? "any") !== filters.skill) return false;

    // distance
    if (filters.dist !== "any") {
      if (!myCoords || ev.venue_lat == null || ev.venue_lng == null) return false;
      const km = kmBetween(myCoords, [ev.venue_lat, ev.venue_lng]);
      if (km > Number(filters.dist)) return false;
    }
    return true;
  });

  // ── Sort the filtered games ─────────────────────────────────────
  const distOf = (ev: EventRow) =>
    myCoords && ev.venue_lat != null && ev.venue_lng != null
      ? kmBetween(myCoords, [ev.venue_lat, ev.venue_lng])
      : Infinity;
  const sortedAll = [...filtered].sort((a, b) => {
    if (sortBy === "nearest") return distOf(a) - distOf(b);
    if (sortBy === "cheapest") return (Number(a.fee) || 0) - (Number(b.fee) || 0);
    if (sortBy === "filling") return a.slots_remaining - b.slots_remaining;
    // soonest (default)
    return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
  });

  // ── Page it (LOAD MORE) ─────────────────────────────────────────
  const visible = sortedAll.slice(0, pageSize);
  const hasMore = sortedAll.length > visible.length;
  // Reset paging whenever the filter/sort/sport changes.
  useEffect(() => { setPageSize(12); }, [filters, sortBy, activeSport]);

  useEffect(() => {
    const f = events.find((e) => e.flash);
    if (f) {
      setFlashEvent(f);
      setShowFlash(true);
    }
  }, [events]);

  const handleBook = (ev: EventRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Open the full game page — who's playing, skill level, directions,
    // then join from there. Login is handled on that page.
    router.push(`/game/${ev.id}`);
  };

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
        <SportCoverflow
          selected={activeSport === "All sports" ? undefined : activeSport}
          onPick={(sport) => {
            setActiveSport(sport);
            // Bring the games into view so the filter feels connected.
            document.querySelector(".disc-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
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
        <DiscoverFilters
          filters={filters}
          setFilters={setFilters}
          onLocation={setMyCoords}
          hasLocation={!!myCoords}
          resultCount={sortedAll.length}
        />

        {/* ── Sort bar ── */}
        <div className="disc-sortbar">
          <span className="disc-sortbar-count">
            {sortedAll.length} game{sortedAll.length === 1 ? "" : "s"}
          </span>
          <div className="disc-sortbar-opts">
            <span className="disc-sortbar-label">Sort</span>
            {([
              { k: "soonest", label: "Soonest" },
              { k: "nearest", label: "Nearest" },
              { k: "cheapest", label: "Cheapest" },
              { k: "filling", label: "Filling up" },
            ] as const).map((o) => (
              <button
                key={o.k}
                className="disc-sort-chip"
                data-on={sortBy === o.k}
                onClick={() => setSortBy(o.k)}
                disabled={o.k === "nearest" && !myCoords}
                title={o.k === "nearest" && !myCoords ? "Enable location first" : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

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
            {!loading && !error && visible.length === 0 && (
              <div className="disc-empty">
                {events.length > 0 ? (
                  <>
                    <p>No games match these filters.</p>
                    <button
                      onClick={() => { setFilters(DEFAULT_FILTERS); setMyCoords(null); }}
                      style={{ background: "none", border: "none", color: "#FFC93C", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear filters →
                    </button>
                  </>
                ) : (
                  <>
                    <p>No games hosted yet. Be the first.</p>
                    <a href="/create">Book a court and host →</a>
                  </>
                )}
              </div>
            )}
            <div className="disc-cards">
              {visible.map((ev, i) => {
                const color = ev.sport_color ?? SPORT_COLOR[ev.sport] ?? "#DE3163";
                const isFull = ev.slots_remaining === 0;
                const pct = Math.round((ev.confirmed_count / ev.max_players) * 100);
                const selected = false;
                return (
                  <motion.article
                    key={ev.id}
                    className="disc-card"
                    data-on={selected}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.45 }}
                    onClick={() => router.push(`/game/${ev.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="disc-card-top">
                      <span className="disc-sport-badge" style={{ color }}>
                        {getSportIcon(ev.sport)}
                        {ev.sport}
                      </span>
                      {ev.event_type === "platform_event" ? (
                        <span className="disc-official-badge" style={{ color: "#FFC93C", borderColor: "rgba(255,201,60,0.4)", background: "rgba(255,201,60,0.12)" }}>
                          ★ Khelam Na
                        </span>
                      ) : ev.event_type === "venue_event" ? (
                        <span className="disc-official-badge" style={{ color: "#2E7D5B", borderColor: "rgba(46,125,91,0.4)", background: "rgba(46,125,91,0.12)" }}>
                          ✓ Official
                        </span>
                      ) : ev.flash ? (
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
                    {ev.organizer_name && ev.event_type !== "pickup" && (
                      <div style={{ fontSize: 11.5, color: "var(--faint, rgba(242,237,230,0.5))", marginTop: -4, marginBottom: 4 }}>
                        by {ev.organizer_name}
                      </div>
                    )}

                    {/* Host + reputation + how many are in — the things that
                        tell you whether this game is worth joining. */}
                    <div className="disc-host">
                      <span className="disc-host-av" aria-hidden>
                        {ev.host_avatar && /\.(jpe?g|png|gif|webp)$/i.test(ev.host_avatar)
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={ev.host_avatar} alt="" />
                          : (ev.host_name ?? "H").charAt(0).toUpperCase()}
                      </span>
                      <span className="disc-host-n">{ev.host_name ?? "Host"}</span>
                      <span className="disc-host-t" title="Trust score — earned by showing up">
                        <ShieldCheck size={10} /> {ev.host_trust ?? 50}
                      </span>
                      <span className="disc-host-g">
                        {ev.confirmed_count}/{ev.max_players} going
                      </span>
                    </div>

                    {ev.skill_level && ev.skill_level !== "any" && (
                      <span className="disc-skill">
                        {ev.skill_level === "beginner" ? "Beginner friendly"
                          : ev.skill_level === "intermediate" ? "Intermediate"
                          : "Advanced"}
                      </span>
                    )}

                    <div className="disc-card-meta">
                      <span>
                        <Clock size={11} />
                        {fmtTime(ev.event_date)}
                        {" – "}
                        {new Date(new Date(ev.event_date).getTime() + (ev.duration_mins ?? 60) * 60000)
                          .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" })}
                      </span>
                      <span>
                        <CircleDot size={11} />
                        {ev.fee === 0 ? "Free" : `Rs. ${ev.fee}`}
                      </span>
                      {myCoords && ev.venue_lat != null && ev.venue_lng != null && (
                        <span style={{ color: "#FFC93C" }}>
                          <MapPin size={11} />
                          {kmBetween(myCoords, [ev.venue_lat, ev.venue_lng]).toFixed(1)} km
                        </span>
                      )}
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
                        style={{
                          background: ev.flash ? "#E85D24" : "var(--pink)",
                          opacity: isFull ? 0.6 : 1,
                        }}
                      >
                        {isFull ? "View" : ev.flash ? (
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
            {hasMore && (
              <div className="disc-loadmore-wrap">
                <button className="disc-loadmore" onClick={() => setPageSize((n) => n + 12)}>
                  Load more games
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Map — full-width landscape strip below the games ── */}
        <div className="disc-mapsection">
          <h2 className="disc-mapsection-h">
            {drill ? `Venues in ${drill.name}` : "Games on the map"}
          </h2>
          {!drill && (
            <p style={{ fontSize: 13, color: "var(--muted, rgba(242,237,230,0.6))", margin: "-8px 0 16px" }}>
              Tap a province to see its venues on the map.
            </p>
          )}
          <div className="disc-map disc-map-wide">
            {!drill ? (
              <NepalMap
                accent="#DE3163"
                points={visible
                  .filter((ev) => ev.venue_lat != null && ev.venue_lng != null)
                  .map((ev) => [ev.venue_lng as number, ev.venue_lat as number])}
                onProvinceClick={(name, center) => setDrill({ name, center })}
              />
            ) : (
              <div style={{ position: "relative", height: 420 }}>
                <button
                  className="disc-map-back"
                  onClick={() => setDrill(null)}
                >
                  <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back to Nepal
                </button>
                <KhelamnaMap
                  center={drill.center}
                  zoom={11}
                  height="100%"
                  onPinClick={(id) => router.push(`/game/${id}`)}
                  pins={visible
                    .filter((ev) => ev.venue_lat != null && ev.venue_lng != null)
                    .map((ev) => ({
                      id: ev.id,
                      lat: ev.venue_lat as number,
                      lng: ev.venue_lng as number,
                      label: ev.title,
                      sport: ev.sport,
                      flash: ev.flash,
                      color: ev.sport_color ?? SPORT_COLOR[ev.sport] ?? "#DE3163",
                    }))}
                />
              </div>
            )}

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


      {/* ── Collections — browse when you don't have a specific game in mind ── */}
      <section className="disc-collections">
        <h2 className="disc-collections-h">Explore Khelam Na</h2>
        <div className="disc-collections-grid">
          <a href="/create" className="disc-coll-card" style={{ ["--c" as string]: "#2E7D5B" }}>
            <span className="disc-coll-emoji">🏟️</span>
            <span className="disc-coll-title">Book a ground</span>
            <span className="disc-coll-sub">Verified courts across Kathmandu</span>
          </a>
          <a href="/league" className="disc-coll-card" style={{ ["--c" as string]: "#a855f7" }}>
            <span className="disc-coll-emoji">👥</span>
            <span className="disc-coll-title">Find a squad</span>
            <span className="disc-coll-sub">Join a team, play every week</span>
          </a>
          <a href="/create" className="disc-coll-card" style={{ ["--c" as string]: "#FFC93C" }}>
            <span className="disc-coll-emoji">⚡</span>
            <span className="disc-coll-title">Host an event</span>
            <span className="disc-coll-sub">Set your sport, time and spots</span>
          </a>
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
  display: block;
  border-radius: 22px;
  overflow: visible;
  background: transparent;
}
.disc-list {
  padding: 4px 0;
}
.disc-list::-webkit-scrollbar { width: 4px; }
.disc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
.disc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }

.disc-sortbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 0 6px; }
.disc-sortbar-count { font-size:13px; font-weight:700; color:var(--chalk); }
.disc-sortbar-opts { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.disc-sortbar-label { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--faint, rgba(242,237,230,0.5)); }
.disc-sort-chip { font-size:12.5px; font-weight:600; padding:6px 13px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.04); color:var(--chalk); cursor:pointer; transition:all .18s; }
.disc-sort-chip:hover:not(:disabled) { border-color:rgba(255,255,255,0.3); }
.disc-sort-chip[data-on="true"] { background:var(--pink); border-color:var(--pink); color:#fff; }
.disc-sort-chip:disabled { opacity:0.4; cursor:not-allowed; }
[data-theme="paper"] .disc-sort-chip { border-color:rgba(20,23,30,0.15); background:rgba(20,23,30,0.03); }

.disc-loadmore-wrap { display:flex; justify-content:center; padding:22px 0 4px; }
.disc-loadmore { font-size:14px; font-weight:700; padding:12px 30px; border-radius:12px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:var(--chalk); cursor:pointer; transition:all .18s; }
.disc-loadmore:hover { background:rgba(255,255,255,0.1); transform:translateY(-2px); }
[data-theme="paper"] .disc-loadmore { border-color:rgba(20,23,30,0.15); background:rgba(20,23,30,0.04); }

.disc-collections { max-width:1200px; margin:0 auto; padding:48px 24px 8px; }
.disc-collections-h { font-size:22px; font-weight:800; letter-spacing:-0.5px; color:var(--chalk); font-family:'Bricolage Grotesque',sans-serif; margin:0 0 20px; }
.disc-collections-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.disc-coll-card { display:flex; flex-direction:column; gap:6px; padding:22px; border-radius:18px; text-decoration:none; border:1px solid rgba(255,255,255,0.1); background:linear-gradient(150deg, color-mix(in srgb, var(--c) 14%, transparent), rgba(255,255,255,0.02)); transition:transform .3s cubic-bezier(0.22,1,0.36,1), border-color .3s; }
.disc-coll-card:hover { transform:translateY(-5px); border-color:var(--c); }
.disc-coll-emoji { font-size:30px; line-height:1; margin-bottom:6px; }
.disc-coll-title { font-size:17px; font-weight:800; color:var(--chalk); font-family:'Bricolage Grotesque',sans-serif; letter-spacing:-0.3px; }
.disc-coll-sub { font-size:13px; color:var(--muted, rgba(242,237,230,0.6)); }
[data-theme="paper"] .disc-coll-card { border-color:rgba(20,23,30,0.12); }
@media (max-width:760px){ .disc-collections-grid { grid-template-columns:1fr; } }
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
.disc-host {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  margin: 8px 0 10px; font-size: 12px;
}
.disc-host-av {
  width: 22px; height: 22px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
  background: linear-gradient(150deg,#DE3163,#FFC93C); color: #0B0D11;
  display: grid; place-items: center; font-size: 10px; font-weight: 800;
}
.disc-host-av img { width: 100%; height: 100%; object-fit: cover; }
.disc-host-n { font-weight: 600; }
.disc-host-t {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; opacity: 0.75;
}
.disc-host-g {
  margin-left: auto; font-family: 'JetBrains Mono', monospace;
  font-size: 11px; opacity: 0.55;
}
.disc-skill {
  display: inline-block; font-size: 11px; font-weight: 600;
  border: 1px solid var(--line); border-radius: 7px;
  padding: 3px 9px; opacity: 0.75; margin-bottom: 8px;
}
.disc-official-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em;
  padding: 4px 10px; border-radius: 999px; border: 1px solid;
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
.disc-mapsection { margin-top: 40px; }
.disc-mapsection-h { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--chalk); font-family: 'Bricolage Grotesque', sans-serif; margin: 0 0 16px; }
.disc-map-wide { height: auto; border-radius: 18px; overflow: hidden; }
.disc-map-back { position: absolute; top: 14px; left: 14px; z-index: 500; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 999px; border: none; cursor: pointer; background: rgba(17,19,23,0.9); color: #fff; backdrop-filter: blur(8px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
.disc-map-back:hover { background: #DE3163; }
@media (max-width: 760px){ .disc-map-wide { height: auto; } }
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
    max-height: none;
  }
  .disc-cta-inner { padding: 32px 22px; }
}
`;

// useSearchParams needs a Suspense boundary in the App Router.
export default function Discover() {
  return (
    <Suspense fallback={null}>
      <DiscoverInner />
    </Suspense>
  );
}
