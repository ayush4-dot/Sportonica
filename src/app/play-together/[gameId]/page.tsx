import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Users, Wallet, Clock } from "lucide-react";
import { getGame, getGamePlayers, getMyGamePlayerStatus } from "@/lib/playTogether/queries";
import { createClient } from "@/lib/supabase/server";
import { availablePlayerSpots } from "@/lib/playTogether/types";
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

  const players = await getGamePlayers(gameId);
  const isHost = user?.id === game.host_id;
  const myPlayer = user && !isHost ? await getMyGamePlayerStatus(gameId, user.id) : null;
  const myStatus = myPlayer?.status ?? null;

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

  return (
    <div className="play">
      <div className="play-wrap">
        <Link href="/play-together" className="bk-back"><ArrowLeft size={15} /> All games</Link>

        <div className="bk-layout" style={{ marginTop: 20 }}>
          <div>
            <div className="bk-panel">
              {game.status !== "published" && (
                <span className={`pt-status-pill ${game.status}`} style={{ marginBottom: 10 }}>
                  {game.status === "awaiting_payment" ? "Awaiting payment" : "Cancelled"}
                </span>
              )}
              <h3 style={{ fontSize: 24 }}>{game.sport}{game.game_format ? ` · ${game.game_format}` : ""}</h3>
              <p className="hint" style={{ marginBottom: 4 }}>
                <MapPin size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {game.venues?.name ?? "Venue"} · {game.courts?.name ?? ""}
              </p>
              <p className="hint">
                <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {dateLine}, {fmt(start)}–{fmt(end)}
              </p>
              <p className="hint" style={{ marginTop: 10 }}>Joining closes {deadlineLine}</p>

              {game.notes && (
                <p className="hint" style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{game.notes}</p>
              )}

              <div className="pt-progress" style={{ marginTop: 18 }}>
                <div className="pt-progress-track">
                  <div className="pt-progress-bar" style={{ width: `${spots > 0 ? Math.min(100, (players.length / spots) * 100) : 0}%` }} />
                </div>
                <span className="pt-progress-label"><Users size={12} style={{ verticalAlign: -2 }} /> {players.length}/{spots}</span>
              </div>
              <p className={`pt-min-note ${players.length + 1 >= game.min_players ? "ok" : ""}`}>
                Minimum required: {game.min_players} (including you as host)
              </p>

              {players.length > 0 && (
                <div className="pt-players-list">
                  {players.map((p) => (
                    <div key={p.id} className="pt-player-row">
                      <span className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</span>
                      <span className="pt-player-sub">Approved</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                myStatus={myStatus}
                isPublished={game.status === "published"}
                joiningOpen={joiningOpen}
                spotsLeft={spotsLeft}
                loggedIn={!!user}
                contribution={game.contribution_amount}
                hostQrPath={myStatus === "joined" ? game.host_qr_path : null}
                hostPhone={myStatus === "joined" ? game.host_phone : null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
