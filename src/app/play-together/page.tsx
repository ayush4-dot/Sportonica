import Link from "next/link";
import type { Metadata } from "next";
import { Users, Wallet } from "lucide-react";
import { listPublishedGames } from "@/lib/playTogether/queries";
import { availablePlayerSpots } from "@/lib/playTogether/types";

export const dynamic = "force-dynamic";

const KTM = "Asia/Kathmandu";

export const metadata: Metadata = {
  title: "Play Together — Khelam Na",
  description: "Join a game a host has already booked and paid for. Pay them directly in cash at the venue.",
};

export default async function PlayTogetherPage() {
  const games = await listPublishedGames();

  return (
    <div className="play">
      <div className="play-wrap">
        <div className="play-hero">
          <span className="play-eyebrow">Play Together</span>
          <h1>Join a <em>game</em>, not a booking</h1>
          <p>
            The host has already booked and paid for the venue. Join for free, then pay your
            share to the host in cash when you arrive.
          </p>
          <Link href="/play-together/new" className="play-btn gold" style={{ marginTop: 18, display: "inline-flex" }}>
            Host a game
          </Link>
        </div>

        {games.length === 0 ? (
          <div className="play-empty">
            <h3>No games open right now</h3>
            <p>Be the first — host a game and pay for the venue upfront.</p>
          </div>
        ) : (
          <div className="play-grid">
            {games.map((g) => {
              const spots = availablePlayerSpots(g);
              const spotsLeft = Math.max(spots - g.joined_count, 0);
              const start = new Date(g.starts_at);
              const dateLine = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM });
              const timeLine = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
              return (
                <Link key={g.id} href={`/play-together/${g.id}`} className="venue-card">
                  <div className="venue-info" style={{ padding: "18px 20px 20px" }}>
                    <h3>{g.sport}{g.game_format ? ` · ${g.game_format}` : ""}</h3>
                    <p className="venue-meta">{g.venues?.name ?? "Venue"} · {dateLine}, {timeLine}</p>
                    <div className="pt-progress">
                      <div className="pt-progress-track">
                        <div className="pt-progress-bar" style={{ width: `${spots > 0 ? Math.min(100, (g.joined_count / spots) * 100) : 0}%` }} />
                      </div>
                      <span className="pt-progress-label"><Users size={12} style={{ verticalAlign: -2 }} /> {g.joined_count}/{spots}</span>
                    </div>
                    <p className="venue-meta" style={{ margin: "8px 0 0" }}>
                      {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} available` : "Full — join waitlist soon"}
                    </p>
                    <div className="venue-price" style={{ marginTop: 12 }}>
                      <span className="amt">Rs {g.contribution_amount}<small>/player</small></span>
                      <span className="pt-badge"><Wallet size={12} /> Pay host at venue</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
