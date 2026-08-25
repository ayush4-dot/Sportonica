"use client";

import { useState, useTransition } from "react";
import { respondToPartnership, type Partnership } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

type Row = Partnership & { organizer_name: string };

export default function PartnershipInvitesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function respond(id: string, status: "active" | "revoked") {
    setErr(null);
    startTransition(async () => {
      const res = await respondToPartnership(id, status);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    });
  }

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, opacity: 0.6 }}>No partnership invites yet.</p>;
  }

  return (
    <div>
      {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <table className="adm-table">
        <thead><tr><th>Organizer</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.organizer_name}</td>
              <td>
                <span className={`adm-badge ${r.status === "active" ? "ok" : r.status === "revoked" ? "danger" : "warn"}`}>
                  {r.status === "pending_invite" ? "Wants to partner" : r.status === "active" ? "Active" : "Declined"}
                </span>
              </td>
              <td>
                {r.status === "pending_invite" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="adm-btn sm primary" disabled={pending} onClick={() => respond(r.id, "active")}>Accept</button>
                    <button className="adm-btn sm" disabled={pending} onClick={() => respond(r.id, "revoked")}>Decline</button>
                  </div>
                )}
                {r.status === "active" && (
                  <button className="adm-btn sm danger" disabled={pending} onClick={() => respond(r.id, "revoked")}>Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
