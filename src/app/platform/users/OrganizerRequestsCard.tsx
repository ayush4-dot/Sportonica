"use client";

import { useState, useTransition } from "react";
import { Check, UserCheck } from "lucide-react";
import { approveOrganizerRequest } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

export default function OrganizerRequestsCard({ initial }: { initial: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function respond(id: string, name: string, approve: boolean) {
    setErr(null);
    setConfirmMsg(null);
    startTransition(async () => {
      const res = await approveOrganizerRequest(id, approve);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((rs) => rs.filter((r) => r.id !== id));
      setConfirmMsg(approve ? `Approved ${name} as an organizer.` : `Declined ${name}'s request.`);
      setTimeout(() => setConfirmMsg(null), 4000);
    });
  }

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="plt-sec-t" style={{ marginBottom: 4 }}>Organizer requests</div>
      <p style={{ fontSize: 13, opacity: 0.65, margin: "0 0 14px" }}>
        People asking to run their own tournaments — approve to let them invite venues (or use
        their own) and start creating tournaments.
      </p>
      {err && <div role="alert" style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {confirmMsg && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          <Check size={14} /> {confirmMsg}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13.5 }}>
              <UserCheck size={15} style={{ opacity: 0.6 }} /> {r.name}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="dt-btn ok" disabled={pending} onClick={() => respond(r.id, r.name, true)}>Approve</button>
              <button className="dt-btn" disabled={pending} onClick={() => respond(r.id, r.name, false)}>Decline</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
