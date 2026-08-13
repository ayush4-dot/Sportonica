import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, Clock } from "lucide-react";
import { getGame, getGamePlayers, getGameCourtBookingStatus, getPendingRequests } from "@/lib/playTogether/queries";
import { createClient } from "@/lib/supabase/server";
import { availablePlayerSpots } from "@/lib/playTogether/types";
import PlayTogetherManageClient from "./PlayTogetherManageClient";

export const dynamic = "force-dynamic";

const KTM = "Asia/Kathmandu";

export const metadata: Metadata = { title: "Manage game — Khelam Na" };

export default async function ManagePlayTogetherGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const game = await getGame(gameId);
  if (!game) notFound();

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/play-together/${gameId}/manage`)}`);
  if (game.host_id !== user.id) notFound();

  const [players, requests, booking] = await Promise.all([
    getGamePlayers(gameId),
    getPendingRequests(gameId),
    getGameCourtBookingStatus(game.court_booking_id),
  ]);

  const spots = availablePlayerSpots(game);
  const start = new Date(game.starts_at);
  const end = new Date(game.ends_at);
  const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
  const dateLine = start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM });
  const expectedCollection = players.length * Number(game.contribution_amount);

  return (
    <div className="play">
      <div className="play-wrap">
        <Link href={`/play-together/${gameId}`} className="bk-back"><ArrowLeft size={15} /> Game page</Link>

        <div className="bk-panel" style={{ marginTop: 20 }}>
          <span className={`pt-status-pill ${game.status}`} style={{ marginBottom: 10 }}>
            {game.status === "published" ? "Confirmed" : game.status === "awaiting_payment" ? "Awaiting payment" : "Cancelled"}
          </span>
          <h3 style={{ fontSize: 24 }}>{game.sport}{game.game_format ? ` · ${game.game_format}` : ""}</h3>
          <p className="hint">
            <MapPin size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            {game.venues?.name ?? "Venue"} · {game.courts?.name ?? ""}
          </p>
          <p className="hint">
            <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            {dateLine}, {fmt(start)}–{fmt(end)}
          </p>

          <div className="bk-sum-row"><span className="lbl">Venue payment</span>
            <span className="val">{booking?.payment_status === "paid" ? "✓ Paid" : booking?.payment_status ?? "—"}</span></div>
          <div className="bk-sum-row"><span className="lbl">Venue cost</span><span className="val">Rs {booking?.price ?? 0}</span></div>
          <div className="bk-sum-row"><span className="lbl">Players</span><span className="val">{players.length} / {spots}</span></div>
          <div className="bk-sum-row"><span className="lbl">Player contribution</span><span className="val">Rs {game.contribution_amount}/player</span></div>
          <div className="bk-sum-row bk-sum-total"><span className="lbl">Expected collection</span><span className="val">Rs {expectedCollection}</span></div>

          <PlayTogetherManageClient gameId={gameId} players={players} requests={requests} gameStatus={game.status} />
        </div>
      </div>
    </div>
  );
}
