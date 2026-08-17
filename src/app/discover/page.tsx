"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  MapPin, Clock, Zap, CircleDot,
  Trophy, Activity, Wind, Target, Waves, ShieldCheck, Wallet,
  ChevronRight, X,
  Loader2, AlertCircle,
} from "lucide-react";
import NepalMap from "@/components/NepalMap";
import { useCity, inCity } from "@/lib/city";
// Leaflet only actually renders once someone taps "See map" *and* drills
// into a province — loading it eagerly meant every visit to this page (the
// app's main landing page) paid for Leaflet's JS whether they ever touched
// the map or not.
const SportonicaMap = dynamic(() => import("@/components/SportonicaMap"), { ssr: false });
import { useEvents, type EventRow } from "@/lib/hooks/useEvents";
import { usePlayTogetherEvents } from "@/lib/hooks/usePlayTogetherEvents";
import { useProfile } from "@/lib/hooks/useProfile";
import JoinModal from "./JoinModal";
import { kmBetween } from "./DiscoverFilters";
import PlayFilters from "./PlayFilters";
import { SPORT_NAMES, sportColor, normalizeSport } from "@/lib/sports";
import DateStrip from "@/components/shared/DateStrip";
import { NO_FILTERS, type PlayQuery, formatOf, nearTime, inFeeBand, DISTANCES } from "@/lib/playFilters";


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
  const [pq, setPq] = useState<PlayQuery>(NO_FILTERS);
  const [day, setDay] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" })
  );
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const { city, area } = useCity();
  const [sortBy, setSortBy] = useState<"soonest" | "nearest" | "cheapest" | "filling">("soonest");
  const [pageSize, setPageSize] = useState(12);
  const [drill, setDrill] = useState<{ name: string; center: [number, number] } | null>(null);
  const [showMap, setShowMap] = useState(false);

  const sportFilter = activeSport === "All sports" ? undefined : activeSport;
  const { events: bookedEvents, loading, error, reload } = useEvents({ sport: sportFilter, limit: 50 });
  const playTogetherEvents = usePlayTogetherEvents();
  // Play Together games are just another kind of game to browse — they
  // flow through the same filter/sort/card pipeline as everything else,
  // not a separate section.
  const events = [...bookedEvents, ...playTogetherEvents].filter(
    (ev) => !sportFilter || ev.sport === sportFilter
  );

  // ── Apply the filter bar to the fetched events ──────────────────
  const KTM = "Asia/Kathmandu";
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: KTM });
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(new Date(Date.now() + 86400000));
  const weekAhead = Date.now() + 7 * 86400000;

  const filtered = events.filter((ev) => {
    // The day slider is the only date control on this page.
    const evDay = new Date(ev.event_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    if (evDay !== day) return false;

    // Follow the city chosen in the header — no second question.
    if (!inCity(ev.venue_lat, ev.venue_lng, city, area)) return false;

    // Format is read off the headcount, so no schema change was needed.
    if (pq.format && formatOf(ev.sport, ev.max_players) !== pq.format) return false;

    if (pq.skill && (ev.skill_level ?? "").toLowerCase() !== pq.skill) return false;
    if (pq.time != null && !nearTime(ev.event_date, pq.time)) return false;
    if (pq.fee && !inFeeBand(Number(ev.fee) || 0, pq.fee)) return false;
    if (pq.openOnly && ev.slots_remaining <= 0) return false;

    if (pq.dist) {
      const km = DISTANCES.find((d) => d.key === pq.dist)?.km ?? Infinity;
      if (!myCoords || ev.venue_lat == null || ev.venue_lng == null) return false;
      if (kmBetween(myCoords, [ev.venue_lat, ev.venue_lng]) > km) return false;
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
  useEffect(() => { setPageSize(12); }, [pq, sortBy, activeSport, day]);

  useEffect(() => {
    const f = events.find((e) => e.flash);
    if (f) {
      setFlashEvent(f);
      setShowFlash(true);
    }
  }, [events]);

  const eventHref = (ev: EventRow) =>
    ev.event_type === "play_together" ? `/play-together/${ev.id}` : `/game/${ev.id}`;

  const handleBook = (ev: EventRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Open the full game page — who's playing, skill level, directions,
    // then join from there. Login is handled on that page.
    router.push(eventHref(ev));
  };

  return (
    <main className="disc-root">
      <style>{CSS}</style>

      {/* ── Hero header ──
          Plain elements + CSS keyframes, not framer-motion. This is the
          page's headline — it must be visible even if client JS never
          finishes hydrating (a conflicting browser extension, a slow chunk
          load, whatever). framer-motion's initial={opacity:0} renders
          correctly in the server HTML, but if hydration fails the animate
          step never runs and the text stays invisible forever — which is
          exactly what happened here. CSS animations run independent of
          React, so the text is guaranteed to end up visible either way. */}
      <header className="disc-hero">
        <p className="disc-eyebrow disc-fade">Live in Kathmandu</p>
        <h1 className="disc-title disc-fade">Find your <em>game</em></h1>
        <p className="disc-sub disc-fade">
          Pick a sport, scan the map, and join the game — or{" "}
          <a href="/create">host your own</a>.
        </p>
      </header>

      <section className="disc-section">
        <DateStrip value={day} onPick={setDay} />

        <PlayFilters
          sport={activeSport === "All sports" ? null : activeSport}
          setSport={(sp) => setActiveSport(sp ?? "All sports")}
          sports={SPORT_NAMES}
          value={pq}
          onChange={setPq}
          count={sortedAll.length}
          onNeedLocation={() => {
            if (myCoords || !navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (p) => setMyCoords([p.coords.latitude, p.coords.longitude]),
              () => setPq((c) => ({ ...c, dist: null })),
              { timeout: 8000 }
            );
          }}
        />

        {/* ── Sort bar ── */}
        <div className="disc-sortbar">
          <span className="disc-sortbar-count">
            {sortedAll.length} game{sortedAll.length === 1 ? "" : "s"}
            {(area || city) && <em className="disc-incity"> in {area?.name ?? city!.name}</em>}
          </span>

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
                      onClick={() => { setPq(NO_FILTERS); setMyCoords(null); }}
                      style={{ background: "none", border: "none", color: "#006241", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear filters →
                    </button>
                  </>
                ) : (
                  <>
                    <p>No games on this day. Try another date.</p>
                    <a href="/create">Book a court and host →</a>
                  </>
                )}
              </div>
            )}
            <div className="disc-cards">
              {visible.map((ev, i) => {
                const color = ev.sport_color ?? sportColor(normalizeSport(ev.sport));
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
                    onClick={() => router.push(eventHref(ev))}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="disc-card-top">
                      <span className="disc-sport-badge" style={{ color }}>
                        {getSportIcon(ev.sport)}
                        {ev.sport}
                      </span>
                      {ev.event_type === "platform_event" ? (
                        <span className="disc-official-badge" style={{ color: "#006241", borderColor: "rgba(0,98,65,0.4)", background: "rgba(0,98,65,0.12)" }}>
                          ★ Sportonica
                        </span>
                      ) : ev.event_type === "venue_event" ? (
                        <span className="disc-official-badge" style={{ color: "#2E7D5B", borderColor: "rgba(46,125,91,0.4)", background: "rgba(46,125,91,0.12)" }}>
                          ✓ Official
                        </span>
                      ) : ev.event_type === "play_together" ? (
                        <span className="disc-official-badge" style={{ color: "#2E7D5B", borderColor: "rgba(46,125,91,0.4)", background: "rgba(46,125,91,0.12)" }}>
                          <Wallet size={10} /> Play Together
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
                        <span style={{ color: "#006241" }}>
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
                        ) : ev.event_type === "play_together" ? (
                          "Join"
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
  <div className="disc-mapsection-head">
    <h2 className="disc-mapsection-h">
      {drill ? `Venues in ${drill.name}` : "Games on the map"}
    </h2>
    <button
      className="disc-map-toggle"
      onClick={() => setShowMap((v) => !v)}
    >
      {showMap ? "Hide map" : "See map"}
    </button>
  </div>

  {showMap && (
    <>
      {!drill && (
        <p style={{ fontSize: 13, color: "var(--muted, rgba(242,237,230,0.6))", margin: "-8px 0 16px" }}>
          Tap a province to see its venues on the map.
        </p>
      )}
      <div className="disc-map disc-map-wide">
        {!drill ? (
          <NepalMap
            accent="#006241"
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
            <SportonicaMap
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
                  color: ev.sport_color ?? sportColor(normalizeSport(ev.sport)),
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
    </>
  )}
</div>
      </section>





      <section className="disc-cta">
        <div className="disc-cta-inner">
          <h2>Don&apos;t see your game?</h2>
          <p>Host your own event and let Kathmandu&apos;s players come to you.</p>
          <a href="/create" style={{ background: "#006241", color: "#fff", border: "none", padding: "14px 28px", borderRadius: "12px", fontSize: "15px", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
            Host an event →
          </a>
        </div>
      </section>

      { modalEvent && <JoinModal event={modalEvent} onClose={() => setModalEvent(null)} /> }
    </main >
  );
}

const CSS = `
.disc-root {
  --line: rgba(255, 255, 255, 0.1);
  --card-tint-1: rgba(255,255,255,0.035);
  --card-tint-2: rgba(255,255,255,0);
  min-height: 100vh;
  background: var(--ink);
  color: var(--chalk);
  font-family: 'Inter', system-ui, sans-serif;
  overflow-x: hidden;
  /* Just clears the fixed nav (65px elsewhere, see .has-sitenav in
     globals.css) plus a small buffer — was 88px, stacking with
     .disc-hero's own top padding below into a much bigger gap than
     either value alone suggests. */
  padding-top: 68px;
}
[data-theme="paper"] .disc-root {
  --line: rgba(20,23,30,0.14);
  --card-tint-1: rgba(20,23,30,0.035);
  --card-tint-2: rgba(20,23,30,0);
}

.disc-hero {
  padding: 18px clamp(20px, 5vw, 56px) 8px;
  max-width: 720px;
}
.disc-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--lime);
  margin: 0 0 14px;
}
.disc-title {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(36px, 6vw, 64px);
  line-height: 0.98;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  color: var(--chalk);
}
.disc-title em { font-style: normal; color: var(--sodium); }
[data-theme="paper"] .disc-title em { color: var(--pink); }
.disc-sub {
  font-size: 16px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--chalk) 72%, transparent);
  margin: 0;
  max-width: 520px;
}

/* CSS-driven entrance, not framer-motion — see the comment above the hero
   header JSX for why this content can't depend on JS to become visible. */
@keyframes discFadeUp {
  from { opacity: 0; transform: translateY(var(--disc-fy, 14px)); }
  to   { opacity: 1; transform: translateY(0); }
}
.disc-fade { animation: discFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both; }
.disc-eyebrow.disc-fade { --disc-fy: 10px; animation-duration: 0.5s; }
.disc-title.disc-fade   { --disc-fy: 20px; animation-duration: 0.7s; animation-delay: 0.12s; }
.disc-sub.disc-fade     { --disc-fy: 14px; animation-duration: 0.6s; animation-delay: 0.24s; }
@media (prefers-reduced-motion: reduce) {
  .disc-fade { animation: none; opacity: 1; transform: none; }
}
.disc-sub a { color: var(--lime); text-decoration: none; }
[data-theme="paper"] .disc-eyebrow { color: var(--turf); }
[data-theme="paper"] .disc-sub a { color: var(--turf); }

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
  font-family: 'Inter', sans-serif;
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
.disc-incity { font-style:normal; font-weight:600; opacity:.5; }
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
.disc-collections-h { font-size:22px; font-weight:800; letter-spacing:-0.5px; color:var(--chalk); font-family:'Inter',sans-serif; margin:0 0 20px; }
.disc-collections-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.disc-coll-card { display:flex; flex-direction:column; gap:6px; padding:22px; border-radius:18px; text-decoration:none; border:1px solid rgba(255,255,255,0.1); background:linear-gradient(150deg, color-mix(in srgb, var(--c) 14%, transparent), rgba(255,255,255,0.02)); transition:transform .3s cubic-bezier(0.22,1,0.36,1), border-color .3s; }
.disc-coll-card:hover { transform:translateY(-5px); border-color:var(--c); }
.disc-coll-emoji { font-size:30px; line-height:1; margin-bottom:6px; }
.disc-coll-title { font-size:17px; font-weight:800; color:var(--chalk); font-family:'Inter',sans-serif; letter-spacing:-0.3px; }
.disc-coll-sub { font-size:13px; color:var(--muted, rgba(242,237,230,0.6)); }
[data-theme="paper"] .disc-coll-card { border-color:rgba(20,23,30,0.12); }
@media (max-width:760px){ .disc-collections-grid { grid-template-columns:1fr; } }
.disc-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 14px 16px;
  cursor: pointer;
  background: linear-gradient(170deg, var(--card-tint-1), var(--card-tint-2));
  transition: border-color 0.25s, transform 0.2s, box-shadow 0.25s;
}
[data-theme="paper"] .disc-card { box-shadow: 0 2px 10px -4px rgba(20,23,30,0.12); }
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
  background: linear-gradient(150deg,#006241,#1e3932); color: #ffffff;
  display: grid; place-items: center; font-size: 10px; font-weight: 800;
}
.disc-host-av img { width: 100%; height: 100%; object-fit: cover; }
.disc-host-n { font-weight: 600; }
.disc-host-t {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: 'Inter', sans-serif; font-size: 10.5px;
  border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; opacity: 0.75;
}
.disc-host-g {
  margin-left: auto; font-family: 'Inter', sans-serif;
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
  font-family: 'Inter', system-ui, sans-serif;
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
.disc-mapsection-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
.disc-mapsection-h { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--chalk); font-family: 'Inter', sans-serif; margin: 0; }
.disc-map-toggle { font-size:13px; font-weight:700; padding:9px 18px; border-radius:999px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:var(--chalk); cursor:pointer; transition:all .2s; display:inline-flex; align-items:center; gap:6px; font-family:'Inter',sans-serif; }
.disc-map-toggle:hover { background:rgba(255,255,255,0.12); border-color:rgba(255,255,255,0.3); transform:translateY(-1px); }
[data-theme="paper"] .disc-map-toggle { border-color:rgba(20,23,30,0.15); background:rgba(20,23,30,0.04); }
.disc-map-wide { height: auto; border-radius: 18px; overflow: hidden; }
.disc-map-back { position: absolute; top: 14px; left: 14px; z-index: 500; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 999px; border: none; cursor: pointer; background: rgba(17,19,23,0.9); color: #fff; backdrop-filter: blur(8px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
.disc-map-back:hover { background: #006241; }
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
  font-family: 'Inter', sans-serif;
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
[data-theme="paper"] .disc-empty a { color: var(--turf); }
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
    radial-gradient(80% 50% at 50% 0%, rgba(223,249,186,0.08), transparent 70%),
    linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
}
.disc-cta h2 {
  font-family: 'Inter', system-ui, sans-serif;
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
  .disc-root { padding-top: 28px; }
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
