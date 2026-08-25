"use client";

import { useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { searchVenuesToPartner, sendPartnershipInvite, type Partnership } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

type Row = Partnership & { vendor_name: string };
const STATUS_BADGE: Record<Partnership["status"], string> = {
  pending_invite: "warn", active: "ok", revoked: "danger",
};
const STATUS_LABEL: Record<Partnership["status"], string> = {
  pending_invite: "Invite sent — awaiting response", active: "Active", revoked: "Revoked",
};

export default function PartnershipsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; address: string | null; owner_id: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [invited, setInvited] = useState<Set<string>>(new Set());
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

  function invite(vendorId: string) {
    setErr(null);
    startTransition(async () => {
      const res = await sendPartnershipInvite(vendorId);
      if (isActionError(res)) { setErr(res.message); return; }
      setInvited((s) => new Set(s).add(vendorId));
      setRows((r) => [{ ...res, vendor_name: results.find((v) => v.owner_id === vendorId)?.name ?? "—" }, ...r]);
    });
  }

  const alreadyPartnered = new Set(rows.map((r) => r.vendor_id));

  return (
    <div>
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-t">Find a venue</div>
        <div className="adm-card-sub" style={{ marginBottom: 12 }}>Search by venue name, then send a partnership invite to its owner.</div>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} />
          <input
            value={q} onChange={(e) => search(e.target.value)} placeholder="e.g. Everest Futsal Arena"
            className="adm-input" style={{ paddingLeft: 36, width: "100%", boxSizing: "border-box" }}
          />
        </div>
        {err && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{err}</div>}
        {searching && <p style={{ fontSize: 13, opacity: 0.6, marginTop: 10 }}>Searching…</p>}
        {results.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((v) => {
              const already = alreadyPartnered.has(v.owner_id) || invited.has(v.owner_id);
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1px solid var(--a-line, rgba(128,128,128,.25))", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.name}</div>
                    {v.address && <div style={{ fontSize: 12, opacity: 0.6 }}>{v.address}</div>}
                  </div>
                  <button className="adm-btn sm" disabled={pending || already} onClick={() => invite(v.owner_id)}>
                    {already ? <><Check size={13} /> Invited</> : "Invite"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-card-t">Your partnerships</div>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13.5, opacity: 0.6, marginTop: 10 }}>No invites sent yet.</p>
        ) : (
          <table className="adm-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Venue owner</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.vendor_name}</td>
                  <td><span className={`adm-badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
