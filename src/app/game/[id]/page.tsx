import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Clock, Users, Wallet, ShieldCheck, Zap, ExternalLink } from "lucide-react";
import { getGame, getGamePlayers, getSimilarGames, getNearbyVenues, SKILL_LABEL } from "@/lib/play/gameQueries";
import { createClient } from "@/lib/supabase/server";
import { sportColor, normalizeSport } from "@/lib/sports";
import GameJoinPanel from "./GameJoinPanel";
import "./game.css";

export const dynamic = "force-dynamic";

const KTM = "Asia/Kathmandu";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const g = await getGame(id);
  if (!g) return { title: "Game · Khelam Na" };
  return {
    title: `${g.title} · Khelam Na`,
    description: `${g.sport} at ${g.venue} · ${g.slots_remaining} spots left · Rs ${g.fee}`,
  };
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  const [players, similar, nearby] = await Promise.all([
    getGamePlayers(id),
    getSimilarGames(game),
    getNearbyVenues(game),
  ]);

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const alreadyIn = players.some((p) => p.user_id === user?.id);

  const color = game.sport_color ?? sportColor(normalizeSport(game.sport));
  const start = new Date(game.event_date);
  const end = new Date(start.getTime() + (game.duration_mins ?? 60) * 60000);
  const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
  const dateLine = start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM });
  const mapsHref = game.venue_lat != null && game.venue_lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${game.venue_lat},${game.venue_lng}` : null;

  return (
    <div className="gm">
      <div className="gm-wrap">
        <Link href="/discover" className="gm-back"><ArrowLeft size={15} /> All games</Link>

        <div className="gm-grid">
          {/* ── Main column ── */}
          <div>
            {/* Masthead */}
            <div className="gm-eyebrow" style={{ color }}>
              {game.event_type === "platform_event" ? "★ Khelam Na event"
                : game.event_type === "venue_event" ? "✓ Official venue event"
                : "Pickup game"}
              <span className="sep" />
              {game.sport}
              {game.flash && <><span className="sep" /><Zap size={11} /> Flash</>}
            </div>

            <h1 className="gm-title">{game.title}</h1>

            {/* Host line */}
            <div className="gm-host">
              <Avatar name={game.host_name ?? "Host"} url={game.host_avatar} size={34} />
              <span>
                Hosted by{" "}
                {game.host_username
                  ? <Link href={`/p/${game.host_username}`} className="gm-link">{game.host_name ?? "Host"}</Link>
                  : (game.organizer_name ?? game.host_name ?? "Host")}
              </span>
              <span className="gm-trust" title="Trust score — built from showing up">
                <ShieldCheck size={12} /> {game.host_trust}
              </span>
            </div>

            {/* Key facts strip */}
            <div className="gm-facts">
              <Fact icon={<Clock size={15} />} label="When" value={`${dateLine}`} sub={`${fmt(start)} – ${fmt(end)}`} />
              <Fact icon={<MapPin size={15} />} label="Where" value={game.venue}
                sub={mapsHref ? undefined : "Location not pinned"}
                href={mapsHref ?? undefined} />
              <Fact icon={<Wallet size={15} />} label="Cost"
                value={game.fee === 0 ? "Free" : `Rs ${game.fee}`} sub="per player" />
              <Fact icon={<Users size={15} />} label="Squad"
                value={`${game.confirmed_count} of ${game.max_players}`}
                sub={game.slots_remaining > 0 ? `${game.slots_remaining} spot${game.slots_remaining !== 1 ? "s" : ""} left` : "Full"} />
            </div>

            {/* What to expect */}
            <section className="gm-sec">
              <h2 className="gm-sec-t"><span className="gm-num">01</span> What to expect</h2>
              <div className="gm-tags">
                <span className="gm-tag" style={{ borderColor: `${color}55`, color }}>
                  {SKILL_LABEL[game.skill_level ?? "any"] ?? "All levels"}
                </span>
                <span className="gm-tag">{game.max_players}-a-side</span>
                {game.bring_own_gear && <span className="gm-tag">Bring your own gear</span>}
                {game.fee === 0 && <span className="gm-tag">Free to play</span>}
              </div>
              {(game.notes || game.description) && (
                <p className="gm-notes">{game.notes ?? game.description}</p>
              )}
            </section>

            {/* Who's in */}
            <section className="gm-sec">
              <h2 className="gm-sec-t">
                <span className="gm-num">02</span> Who&apos;s playing
                <span className="gm-sec-count">{players.length} in</span>
              </h2>
              {players.length === 0 ? (
                <p className="gm-empty">Nobody yet — be the first to join.</p>
              ) : (
                <div className="gm-players">
                  {players.map((p) => (
                    <Link key={p.user_id} href={p.username ? `/p/${p.username}` : "#"} className="gm-player">
                      <Avatar name={p.name} url={p.avatar_url} size={40} />
                      <div>
                        <div className="gm-player-n">{p.name}</div>
                        <div className="gm-player-s">
                          {p.user_id === game.host_id ? "Host" : `Trust ${p.trust_score}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Similar games */}
            {similar.length > 0 && (
              <section className="gm-sec">
                <h2 className="gm-sec-t"><span className="gm-num">03</span> More {game.sport}</h2>
                <div className="gm-rail">
                  {similar.map((s) => {
                    const sc = s.sport_color ?? sportColor(normalizeSport(s.sport));
                    return (
                      <Link key={s.id} href={`/game/${s.id}`} className="gm-mini">
                        <div className="gm-mini-t">{s.title}</div>
                        <div className="gm-mini-m">
                          {new Date(s.event_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM })}
                          {" · "}
                          {new Date(s.event_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM })}
                        </div>
                        <div className="gm-mini-f">
                          <span style={{ color: sc }}>{s.slots_remaining} left</span>
                          <span>{s.fee === 0 ? "Free" : `Rs ${s.fee}`}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside className="gm-side">
            <GameJoinPanel
              gameId={game.id}
              venueId={game.venue_id}
              sport={game.sport}
              fee={Number(game.fee) || 0}
              slotsLeft={game.slots_remaining}
              alreadyIn={alreadyIn}
              isHost={user?.id === game.host_id}
              venue={game.venue}
              mapsHref={mapsHref}
              eventDate={game.event_date}
            />

            {nearby.length > 0 && (
              <div className="gm-card">
                <div className="gm-card-t">Venues nearby</div>
                {nearby.map((v) => (
                  <Link key={v.id} href={`/create/${v.id}`} className="gm-near">
                    <div>
                      <div className="gm-near-n">{v.name}</div>
                      <div className="gm-near-d">{v.km.toFixed(1)} km away</div>
                    </div>
                    <ExternalLink size={13} style={{ opacity: 0.4 }} />
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value, sub, href }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; href?: string;
}) {
  const inner = (
    <>
      <div className="gm-fact-l">{icon} {label}</div>
      <div className="gm-fact-v">{value}</div>
      {sub && <div className="gm-fact-s">{sub}</div>}
    </>
  );
  return href
    ? <a className="gm-fact gm-fact-link" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <div className="gm-fact">{inner}</div>;
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const ok = url && /\.(jpe?g|png|gif|webp)$/i.test(url);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center",
      fontWeight: 800, color: "#0B0D11", fontSize: size * 0.4,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ok ? <img src={url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name.charAt(0).toUpperCase()}
    </div>
  );
}
