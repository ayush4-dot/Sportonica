"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { markContributionCollected, cancelGame, approveJoinRequest, verifyPlayTogetherPayment } from "@/lib/playTogether/actions";
import { isActionError } from "@/lib/actionError";
import type { GamePlayerWithProfile } from "@/lib/playTogether/queries";
import type { GameStatus } from "@/lib/playTogether/types";
import PlayTogetherReviewModal from "./PlayTogetherReviewModal";
import PlayTogetherPaymentReviewModal from "./PlayTogetherPaymentReviewModal";

export default function PlayTogetherManageClient({
  gameId, sport, players, requests, paymentsToReview, paymentPending, historical, gameStatus,
}: {
  gameId: string;
  sport: string;
  players: GamePlayerWithProfile[];
  requests: GamePlayerWithProfile[];
  paymentsToReview: GamePlayerWithProfile[];
  paymentPending: GamePlayerWithProfile[];
  historical: GamePlayerWithProfile[];
  gameStatus: GameStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(players);
  const [pendingRows, setPendingRows] = useState(requests);
  const [paymentReviewRows, setPaymentReviewRows] = useState(paymentsToReview);
  const [awaitingPaymentRows, setAwaitingPaymentRows] = useState(paymentPending);
  const [historicalRows, setHistoricalRows] = useState(historical);
  const [reviewing, setReviewing] = useState<GamePlayerWithProfile | null>(null);
  const [reviewingPayment, setReviewingPayment] = useState<GamePlayerWithProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every action on this page used to change state silently — a host had
  // no confirmation their tap actually did anything. This surfaces a brief
  // toast after each one; it always clears the previous timer first so
  // back-to-back actions don't cut the popup short.
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function toggle(playerId: string, collected: boolean) {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await markContributionCollected(playerId, gameId, collected);
        if (isActionError(res)) { setErr(res.message); return; }
        setRows((rs) => rs.map((r) => r.id === playerId
          ? { ...r, contribution_status: collected ? "collected" : "pending", collected_at: collected ? new Date().toISOString() : null }
          : r));
        notify(collected ? "Marked as collected" : "Marked as not collected");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not update this player.");
      }
    });
  }

  async function review(row: GamePlayerWithProfile, approve: boolean) {
    const res = await approveJoinRequest(row.id, gameId, approve);
    if (isActionError(res)) throw new Error(res.message);
    setPendingRows((rs) => rs.filter((r) => r.id !== row.id));
    if (approve) {
      setAwaitingPaymentRows((rs) => [...rs, { ...row, status: "payment_pending" }]);
    } else {
      setHistoricalRows((rs) => [{ ...row, status: "rejected" }, ...rs]);
    }
    setReviewing(null);
    notify(approve ? "Request approved — waiting on their payment" : "Request rejected");
  }

  // The ONLY action that actually adds a player to the group — see
  // verify_play_together_payment() in supabase/play-together/play_together_payments.sql.
  async function reviewPayment(row: GamePlayerWithProfile, approve: boolean, rejectReason?: string) {
    const res = await verifyPlayTogetherPayment(row.id, gameId, approve, rejectReason);
    if (isActionError(res)) throw new Error(res.message);
    setPaymentReviewRows((rs) => rs.filter((r) => r.id !== row.id));
    if (approve) {
      setRows((rs) => [...rs, { ...row, status: "joined", contribution_status: "collected" }]);
    } else {
      setAwaitingPaymentRows((rs) => [...rs, { ...row, status: "payment_rejected", payment_rejection_reason: rejectReason ?? null }]);
    }
    setReviewingPayment(null);
    notify(approve ? "Payment verified — player confirmed" : "Payment rejected");
  }

  function doCancel() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await cancelGame(gameId, reason);
        if (isActionError(res)) { setErr(res.message); return; }
        notify("Game cancelled");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not cancel this game.");
      }
    });
  }

  return (
    <div>
      {err && <div className="bkw-err" style={{ marginTop: 10 }}>{err}</div>}

      {pendingRows.length > 0 && (
        <>
          <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>
            Pending requests ({pendingRows.length})
          </p>
          <div className="pt-players-list">
            {pendingRows.map((p) => (
              <div key={p.id} className="pt-player-row">
                <div>
                  <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                  <div className="pt-player-sub">Wants to join</div>
                </div>
                <button className="pt-collect-btn" onClick={() => setReviewing(p)} disabled={pending}>
                  Review
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {reviewing && (
        <PlayTogetherReviewModal
          request={reviewing}
          sport={sport}
          onClose={() => setReviewing(null)}
          onReview={(approve) => review(reviewing, approve)}
        />
      )}

      {/* Manage Payments — players who've submitted proof and need a
          verify/reject decision. This is the queue that actually decides
          group membership; approving a request above only opens the
          payment window, it never lands anyone here automatically. */}
      {paymentReviewRows.length > 0 && (
        <>
          <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>
            <ShieldCheck size={12} style={{ verticalAlign: -2 }} /> Payments to verify ({paymentReviewRows.length})
          </p>
          <div className="pt-players-list">
            {paymentReviewRows.map((p) => (
              <div key={p.id} className="pt-player-row">
                <div>
                  <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                  <div className="pt-player-sub">Rs {p.contribution_amount} · {p.transaction_id || "no txn id"}</div>
                </div>
                <button className="pt-collect-btn on" onClick={() => setReviewingPayment(p)} disabled={pending}>
                  Verify
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {reviewingPayment && (
        <PlayTogetherPaymentReviewModal
          request={reviewingPayment}
          sport={sport}
          onClose={() => setReviewingPayment(null)}
          onReview={(approve, rejectReason) => reviewPayment(reviewingPayment, approve, rejectReason)}
        />
      )}

      {awaitingPaymentRows.length > 0 && (
        <>
          <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>
            Awaiting payment ({awaitingPaymentRows.length})
          </p>
          <div className="pt-players-list">
            {awaitingPaymentRows.map((p) => (
              <div key={p.id} className="pt-player-row">
                <div>
                  <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                  <div className="pt-player-sub">
                    {p.status === "payment_rejected" ? "Payment rejected — may resubmit" : "Hasn't paid yet"}
                    {p.payment_deadline ? ` · due ${new Date(p.payment_deadline).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {historicalRows.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary className="hint" style={{ cursor: "pointer" }}>
            Expired / rejected ({historicalRows.length})
          </summary>
          <div className="pt-players-list" style={{ marginTop: 10 }}>
            {historicalRows.map((p) => (
              <div key={p.id} className="pt-player-row">
                <div>
                  <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                  <div className="pt-player-sub">
                    {p.status === "expired" ? "Payment window expired" : "Request rejected"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>Players ({rows.length})</p>
      {rows.length === 0 ? (
        <p className="hint">No one has been confirmed yet.</p>
      ) : (
        <div className="pt-players-list">
          {rows.map((p) => (
            <div key={p.id} className="pt-player-row">
              <div>
                <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                <div className="pt-player-sub">
                  Rs {p.contribution_amount} · {p.payment_method === "cash" ? "Cash at venue" : "Paid online"}
                </div>
              </div>
              <button
                className={`pt-collect-btn ${p.contribution_status === "collected" ? "on" : ""}`}
                onClick={() => toggle(p.id, p.contribution_status !== "collected")}
                disabled={pending}
              >
                {p.contribution_status === "collected" ? <><Check size={12} style={{ verticalAlign: -2 }} /> Collected</> : "Mark as Collected"}
              </button>
            </div>
          ))}
        </div>
      )}

      {gameStatus === "published" && (
        <div className="pt-danger-box">
          {!cancelling ? (
            <button className="pt-danger-btn" onClick={() => setCancelling(true)}>Cancel game</button>
          ) : (
            <>
              <p>
                Cancelling notifies every approved and pending player. Sportonica doesn&apos;t automatically
                refund your venue payment — any refund follows the venue&apos;s cancellation policy and must
                currently be handled by an admin.
              </p>
              <input
                className="bk-in" style={{ marginBottom: 10 }}
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
              />
              <div className="pt-danger-actions">
                <button className="pt-danger-btn" onClick={doCancel} disabled={pending}>
                  {pending ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button className="play-btn ghost" onClick={() => setCancelling(false)} disabled={pending}>Never mind</button>
              </div>
            </>
          )}
        </div>
      )}

      {toast && (
        <div className="pt-toast" role="status">
          <Check size={14} /> {toast}
        </div>
      )}
      <style>{`
        .pt-toast {
          position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          background: #14171E; color: #fff; border: 1px solid rgba(242,237,230,.14);
          border-radius: 999px; padding: 11px 18px; font-size: 13.5px; font-weight: 700;
          box-shadow: 0 16px 40px -12px rgba(0,0,0,.5); z-index: 700;
          animation: pt-toast-in .2s ease-out;
        }
        .pt-toast svg { color: #4ADE80; flex-shrink: 0; }
        [data-theme="paper"] .pt-toast { background: #14171E; color: #fff; }
        @keyframes pt-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
