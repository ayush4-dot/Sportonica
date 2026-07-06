"use client";

import { useState, useEffect } from "react";
import { useVenue, useFlashMatches } from "@/lib/hooks/useAdminData";
import { Zap, Clock, Users, ArrowRight, CheckCircle2, XCircle, Plus, Flame, Loader2, AlertCircle } from "lucide-react";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

const SPORTS  = ["Futsal","Basketball","Cricket","Volleyball","Badminton","Tennis"];
const COURTS  = ["Court 1","Court 2","Court 3"];
const URGENCY = [15, 30, 45, 60, 90, 120];

function CountdownTimer({ endsAt }: { endsAt: Date }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, endsAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const total = endsAt.getTime() - (endsAt.getTime() - remaining);
  const mins  = Math.floor(remaining / 60000);
  const secs  = Math.floor((remaining % 60000) / 1000);
  const color = mins < 10 ? pink : mins < 20 ? flood : turf;
  // Progress is how much time has passed
  const urgencyMs = endsAt.getTime() - Date.now() + remaining; // ≈ remaining on first render
  void urgencyMs;
  const pct = remaining <= 0 ? 100 : 0;
  void pct;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Clock size={13} color={color} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "18px", fontWeight: 900, color }}>
          {remaining <= 0 ? "Expired" : `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`}
        </span>
      </div>
    </div>
  );
}

