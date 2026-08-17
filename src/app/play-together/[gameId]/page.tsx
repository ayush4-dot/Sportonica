import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Users, Wallet, Clock, ExternalLink } from "lucide-react";
import { getGame, getGamePlayers, getMyGamePlayerStatus, getSimilarPublishedGames } from "@/lib/playTogether/queries";
import { createClient } from "@/lib/supabase/server";
import { availablePlayerSpots } from "@/lib/playTogether/types";
import { sportColor, normalizeSport } from "@/lib/sports";
import { SKILL_LEVEL_LABEL } from "@/components/playTogether/SkillLevelPicker";
import ShareGameButton from "@/components/playTogether/ShareGameButton";
import PlayTogetherJoinPanel from "./PlayTogetherJoinPanel";

export const dynamic = "force-dynamic";

const KTM = "Asia/Kathmandu";

export async function generateMetadata({ params }: { params: Promise<{ gameId: string }> }): Promise<Metadata> {
  const { gameId } = await params;
  const game = await getGame(gameId);
  if (!game) return { title: "Game · Khelam Na" };
  return {
    title: `${game.sport}${game.game_format ? " · " + game.game_format : ""} · Play Together · Khelam Na`,
    description: `${game.sport} at ${game.venues?.name ?? "the venue"} · Rs ${game.contribution_amount}/player, paid to the host.`,
  };
}

