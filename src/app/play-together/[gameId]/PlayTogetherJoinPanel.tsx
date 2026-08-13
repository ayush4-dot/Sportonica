"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { joinGame, leaveGame } from "@/lib/playTogether/actions";

export default function PlayTogetherJoinPanel({
  gameId, isHost, alreadyJoined, isPublished, joiningOpen, spotsLeft, loggedIn,
}: {
  gameId: string;
  isHost: boolean;
  alreadyJoined: boolean;
  isPublished: boolean;
  joiningOpen: boolean;
  spotsLeft: number;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState(alreadyJoined);
  const [err, setErr] = useState<string | null>(null);

  function handleJoin() {
    if (!loggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await joinGame(gameId);
        setJoined(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not join this game.");
      }
    });
  }

  function handleLeave() {
    setErr(null);
    startTransition(async () => {
      try {
        await leaveGame(gameId);
        setJoined(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not leave this game.");
      }
    });
  }

  if (isHost) {
    return (
      <div style={{ marginTop: 16 }}>
        <p className="hint">You&apos;re hosting this game.</p>
        <Link href={`/play-together/${gameId}/manage`} className="play-btn gold" style={{ width: "100%", justifyContent: "center", display: "flex", marginTop: 8 }}>
          Manage game
        </Link>
      </div>
    );
  }

  if (!isPublished) {
    return <p className="hint" style={{ marginTop: 16 }}>This game isn&apos;t open for joining right now.</p>;
  }

  return (
    <div style={{ marginTop: 16 }}>
      {err && <div className="bkw-err" style={{ marginBottom: 10 }}>{err}</div>}
      {joined ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 10 }}><Check size={13} /> You&apos;re in</div>
          {joiningOpen ? (
            <button className="play-btn ghost" style={{ width: "100%" }} onClick={handleLeave} disabled={pending}>
              {pending ? "Leaving…" : "Leave game"}
            </button>
          ) : (
            <p className="hint">Joining has closed — you can no longer leave online.</p>
          )}
        </>
      ) : !joiningOpen ? (
        <p className="hint">Joining has closed for this game.</p>
      ) : spotsLeft <= 0 ? (
        <button className="play-btn ghost" style={{ width: "100%" }} disabled>Game full</button>
      ) : (
        <button className="play-btn gold" style={{ width: "100%" }} onClick={handleJoin} disabled={pending}>
          {pending ? "Joining…" : "Confirm & Join"}
        </button>
      )}
    </div>
  );
}