export default function FlashPage() {
  const { venue, loading: vLoading } = useVenue();
  const { flashes, loading: fLoading, publish, cancel } = useFlashMatches(venue?.id ?? null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [focusField, setFF] = useState<string | null>(null);
  const [form, setForm] = useState({
    sport: "Futsal", court: "Court 1",
    date: new Date().toISOString().slice(0, 10),
    time: "19:00", urgencyMin: 45, slotsNeeded: 4,
  });

  const loading = vLoading || fLoading;

  const inp = (f: string): React.CSSProperties => ({
    width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)",
    border: `1.5px solid ${focusField === f ? pink : "rgba(255,255,255,0.08)"}`,
    borderRadius: "10px", color: paper, fontSize: "14px", fontFamily: "'Inter',sans-serif",
    outline: "none", boxSizing: "border-box" as const,
  });

  const handlePublish = async () => {
    if (!venue) return;
    setSubmitting(true); setFormErr(null);
    const match_time = new Date(`${form.date}T${form.time}`).toISOString();
    const { error } = await publish({
      venue_id: venue.id, slot_id: null,
      sport: form.sport, court: form.court,
      match_time, urgency_min: form.urgencyMin,
      slots_needed: form.slotsNeeded, status: "active",
    });
    setSubmitting(false);
    if (error) { setFormErr(error); return; }
    setShowForm(false);
  };

  const active = flashes.filter(f => f.status === "active");
  const past   = flashes.filter(f => f.status !== "active");

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading flash matches…
    </div>
  );

  if (!venue) return <p style={{ color: slate, padding: "20px" }}>Set up your venue first. <a href="/admin/venue" style={{ color: pink }}>Go to Venue →</a></p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Flash Match</h1>
          <p className="adm-page-sub">Publish urgent matches for slots filling slowly.</p>
        </div>
        <button className="adm-btn-primary" onClick={() => setShowForm(true)} style={{ background: "#E85D24", boxShadow: "0 4px 16px rgba(232,93,36,0.4)" }}>
          <Zap size={15} fill="#fff" /> New Flash Match
        </button>
      </div>

      {/* How it works */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
        {[
          { step: "01", title: "Pick a slow slot",  desc: "Choose a time slot that's less than 60% filled.", icon: Clock, color: flood  },
          { step: "02", title: "Set urgency timer", desc: "Players see a live countdown — urgency drives bookings.", icon: Zap, color: pink   },
          { step: "03", title: "Watch it fill up",  desc: "Flash matches appear first on the Discover page.", icon: Flame, color: turf   },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.step} style={{ background: inkMid, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{s.step}</span>
                <Icon size={14} color={s.color} />
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: paper, marginBottom: "4px" }}>{s.title}</div>
              <div style={{ fontSize: "12px", color: slate, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="adm-card" style={{ padding: "24px", border: "1.5px solid rgba(232,93,36,0.3)", animation: "slideUp 0.25s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(232,93,36,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={15} color="#E85D24" fill="#E85D24" />
              </div>
              <span style={{ fontWeight: 800, fontSize: "16px", color: "#E85D24", fontFamily: "'Bricolage Grotesque',sans-serif" }}>Publish Flash Match</span>
            </div>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: slate, fontSize: "20px" }}>×</button>
          </div>

          {formErr && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "8px 12px", marginBottom: "14px" }}>
              <AlertCircle size={13} color="#ef4444" /><span style={{ fontSize: "12px", color: "#ef4444" }}>{formErr}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
            <div>
              <label className="adm-label">Sport</label>
              <select className="adm-select" value={form.sport} onChange={e => setForm(p => ({ ...p, sport: e.target.value }))}>
                {SPORTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-label">Court</label>
              <select className="adm-select" value={form.court} onChange={e => setForm(p => ({ ...p, court: e.target.value }))}>
                {COURTS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-label">Match time</label>
              <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} style={inp("time")} onFocus={() => setFF("time")} onBlur={() => setFF(null)} />
            </div>
            <div>
              <label className="adm-label">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp("date")} onFocus={() => setFF("date")} onBlur={() => setFF(null)} />
            </div>
            <div>
              <label className="adm-label">Slots needed</label>
              <input type="number" min={1} max={20} value={form.slotsNeeded} onChange={e => setForm(p => ({ ...p, slotsNeeded: Number(e.target.value) }))} style={inp("slots")} onFocus={() => setFF("slots")} onBlur={() => setFF(null)} />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label className="adm-label">Urgency timer</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const, marginTop: "6px" }}>
              {URGENCY.map(min => (
                <button key={min} onClick={() => setForm(p => ({ ...p, urgencyMin: min }))} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", fontFamily: "'JetBrains Mono',monospace", background: form.urgencyMin === min ? "rgba(232,93,36,0.2)" : "rgba(255,255,255,0.05)", color: form.urgencyMin === min ? "#E85D24" : slate, outline: form.urgencyMin === min ? "1.5px solid #E85D24" : "1.5px solid transparent" }}>
                  {min}m
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button className="adm-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button onClick={handlePublish} disabled={submitting} style={{ background: "#E85D24", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: submitting ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'Inter',sans-serif", boxShadow: "0 4px 16px rgba(232,93,36,0.4)", opacity: submitting ? 0.8 : 1 }}>
              {submitting ? <Loader2 size={14} style={{ animation: "spin-slow 1s linear infinite" }} /> : <Zap size={14} fill="#fff" />}
              {submitting ? "Publishing…" : "Publish now"}
            </button>
          </div>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#E85D24", animation: "pulseScale 1.2s ease-in-out infinite" }} />
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#E85D24" }}>ACTIVE FLASH MATCHES</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {active.map(f => {
              const endsAt = new Date(new Date(f.created_at).getTime() + f.urgency_min * 60000);
              const fillPct = f.slots_needed > 0 ? (f.slots_filled / f.slots_needed) * 100 : 0;
              return (
                <div key={f.id} className="adm-card" style={{ padding: "20px", border: "1.5px solid rgba(232,93,36,0.3)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "20px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <Zap size={14} color="#E85D24" fill="#E85D24" />
                        <span style={{ fontWeight: 700, fontSize: "16px", color: paper }}>{f.sport}</span>
                        <span style={{ fontSize: "12px", color: slate }}>— {f.court} — {new Date(f.match_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ height: "6px", width: "200px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${fillPct}%`, background: "#E85D24", borderRadius: "3px", transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: paper, fontFamily: "'JetBrains Mono',monospace" }}>{f.slots_filled}/{f.slots_needed}</span>
                      </div>
                    </div>
                    <CountdownTimer endsAt={endsAt} />
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Users size={13} color={slate} />
                      <span style={{ fontSize: "13px", color: slate }}>{f.slots_needed - f.slots_filled} needed</span>
                    </div>
                    <button onClick={() => cancel(f.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", color: "#ef4444", fontSize: "12px", fontWeight: 700, fontFamily: "'Inter',sans-serif", display: "flex", alignItems: "center", gap: "4px" }}>
                      <XCircle size={12} /> Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {active.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "48px 24px", background: inkMid, borderRadius: "16px", border: "1.5px dashed rgba(255,255,255,0.08)" }}>
          <Zap size={32} color={slate} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: "16px", fontWeight: 700, color: paper, marginBottom: "6px" }}>No active flash matches</div>
          <div style={{ fontSize: "13px", color: slate, marginBottom: "20px" }}>Slots filling slowly? Publish a flash match to fill them fast.</div>
          <button onClick={() => setShowForm(true)} className="adm-btn-primary" style={{ background: "#E85D24", boxShadow: "0 4px 16px rgba(232,93,36,0.35)" }}>
            <Plus size={14} /> Create flash match
          </button>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: "13px", color: slate, marginBottom: "12px", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Past Flash Matches</div>
          <div className="adm-card" style={{ overflow: "hidden" }}>
            <table className="adm-table">
              <thead>
                <tr><th>Sport</th><th>Court</th><th>Match Time</th><th>Timer</th><th>Filled</th><th>Status</th></tr>
              </thead>
              <tbody>
                {past.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.sport}</td>
                    <td style={{ color: slate }}>{f.court}</td>
                    <td style={{ color: flood }}>{new Date(f.match_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>{f.urgency_min}m</span></td>
                    <td>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>{f.slots_filled}/{f.slots_needed}</span>
                      {f.slots_filled >= f.slots_needed && <CheckCircle2 size={12} color={turf} style={{ marginLeft: "4px" }} />}
                    </td>
                    <td><span className={f.status === "expired" ? "adm-badge adm-badge-slate" : "adm-badge adm-badge-red"}>{f.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "rgba(255,201,60,0.07)", border: "1px solid rgba(255,201,60,0.15)", borderRadius: "10px" }}>
        <ArrowRight size={13} color={flood} />
        <span style={{ fontSize: "12px", color: slate }}>Flash matches appear at the top of the Discover page and notify nearby players instantly.</span>
      </div>

    </div>
  );
}
