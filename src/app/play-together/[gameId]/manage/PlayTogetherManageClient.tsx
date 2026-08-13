"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { markContributionCollected, cancelGame, approveJoinRequest } from "@/lib/playTogether/actions";
import type { GamePlayerWithProfile } from "@/lib/playTogether/queries";
import type { GameStatus } from "@/lib/playTogether/types";

export default function PlayTogetherManageClient({
  gameId, players, requests, gameStatus,
}: {
  gameId: string;
  players: GamePlayerWithProfile[];
  requests: GamePlayerWithProfile[];
  gameStatus: GameStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(players);
  const [pendingRows, setPendingRows] = useState(requests);
  const [err, setErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  function toggle(playerId: string, collected: boolean) {
    setErr(null);
    startTransition(async () => {
      try {
        await markContributionCollected(playerId, gameId, collected);
        setRows((rs) => rs.map((r) => r.id === playerId
          ? { ...r, contribution_status: collected ? "collected" : "pending", collected_at: collected ? new Date().toISOString() : null }
          : r));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not update this player.");
      }
    });
  }

  function review(row: GamePlayerWithProfile, approve: boolean) {
    setErr(null);
    startTransition(async () => {
      try {
        await approveJoinRequest(row.id, gameId, approve);
        setPendingRows((rs) => rs.filter((r) => r.id !== row.id));
        if (approve) setRows((rs) => [...rs, { ...row, status: "joined" }]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not review this request.");
      }
    });
  }

  function doCancel() {
    setErr(null);
    startTransition(async () => {
      try {
        await cancelGame(gameId, reason);
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="pt-collect-btn on" onClick={() => review(p, true)} disabled={pending}>
                    <Check size={12} style={{ verticalAlign: -2 }} /> Approve
                  </button>
                  <button className="pt-collect-btn" onClick={() => review(p, false)} disabled={pending}>
                    <X size={12} style={{ verticalAlign: -2 }} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>Players ({rows.length})</p>
      {rows.length === 0 ? (
        <p className="hint">No one has been approved yet.</p>
      ) : (
        <div className="pt-players-list">
          {rows.map((p) => (
            <div key={p.id} className="pt-player-row">
              <div>
                <div className="pt-player-name">{p.profiles?.full_name ?? p.profiles?.name ?? "Player"}</div>
                <div className="pt-player-sub">Rs {p.contribution_amount}</div>
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
                Cancelling notifies every approved and pending player. Khelam Na doesn&apos;t automatically
                refund your venue payment — any refund follows the venue&apos;s cancellation policy and must
                currently be handled by an admin.
              </p>
              <input
                className="bk-in" style={{ marginBottom: 10 }}
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pt-danger-btn" onClick={doCancel} disabled={pending}>
                  {pending ? "Cancelling…" : "Confirm cancellation"}
                </button>
                <button className="play-btn ghost" onClick={() => setCancelling(false)} disabled={pending}>Never mind</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
