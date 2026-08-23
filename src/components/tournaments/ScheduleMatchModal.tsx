"use client";

import { useState } from "react";
import { X } from "lucide-react";
import SlotPicker from "@/app/(play)/create/[id]/SlotPicker";
import { scheduleMatch } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { TournamentMatch } from "@/lib/tournaments/types";

const KTM_TZ = "Asia/Kathmandu";
// Same fixed +05:45 (no DST) conversion as BookingFlow.tsx's ktmIso(), in
// minutes-from-midnight form to match getDaySlots()'s Slot.mins.
function ktmIso(dateStr: string, mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:45`;
}
function todayKtm() {
  return new Date().toLocaleDateString("en-CA", { timeZone: KTM_TZ });
}

const inputStyle: React.CSSProperties = {
  padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

export default function ScheduleMatchModal({
  match, courts, durationMins, onClose, onScheduled,
}: {
  match: TournamentMatch;
  courts: { id: string; name: string }[];
  durationMins: number;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(todayKtm());
  const [mins, setMins] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!courtId || mins == null) return;
    setSaving(true);
    setErr(null);
    const res = await scheduleMatch(match.id, courtId, ktmIso(dateStr, mins), ktmIso(dateStr, mins + durationMins));
    setSaving(false);
    if (isActionError(res)) { setErr(res.message); return; }
    onScheduled();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
      onClick={onClose}
    >
      <div className="tc-card" style={{ maxWidth: 480, width: "100%", margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="tc-card-t">Schedule — {match.round_label}</div>
          <button onClick={onClose} className="tc-btn" style={{ padding: 6 }}><X size={14} /></button>
        </div>

        <div style={{ display: "flex", gap: 10, margin: "14px 0 16px", flexWrap: "wrap" }}>
          <select value={courtId} onChange={(e) => { setCourtId(e.target.value); setMins(null); }} style={{ ...inputStyle, flex: 1, minWidth: 140 }}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={dateStr} min={todayKtm()} onChange={(e) => { setDateStr(e.target.value); setMins(null); }} style={inputStyle} />
        </div>

        {courtId ? (
          <SlotPicker courtId={courtId} dateStr={dateStr} durationMins={durationMins} value={mins} onPick={setMins} />
        ) : (
          <div className="tc-empty">Add a court to this venue first.</div>
        )}

        {err && <div className="tc-err" style={{ marginTop: 12 }}>{err}</div>}
        <button
          className="tc-btn primary" disabled={saving || !courtId || mins == null} onClick={save}
          style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
        >
          {saving ? "Scheduling…" : "Confirm slot"}
        </button>
      </div>
    </div>
  );
}
