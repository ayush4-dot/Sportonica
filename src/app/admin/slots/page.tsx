"use client";

import { useState } from "react";
import { useVenue, useSlots } from "@/lib/hooks/useAdminData";
import { Plus, Lock, Trash2, RefreshCw, CalendarDays, Loader2, AlertCircle } from "lucide-react";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

const SPORTS = ["Futsal","Basketball","Cricket","Volleyball","Badminton","Tennis"];
const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const statusColor: Record<string, string> = { open: turf, blocked: "#ef4444", booked: "#60a5fa" };
const statusBadge: Record<string, string> = { open: "adm-badge adm-badge-green", blocked: "adm-badge adm-badge-red", booked: "adm-badge adm-badge-blue" };

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SlotsPage() {
  const { venue, loading: vLoading } = useVenue();
  const { slots, loading: sLoading, addSlot, updateSlot, deleteSlot } = useSlots(venue?.id ?? null);

  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"list"|"grid">("list");  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [focusField, setFF] = useState<string | null>(null);
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [form, setForm] = useState({
    court_number: "Court 1", sport: "Futsal",
    date: new Date().toISOString().slice(0, 10),
    start: "06:00", end: "07:00",
    price: "120", recurring: false,
  });

  const loading = vLoading || sLoading;

  const inp = (f: string): React.CSSProperties => ({
    width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)",
    border: `1.5px solid ${focusField === f ? pink : "rgba(255,255,255,0.08)"}`,
    borderRadius: "10px", color: paper, fontSize: "14px", fontFamily: "'Inter',sans-serif",
    outline: "none", boxSizing: "border-box" as const, transition: "border-color 0.15s",
  });

  const handleAdd = async () => {
    if (!venue) return;
    setSubmitting(true); setFormErr(null);
    const start_time = new Date(`${form.date}T${form.start}`).toISOString();
    const end_time   = new Date(`${form.date}T${form.end}`).toISOString();
    const { error } = await addSlot({
      venue_id: venue.id, court_number: form.court_number,
      sport: form.sport, start_time, end_time,
      price: Number(form.price), status: "open",
      recurring: form.recurring, recurring_days: recurDays,
    });
    setSubmitting(false);
    if (error) { setFormErr(error); return; }
    setShowForm(false);
    setForm(p => ({ ...p, start: "06:00", end: "07:00" }));
    setRecurDays([]);
  };

  const toggleBlock = async (id: string, current: "open"|"booked"|"blocked") => {
    await updateSlot(id, { status: current === "blocked" ? "open" : "blocked" });
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading slots…
    </div>
  );

  if (!venue) return (
    <div style={{ textAlign: "center", padding: "40px", color: slate }}>
      <p>Set up your venue first. <a href="/admin/venue" style={{ color: pink }}>Go to Venue →</a></p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Slot Management</h1>
          <p className="adm-page-sub">{slots.length} slot{slots.length !== 1 ? "s" : ""} configured</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ display: "flex", background: inkMid, borderRadius: "8px", padding: "3px", border: "1px solid rgba(255,255,255,0.07)" }}>
            {(["list","grid"] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{ padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700, fontFamily: "'Inter',sans-serif", background: viewMode === v ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === v ? paper : slate }}>
                {v === "grid" ? "Calendar" : "List"}
              </button>
            ))}
          </div>
          <button className="adm-btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> New Slot</button>
        </div>
      </div>      {/* Add slot form */}
      {showForm && (
        <div className="adm-card" style={{ padding: "24px", animation: "slideUp 0.25s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper, display: "flex", alignItems: "center", gap: "8px" }}><CalendarDays size={16} color={flood} /> Create Slot</span>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: slate, fontSize: "20px" }}>×</button>
          </div>
          {formErr && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "8px 12px", marginBottom: "14px" }}>
              <AlertCircle size={13} color="#ef4444" /><span style={{ fontSize: "12px", color: "#ef4444" }}>{formErr}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <label className="adm-label">Court</label>
              <select className="adm-select" value={form.court_number} onChange={e => setForm(p => ({ ...p, court_number: e.target.value }))}>
                <option>Court 1</option><option>Court 2</option><option>Court 3</option>
              </select>
            </div>
            <div>
              <label className="adm-label">Sport</label>
              <select className="adm-select" value={form.sport} onChange={e => setForm(p => ({ ...p, sport: e.target.value }))}>
                {SPORTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-label">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp("date")} onFocus={() => setFF("date")} onBlur={() => setFF(null)} />
            </div>
            <div>
              <label className="adm-label">Start time</label>
              <input type="time" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))} style={inp("start")} onFocus={() => setFF("start")} onBlur={() => setFF(null)} />
            </div>
            <div>
              <label className="adm-label">End time</label>
              <input type="time" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))} style={inp("end")} onFocus={() => setFF("end")} onBlur={() => setFF(null)} />
            </div>
            <div>
              <label className="adm-label">Price (Rs.)</label>
              <input type="number" min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} style={inp("price")} onFocus={() => setFF("price")} onBlur={() => setFF(null)} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <button onClick={() => setForm(p => ({ ...p, recurring: !p.recurring }))} className={`adm-toggle${form.recurring ? " on" : ""}`} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: paper }}>Recurring slot</div>
              <div style={{ fontSize: "11px", color: slate }}>Repeats weekly</div>
            </div>
          </div>
          {form.recurring && (
            <div style={{ marginBottom: "16px" }}>
              <label className="adm-label">Repeat on</label>
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                {DAYS_SHORT.map((d, i) => (
                  <button key={d} onClick={() => setRecurDays(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])} style={{ width: "36px", height: "36px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", fontFamily: "'Inter',sans-serif", background: recurDays.includes(i) ? "rgba(222,49,99,0.18)" : inkMid, color: recurDays.includes(i) ? pink : slate, outline: recurDays.includes(i) ? `1.5px solid ${pink}` : "1.5px solid rgba(255,255,255,0.08)" }}>
                    {d[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button className="adm-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="adm-btn-primary" onClick={handleAdd} disabled={submitting}>
              {submitting ? <Loader2 size={14} style={{ animation: "spin-slow 1s linear infinite" }} /> : <Plus size={14} />}
              {submitting ? "Adding…" : "Add Slot"}
            </button>
          </div>
        </div>
      )}

      {slots.length === 0 && !showForm ? (
        <div style={{ textAlign: "center", padding: "48px 24px", background: inkMid, borderRadius: "16px", border: "1.5px dashed rgba(255,255,255,0.08)" }}>
          <CalendarDays size={32} color={slate} style={{ margin: "0 auto 12px", display: "block" }} />
          <p style={{ color: paper, fontWeight: 700, marginBottom: "6px" }}>No slots yet</p>
          <p style={{ color: slate, fontSize: "13px", marginBottom: "20px" }}>Create your first time slot to start accepting bookings.</p>
          <button className="adm-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Create first slot</button>
        </div>
      ) : (
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <table className="adm-table">
            <thead>
              <tr><th>Court</th><th>Date</th><th>Time</th><th>Sport</th><th>Price</th><th>Recurring</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot.id}>
                  <td style={{ fontWeight: 600 }}>{slot.court_number}</td>
                  <td style={{ color: slate, fontSize: "12px" }}>{new Date(slot.start_time).toLocaleDateString()}</td>
                  <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: flood }}>{fmt(slot.start_time)}–{fmt(slot.end_time)}</span></td>
                  <td>{slot.sport}</td>
                  <td style={{ color: turf, fontWeight: 600 }}>Rs. {slot.price}</td>
                  <td>{slot.recurring ? <span style={{ color: turf, display: "flex", alignItems: "center", gap: "4px" }}><RefreshCw size={11} />Yes</span> : <span style={{ color: slate }}>One-time</span>}</td>
                  <td><span className={statusBadge[slot.status]}>{slot.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => toggleBlock(slot.id, slot.status)} title={slot.status === "blocked" ? "Unblock" : "Block"} style={{ background: slot.status === "blocked" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${slot.status === "blocked" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, borderRadius: "6px", padding: "4px 8px", cursor: "pointer", color: slot.status === "blocked" ? "#22c55e" : "#ef4444", display: "flex" }}>
                        <Lock size={11} />
                      </button>
                      <button onClick={() => deleteSlot(slot.id)} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", color: "#ef4444", display: "flex" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" as const }}>
        {Object.entries({ open: "Available", booked: "Booked", blocked: "Blocked" }).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: slate }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: statusColor[k] }} />{v}
          </div>
        ))}
      </div>
    </div>
  );
}
