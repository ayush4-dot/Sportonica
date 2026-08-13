"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Clock3, Phone } from "lucide-react";
import { joinGame, leaveGame } from "@/lib/playTogether/actions";
import { hostQrPublicUrl } from "@/lib/playTogether/types";
import type { GamePlayerStatus } from "@/lib/playTogether/types";

export default function PlayTogetherJoinPanel({
  gameId, isHost, myStatus, isPublished, joiningOpen, spotsLeft, loggedIn, contribution, hostQrPath, hostPhone,
}: {
  gameId: string;
  isHost: boolean;
  myStatus: GamePlayerStatus | null;
  isPublished: boolean;
  joiningOpen: boolean;
  spotsLeft: number;
  loggedIn: boolean;
  contribution: number;
  hostQrPath: string | null;
  hostPhone: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(myStatus);
  const [err, setErr] = useState<string | null>(null);

  function handleRequest() {
    if (!loggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await joinGame(gameId);
        setStatus("requested");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not send your request.");
      }
    });
  }

  function handleLeave() {
    setErr(null);
    startTransition(async () => {
      try {
        await leaveGame(gameId);
        setStatus("left");
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

      {status === "joined" ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 12 }}><Check size={13} /> You&apos;re in</div>
          {(hostQrPath || hostPhone) && (
            <div className="pt-players-list" style={{ marginBottom: 12 }}>
              <div className="pt-player-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <span className="pt-player-name">Pay Rs {contribution} to the host</span>
                {hostPhone && (
                  <span className="pt-player-sub"><Phone size={12} style={{ verticalAlign: -2 }} /> {hostPhone}</span>
                )}
                {hostQrPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hostQrPublicUrl(hostQrPath) ?? ""} alt="Host's payment QR"
                    style={{ width: "100%", maxWidth: 220, borderRadius: 10, background: "#fff", padding: 8 }}
                  />
                )}
              </div>
            </div>
          )}
          {joiningOpen ? (
            <button className="play-btn ghost" style={{ width: "100%" }} onClick={handleLeave} disabled={pending}>
              {pending ? "Leaving…" : "Leave game"}
            </button>
          ) : (
            <p className="hint">Joining has closed — you can no longer leave online.</p>
          )}
        </>
      ) : status === "requested" ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 10, color: "#d97706", background: "rgba(217,119,6,.1)", borderColor: "rgba(217,119,6,.3)" }}>
            <Clock3 size={13} /> Request sent
          </div>
          <p className="hint">Waiting for the host to approve you. You&apos;ll be notified either way.</p>
          {joiningOpen && (
            <button className="play-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={handleLeave} disabled={pending}>
              {pending ? "Withdrawing…" : "Withdraw request"}
            </button>
          )}
        </>
      ) : !joiningOpen ? (
        <p className="hint">Joining has closed for this game.</p>
      ) : spotsLeft <= 0 ? (
        <button className="play-btn ghost" style={{ width: "100%" }} disabled>Game full</button>
      ) : (
        <>
          <button className="play-btn gold" style={{ width: "100%" }} onClick={handleRequest} disabled={pending}>
            {pending ? "Sending…" : "Request to Join"}
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            The host reviews every request — you&apos;ll only be notified once they approve it.
          </p>
        </>
      )}
    </div>
  );
}
