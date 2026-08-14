"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RailGame {
  id: string;
  sport: string;
  game_format: string | null;
  starts_at: string;
  contribution_amount: number;
  max_players: number;
  venues: { name: string } | null;
}

const KTM = "Asia/Kathmandu";

// Surfaces Play Together games (host-approved-request, pay-the-host-
// directly marketplace — see src/lib/playTogether/) right on the main
// "Play" page instead of leaving it only reachable by knowing the
// /play-together URL. Client-side query, not a server fetch, because
// this whole page is a client component; RLS (games_read_public) already
// allows anyone to read published rows.
export default function PlayTogetherRail() {
  const [games, setGames] = useState<RailGame[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("games")
      .select("id, sport, game_format, starts_at, contribution_amount, max_players, venues(name)")
      .eq("status", "published")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(8)
      .then(({ data }) => { if (!cancelled) setGames((data as unknown as RailGame[]) ?? []); });
    return () => { cancelled = true; };
  }, []);

  if (games === null || games.length === 0) return null;

  return (
    <div className="disc-pt-rail">
      <div className="disc-pt-rail-head">
        <div>
          <h2>Play Together</h2>
          <p>Games a host already booked and paid for — join for free, pay them directly.</p>
        </div>
        <Link href="/play-together">See all</Link>
      </div>
      <div className="disc-pt-rail-scroll">
        {games.map((g) => (
          <Link key={g.id} href={`/play-together/${g.id}`} className="disc-pt-card">
            <span className="disc-pt-sport">{g.sport}{g.game_format ? ` · ${g.game_format}` : ""}</span>
            <span className="disc-pt-venue">{g.venues?.name ?? "Venue"}</span>
            <span className="disc-pt-when">
              {new Date(g.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM })}
            </span>
            <span className="disc-pt-foot">
              <span className="amt">Rs {g.contribution_amount}<small>/player</small></span>
              <span className="badge"><Wallet size={11} /> Pay host</span>
            </span>
          </Link>
        ))}
        <Link href="/play-together/new" className="disc-pt-card host">
          <Users size={18} />
          <span>Host a game on Play Together</span>
        </Link>
      </div>

      <style>{`
        .disc-pt-rail { margin: 0 0 28px; }
        .disc-pt-rail-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .disc-pt-rail-head h2 { font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 800; margin: 0; }
        .disc-pt-rail-head p { font-size: 12.5px; color: var(--faint); margin: 3px 0 0; }
        .disc-pt-rail-head a { font-size: 12.5px; font-weight: 700; color: var(--turf); text-decoration: none; white-space: nowrap; }
        .disc-pt-rail-scroll { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
        .disc-pt-card {
          flex-shrink: 0; width: 200px; display: flex; flex-direction: column; gap: 4px;
          padding: 14px 16px; border-radius: 14px; border: 1px solid var(--line);
          background: var(--ink-2, rgba(255,255,255,0.03)); text-decoration: none; color: inherit;
        }
        .disc-pt-sport { font-weight: 700; font-size: 14px; }
        .disc-pt-venue, .disc-pt-when { font-size: 11.5px; color: var(--faint); }
        .disc-pt-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
        .disc-pt-foot .amt { font-weight: 700; font-size: 13px; }
        .disc-pt-foot .amt small { font-weight: 500; opacity: .6; }
        .disc-pt-foot .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--turf); }
        .disc-pt-card.host { align-items: center; justify-content: center; text-align: center; gap: 8px;
          border-style: dashed; color: var(--turf); font-weight: 700; font-size: 13px; }
      `}</style>
    </div>
  );
}
