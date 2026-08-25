"use client";

import { useState, useTransition } from "react";
import { Check, Clock, X as XIcon, Handshake } from "lucide-react";
import { respondToPartnership, type Partnership } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

type Row = Partnership & { organizer_name: string };

const STATUS_BADGE: Record<Partnership["status"], string> = {
  pending_invite: "warn", active: "ok", revoked: "danger",
};
const STATUS_LABEL: Record<Partnership["status"], string> = {
  pending_invite: "New invite", active: "Partnered", revoked: "Declined",
};
const STATUS_ICON: Record<Partnership["status"], React.ReactNode> = {
  pending_invite: <Clock size={12} />, active: <Check size={12} />, revoked: <XIcon size={12} />,
};

export default function PartnershipInvitesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function respond(id: string, status: "active" | "revoked", name: string, verb: string) {
    setErr(null);
    setConfirmMsg(null);
    startTransition(async () => {
      const res = await respondToPartnership(id, status);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
      setConfirmMsg(`${verb} ${name}.`);
      setTimeout(() => setConfirmMsg(null), 4000);
    });
  }

  function decline(id: string, name: string) {
    if (!window.confirm(`Decline ${name}'s invite? They won't be able to pick your venue for tournaments.`)) return;
    respond(id, "revoked", name, "Declined");
  }

  function revoke(id: string, name: string) {
    if (!window.confirm(`End your partnership with ${name}? They'll no longer be able to pick your venue for new tournaments — anything already scheduled is unaffected.`)) return;
    respond(id, "revoked", name, "Partnership ended with");
  }

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 12px" }}>
        <Handshake size={22} style={{ opacity: 0.35, marginBottom: 8 }} />
        <p style={{ fontSize: 13.5, opacity: 0.65, margin: 0 }}>
          No invites yet — when an organizer wants to host a tournament at your venue, their invite shows up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {err && <div role="alert" style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {confirmMsg && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
          <Check size={14} /> {confirmMsg}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--a-line, rgba(128,128,128,.25))", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.organizer_name}</div>
              <span className={`adm-badge ${STATUS_BADGE[r.status]}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {STATUS_ICON[r.status]} {STATUS_LABEL[r.status]}
              </span>
            </div>

            {r.status === "pending_invite" && (
              <>
                <p style={{ fontSize: 13, opacity: 0.7, margin: "8px 0 12px", lineHeight: 1.5 }}>
                  Accepting lets {r.organizer_name} pick your venue when they set up tournaments.
                  You still confirm or decline each individual tournament separately, from Venue bookings.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="adm-btn sm primary" disabled={pending} onClick={() => respond(r.id, "active", r.organizer_name, "Accepted")}>Accept</button>
                  <button className="adm-btn sm" disabled={pending} onClick={() => decline(r.id, r.organizer_name)}>Decline</button>
                </div>
              </>
            )}
            {r.status === "active" && (
              <>
                <p style={{ fontSize: 13, opacity: 0.7, margin: "8px 0 12px" }}>
                  {r.organizer_name} can pick your venue for new tournaments. You still confirm each one separately.
                </p>
                <button className="adm-btn sm danger" disabled={pending} onClick={() => revoke(r.id, r.organizer_name)}>End partnership</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
