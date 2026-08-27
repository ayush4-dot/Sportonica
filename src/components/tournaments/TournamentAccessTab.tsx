"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { findUserByEmail, grantTournamentManager, revokeTournamentManager } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { TournamentManager } from "@/lib/tournaments/types";

const inputStyle: React.CSSProperties = {
  padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

export default function TournamentAccessTab({ tournamentId, managers }: {
  tournamentId: string;
  managers: TournamentManager[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    if (!email.trim()) return;
    setErr(null);
    startTransition(async () => {
      const found = await findUserByEmail(email.trim());
      if (isActionError(found)) { setErr(found.message); return; }
      const res = await grantTournamentManager(tournamentId, found.id);
      if (isActionError(res)) { setErr(res.message); return; }
      setEmail("");
      router.refresh();
    });
  }

  function remove(userId: string, label: string) {
    if (!window.confirm(`Remove ${label}'s access to this tournament? They'll lose the ability to manage it immediately.`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await revokeTournamentManager(tournamentId, userId);
      if (isActionError(res)) { setErr(res.message); return; }
      router.refresh();
    });
  }

  return (
    <div className="tc-card">
      <div className="tc-card-t">Owner access</div>
      <div className="tc-card-sub">
        Give someone full control of this tournament — same as you have here — without making them a platform-wide Organizer.
        They can manage teams, fixtures, results, announcements, and settings, but only for this tournament.
      </div>

      <div style={{ display: "flex", gap: 8, margin: "14px 0 20px", flexWrap: "wrap" }}>
        <input
          value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Their account email" type="email"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <button className="tc-btn primary" disabled={pending || !email.trim()} onClick={add}>
          <UserPlus size={14} /> Give access
        </button>
      </div>
      {err && <div className="tc-err" style={{ marginBottom: 16 }}>{err}</div>}

      {managers.length === 0 ? (
        <div className="tc-empty">No one else has access yet — just you.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {managers.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "10px 12px", borderRadius: 10, background: "rgba(242,237,230,0.04)",
                border: "1px solid rgba(242,237,230,0.1)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.full_name || "Unnamed"}</div>
                <div className="tc-dim" style={{ fontSize: 12 }}>{m.email}</div>
              </div>
              <button
                aria-label={`Remove ${m.email}`} disabled={pending}
                onClick={() => remove(m.user_id, m.full_name || m.email)}
                style={{ background: "none", border: "none", color: "#ef4444", opacity: 0.75, cursor: "pointer", padding: 6, display: "flex" }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
