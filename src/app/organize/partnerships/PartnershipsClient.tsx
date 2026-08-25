"use client";

import { useState, useTransition } from "react";
import { Check, Search, Clock, X as XIcon, Handshake } from "lucide-react";
import { searchVenuesToPartner, sendPartnershipInvite, type Partnership } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

type Row = Partnership & { vendor_name: string };

// Plain words a person would say out loud — never the raw DB status.
const STATUS_BADGE: Record<Partnership["status"], string> = {
  pending_invite: "warn", active: "ok", revoked: "danger",
};
const STATUS_LABEL: Record<Partnership["status"], string> = {
  pending_invite: "Waiting for reply", active: "Confirmed", revoked: "Declined",
};
const STATUS_ICON: Record<Partnership["status"], React.ReactNode> = {
  pending_invite: <Clock size={12} />, active: <Check size={12} />, revoked: <XIcon size={12} />,
};

export default function PartnershipsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; address: string | null; owner_id: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function search(value: string) {
    setQ(value);
    setErr(null);
    if (value.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    searchVenuesToPartner(value)
      .then((res) => setResults(isActionError(res) ? [] : res))
      .finally(() => setSearching(false));
  }

  function invite(vendorId: string, venueName: string) {
    setErr(null);
    setConfirmMsg(null);
    startTransition(async () => {
      const res = await sendPartnershipInvite(vendorId);
      if (isActionError(res)) { setErr(res.message); return; }
      setRows((r) => [{ ...res, vendor_name: results.find((v) => v.owner_id === vendorId)?.name ?? "—" }, ...r]);
      setConfirmMsg(`Invite sent to ${venueName}.`);
      setTimeout(() => setConfirmMsg(null), 4000);
    });
  }

  const alreadyPartnered = new Set(rows.map((r) => r.vendor_id));

  return (
    <div>
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-t">Find a venue</div>
        <div className="adm-card-sub" style={{ marginBottom: 12 }}>Search by venue name, then send an invite to its owner.</div>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} aria-hidden="true" />
          <input
            value={q} onChange={(e) => search(e.target.value)} placeholder="e.g. Everest Futsal Arena"
            className="adm-input" style={{ paddingLeft: 36, width: "100%", boxSizing: "border-box" }}
            aria-label="Search venues by name"
          />
        </div>
        {err && <div role="alert" style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{err}</div>}
        {confirmMsg && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontSize: 13, fontWeight: 600, marginTop: 10 }}>
            <Check size={14} /> {confirmMsg}
          </div>
        )}
        <div aria-live="polite">
          {searching && <p style={{ fontSize: 13, opacity: 0.6, marginTop: 10 }}>Searching…</p>}
          {!searching && q.trim().length >= 2 && results.length === 0 && (
            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 10 }}>No venue matches &quot;{q}&quot; — try a different name.</p>
          )}
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((v) => {
              const already = alreadyPartnered.has(v.owner_id);
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid var(--a-line, rgba(128,128,128,.25))", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.name}</div>
                    {v.address && <div style={{ fontSize: 12, opacity: 0.6 }}>{v.address}</div>}
                  </div>
                  <button className="adm-btn sm" disabled={pending || already} onClick={() => invite(v.owner_id, v.name)}>
                    {already ? <><Check size={13} /> Invited</> : "Invite"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-card-t">Your venues</div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <Handshake size={22} style={{ opacity: 0.35, marginBottom: 8 }} />
            <p style={{ fontSize: 13.5, opacity: 0.65, margin: 0 }}>
              No venues yet — search above and send your first invite.
            </p>
          </div>
        ) : (
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Venue owner</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.vendor_name}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[r.status]}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {STATUS_ICON[r.status]} {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
