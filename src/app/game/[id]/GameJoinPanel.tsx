"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Share2, Wallet } from "lucide-react";
import { joinGame } from "@/lib/play/actions";

export default function GameJoinPanel({
  gameId, venueId, sport, fee, slotsLeft, alreadyIn, isHost, venue, mapsHref,
}: {
  gameId: string; venueId: string | null; sport: string; fee: number;
  slotsLeft: number; alreadyIn: boolean; isHost: boolean;
  venue: string; mapsHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState(alreadyIn);
  const [pay, setPay] = useState<"khalti" | "esewa">("khalti");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function join() {
    setErr(null);
    startTransition(async () => {
      try {
        await joinGame({ event_id: gameId, venue_id: venueId, sport, amount: fee });
        setJoined(true);
        router.refresh();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Could not join.";
        if (m.includes("UNAUTHORIZED")) { router.push(`/login?redirect=/game/${gameId}`); return; }
        if (m.includes("ALREADY_JOINED")) { setJoined(true); return; }
        if (m.includes("GAME_FULL")) { setErr("This game just filled up."); return; }
        setErr(m);
      }
    });
  }

  async function share() {
    const url = `${window.location.origin}/game/${gameId}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${sport} at ${venue}`, url }); } catch { /* dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* blocked */ }
  }

  return (
    <div className="gm-card gm-join">
      <div className="gm-join-fee">
        {fee === 0 ? "Free" : <>Rs {fee}<span>/player</span></>}
      </div>
      <div className="gm-join-slots">
        {slotsLeft > 0 ? `${slotsLeft} spot${slotsLeft !== 1 ? "s" : ""} left` : "Game full"}
      </div>

      {!joined && !isHost && slotsLeft > 0 && (
        <>
          <div className="gm-pay-l"><Wallet size={12} /> Pay with <span className="gm-demo">demo</span></div>
          <div className="gm-pay">
            {(["khalti", "esewa"] as const).map((m) => (
              <button key={m} className={`gm-pay-b ${pay === m ? "on" : ""}`} onClick={() => setPay(m)}>{m}</button>
            ))}
          </div>
        </>
      )}

      {err && <div className="gm-err">{err}</div>}

      {isHost ? (
        <div className="gm-join-note">You&apos;re hosting this game.</div>
      ) : joined ? (
        <div className="gm-joined"><Check size={16} /> You&apos;re in</div>
      ) : (
        <button className="gm-btn" onClick={join} disabled={pending || slotsLeft <= 0}>
          {pending ? "Joining…" : slotsLeft <= 0 ? "Game full" : fee === 0 ? "Join game" : `Pay Rs ${fee} & join`}
        </button>
      )}

      <div className="gm-join-actions">
        <button className="gm-btn ghost" onClick={share}>
          <Share2 size={14} /> {copied ? "Link copied" : "Share"}
        </button>
        {mapsHref && (
          <a className="gm-btn ghost" href={mapsHref} target="_blank" rel="noopener noreferrer">
            <MapPin size={14} /> Directions
          </a>
        )}
      </div>
    </div>
  );
}
