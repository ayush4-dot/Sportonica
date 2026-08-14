"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Clock3, Phone, AlertTriangle, XCircle } from "lucide-react";
import { joinGame, leaveGame } from "@/lib/playTogether/actions";
import { hostQrPublicUrl, effectivePlayerStatus } from "@/lib/playTogether/types";
import type { GamePlayer } from "@/lib/playTogether/types";
import PlayTogetherPaymentModal from "./PlayTogetherPaymentModal";

export default function PlayTogetherJoinPanel({
  gameId, isHost, myPlayer, isPublished, joiningOpen, spotsLeft, loggedIn, contribution,
  sport, venueName, hostQrPath, hostPhone,
}: {
  gameId: string;
  isHost: boolean;
  myPlayer: GamePlayer | null;
  isPublished: boolean;
  joiningOpen: boolean;
  spotsLeft: number;
  loggedIn: boolean;
  contribution: number;
  sport: string;
  venueName: string;
  hostQrPath: string | null;
  hostPhone: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [player, setPlayer] = useState(myPlayer);
  const [err, setErr] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const autoOpenedRef = useRef(false);

  const status = player ? effectivePlayerStatus(player) : null;

  // The "payment popup" auto-surfaces once when a player lands on (or
  // returns to) a payment_pending/payment_rejected request — closing it
  // ("I'll Pay Later") never cancels the request; the reminder
  // notifications (see send_due_play_together_reminders() in
  // supabase/play_together_payments.sql) are what nudge them the rest of
  // the way through the 2-hour window when they're not on this page.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (status === "payment_pending" || status === "payment_rejected") {
      autoOpenedRef.current = true;
      setShowPaymentModal(true);
    }
  }, [status]);

  function handleRequest() {
    if (!loggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        const row = await joinGame(gameId);
        setPlayer(row);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not send your request.");
      }
    });
  }

  function handleLeave() {
    setErr(null);
    startTransition(async () => {
      try {
        const row = await leaveGame(gameId);
        setPlayer(row);
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
            <Clock3 size={13} /> Pending Host Approval
          </div>
          <p className="hint">Waiting for the host to approve your request.</p>
          {joiningOpen && (
            <button className="play-btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={handleLeave} disabled={pending}>
              {pending ? "Withdrawing…" : "Withdraw request"}
            </button>
          )}
        </>
      ) : status === "payment_pending" || status === "payment_rejected" ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 10, color: "#d97706", background: "rgba(217,119,6,.1)", borderColor: "rgba(217,119,6,.3)" }}>
            <AlertTriangle size={13} /> {status === "payment_rejected" ? "Payment Not Verified" : "Payment Required"}
          </div>
          <p className="hint">
            {status === "payment_rejected"
              ? "The host couldn't verify your last payment. Submit valid proof again before your window closes."
              : "The host approved your request. Complete payment within 2 hours to secure your spot."}
          </p>
          <button className="play-btn gold" style={{ width: "100%", marginTop: 8 }} onClick={() => setShowPaymentModal(true)}>
            Pay Now
          </button>
          {player?.payment_deadline && showPaymentModal && (
            <PlayTogetherPaymentModal
              gamePlayerId={player.id}
              gameId={gameId}
              sport={sport}
              venueName={venueName}
              contribution={contribution}
              paymentDeadline={player.payment_deadline}
              hostQrPath={hostQrPath}
              hostPhone={hostPhone}
              resubmit={status === "payment_rejected"}
              onClose={() => setShowPaymentModal(false)}
              onSubmitted={() => {
                setShowPaymentModal(false);
                setPlayer((p) => (p ? { ...p, status: "payment_verification_pending" } : p));
              }}
            />
          )}
        </>
      ) : status === "payment_verification_pending" ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 10 }}>
            <Clock3 size={13} /> Payment Verification Pending
          </div>
          <p className="hint">Your payment proof has been submitted. Waiting for host verification.</p>
        </>
      ) : status === "expired" ? (
        <>
          <div className="pt-badge" style={{ marginBottom: 10, color: "#ef4444", background: "rgba(239,68,68,.1)", borderColor: "rgba(239,68,68,.3)" }}>
            <XCircle size={13} /> Request Expired
          </div>
          <p className="hint">The payment deadline has passed. You can send a new request if spots are still open.</p>
          {joiningOpen && spotsLeft > 0 && (
            <button className="play-btn gold" style={{ width: "100%", marginTop: 8 }} onClick={handleRequest} disabled={pending}>
              {pending ? "Sending…" : "Request to Join"}
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