export default async function PlayTogetherGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const game = await getGame(gameId);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!game) notFound();
  // A host previewing their own not-yet-published/cancelled game is allowed
  // through RLS but shouldn't be visible to anyone else on this public page.
  if (game.status !== "published" && game.host_id !== user?.id) notFound();

  const [players, similar] = await Promise.all([
    getGamePlayers(gameId),
    getSimilarPublishedGames(game),
  ]);
  const isHost = user?.id === game.host_id;
  const myPlayer = user && !isHost ? await getMyGamePlayerStatus(gameId, user.id) : null;
  // The player needs to see the host's QR/phone for the whole payment
  // window, not only once fully confirmed — otherwise they'd have no way
  // to actually pay during 'payment_pending'/'payment_verification_pending'.
  const paymentInfoVisible = !!myPlayer && ["payment_pending", "payment_verification_pending", "joined", "payment_rejected"].includes(myPlayer.status);

  const spots = availablePlayerSpots(game);
  const spotsLeft = Math.max(spots - players.length, 0);
  const start = new Date(game.starts_at);
  const end = new Date(game.ends_at);
  const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
  const dateLine = start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM });
  const deadlineLine = new Date(game.joining_deadline).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM,
  });
  const joiningOpen = new Date(game.joining_deadline).getTime() > Date.now();
  const color = sportColor(normalizeSport(game.sport));
  const hostName = game.host?.full_name ?? game.host?.name ?? "Host";
  const mapsHref = game.venues?.lat != null && game.venues?.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${game.venues.lat},${game.venues.lng}` : null;

  return (
    <div className="play">
      <div className="play-wrap">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link href="/play-together" className="bk-back"><ArrowLeft size={15} /> All games</Link>
          <ShareGameButton
            gameId={game.id}
            title={`${game.sport}${game.game_format ? " · " + game.game_format : ""} · Play Together`}
            text={`Join my ${game.sport} game at ${game.venues?.name ?? "the venue"} on Khelam Na`}
          />
        </div>

        <div className="bk-layout" style={{ marginTop: 20 }}>
          <div>
            <div className="bk-panel">
              {game.status !== "published" && (
                <span className={`pt-status-pill ${game.status}`} style={{ marginBottom: 10 }}>
                  {game.status === "awaiting_payment" ? "Awaiting payment" : "Cancelled"}
                </span>
              )}

              {/* Masthead */}
              <div className="pt-eyebrow" style={{ color }}>
                Play Together
                <span className="sep" />
                {game.sport}
                {game.game_format && <><span className="sep" />{game.game_format}</>}
              </div>
              <h3 style={{ fontSize: 28, margin: "0 0 12px" }}>{game.sport}{game.game_format ? ` · ${game.game_format}` : ""}</h3>

              <div className="pt-host">
                <Avatar name={hostName} url={game.host?.avatar_url ?? null} size={32} />
                <span>Hosted by <span className="pt-host-name">{hostName}</span></span>
              </div>

              <div className="pt-tags">
                <span className="pt-tag">{SKILL_LEVEL_LABEL[game.skill_level] ?? SKILL_LEVEL_LABEL.any}</span>
              </div>

              {/* Key facts strip */}
              <div className="pt-facts">
                <Fact icon={<Clock size={14} />} label="When" value={dateLine} sub={`${fmt(start)} – ${fmt(end)}`} />
                <Fact icon={<MapPin size={14} />} label="Where" value={game.venues?.name ?? "Venue"}
                  sub={game.courts?.name ?? undefined} href={mapsHref ?? undefined} />
                <Fact icon={<Wallet size={14} />} label="Cost" value={`Rs ${game.contribution_amount}`} sub="per player" />
                <Fact icon={<Users size={14} />} label="Squad" value={`${players.length} of ${spots}`}
                  sub={spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left` : "Full"} />
              </div>

              <p className="hint" style={{ marginTop: -4, marginBottom: 4 }}>Joining closes {deadlineLine}</p>

              {game.notes && (
                <section className="pt-sec">
                  <h4 className="pt-sec-t">What to expect</h4>
                  <p className="hint" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{game.notes}</p>
                </section>
              )}

              <section className="pt-sec">
                <h4 className="pt-sec-t">
                  Who&apos;s playing
                  <span className="pt-sec-count">{players.length} in</span>
                </h4>
                <div className="pt-progress">
                  <div className="pt-progress-track">
                    <div className="pt-progress-bar" style={{ width: `${spots > 0 ? Math.min(100, (players.length / spots) * 100) : 0}%` }} />
                  </div>
                  <span className="pt-progress-label"><Users size={12} style={{ verticalAlign: -2 }} /> {players.length}/{spots}</span>
                </div>
                <p className={`pt-min-note ${players.length + 1 >= game.min_players ? "ok" : ""}`}>
                  Minimum required: {game.min_players} (including you as host)
                </p>

                {players.length === 0 ? (
                  <p className="hint">Nobody&apos;s joined yet — be the first to request a spot.</p>
                ) : (
                  <div className="pt-players-grid">
                    {players.map((p) => {
                      const name = p.profiles?.full_name ?? p.profiles?.name ?? "Player";
                      return (
                        <div key={p.id} className="pt-player-card">
                          <Avatar name={name} url={p.profiles?.avatar_url ?? null} size={36} />
                          <div>
                            <div className="pt-player-name">{name}</div>
                            <div className="pt-player-sub">Approved</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {similar.length > 0 && (
              <div className="bk-panel" style={{ marginTop: 20 }}>
                <h4 className="pt-sec-t" style={{ marginTop: 0 }}>More {game.sport} · Play Together</h4>
                <div className="pt-rail">
                  {similar.map((s) => (
                    <Link key={s.id} href={`/play-together/${s.id}`} className="pt-mini">
                      <div className="pt-mini-t">{s.venues?.name ?? "Venue"}</div>
                      <div className="pt-mini-m">
                        {new Date(s.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM })}
                        {" · "}
                        {new Date(s.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM })}
                      </div>
                      <div className="pt-mini-f">
                        <span>Rs {s.contribution_amount}/player</span>
                        <ExternalLink size={12} style={{ opacity: 0.4 }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bk-summary">
            <div className="bk-panel">
              <div className="pt-badge" style={{ marginBottom: 14 }}>
                <Wallet size={13} /> Pay host at venue
              </div>
              <div className="bk-sum-row bk-sum-total">
                <span className="lbl">Your contribution</span>
                <span className="val">Rs {game.contribution_amount}</span>
              </div>
              <p className="hint" style={{ marginTop: -4 }}>
                No payment is required to Khelam Na for joining this game.
              </p>

              <PlayTogetherJoinPanel
                gameId={game.id}
                isHost={isHost}
                myPlayer={myPlayer}
                isPublished={game.status === "published"}
                joiningOpen={joiningOpen}
                spotsLeft={spotsLeft}
                loggedIn={!!user}
                contribution={game.contribution_amount}
                sport={game.sport}
                venueName={game.venues?.name ?? "the venue"}
                hostQrPath={paymentInfoVisible ? game.host_qr_path : null}
                hostPhone={paymentInfoVisible ? game.host_phone : null}
              />
            </div>
          </div>
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
      <div className="pt-fact-l">{icon} {label}</div>
      <div className="pt-fact-v">{value}</div>
      {sub && <div className="pt-fact-s">{sub}</div>}
    </>
  );
  return href
    ? <a className="pt-fact pt-fact-link" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <div className="pt-fact">{inner}</div>;
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const ok = url && /\.(jpe?g|png|gif|webp)$/i.test(url);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center",
      fontWeight: 800, color: "#F2EDE6", fontSize: size * 0.4,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ok ? <img src={url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name.charAt(0).toUpperCase()}
    </div>
  );
}
