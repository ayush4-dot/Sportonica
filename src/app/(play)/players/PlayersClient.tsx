"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Search, UserSearch } from "lucide-react";
import { searchPlayersAction } from "@/lib/friends/actions";
import FriendRequestButton from "@/components/FriendRequestButton";
import type { PlayerListItem } from "@/lib/friends/queries";

export default function PlayersClient({ initial }: { initial: PlayerListItem[] }) {
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(async () => {
        const next = await searchPlayersAction(q);
        setPlayers(next);
      });
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <Search size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players by name or username…"
          style={{
            width: "100%", padding: "11px 14px 11px 36px", borderRadius: 12,
            border: "1px solid var(--line, rgba(255,255,255,.1))", background: "transparent",
            color: "inherit", fontFamily: "inherit", fontSize: 14, outline: "none",
          }}
        />
      </div>

      {players.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", opacity: pending ? 0.3 : 0.5, transition: "opacity .15s" }}>
          <UserSearch size={26} style={{ opacity: 0.5, marginBottom: 10 }} />
          <div style={{ fontSize: 13.5 }}>{q ? "No players match that search." : "No players to show yet."}</div>
        </div>
      ) : (
        <div style={{ opacity: pending ? 0.5 : 1, transition: "opacity .15s" }}>
          {players.map((p) => {
            const name = p.full_name ?? p.username ?? "Player";
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line, rgba(255,255,255,.1))" }}>
                <Link href={p.username ? `/p/${p.username}` : "#"} style={{ flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", overflow: "hidden",
                    background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center",
                    fontSize: 16, fontWeight: 800, color: "#0B0D11",
                  }}>
                    {p.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : name.charAt(0).toUpperCase()}
                  </div>
                </Link>
                <Link href={p.username ? `/p/${p.username}` : "#"} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
                  {p.username && <div style={{ fontSize: 12, opacity: 0.55 }}>@{p.username}</div>}
                </Link>
                <FriendRequestButton profileId={p.id} initial={p.relationship} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
