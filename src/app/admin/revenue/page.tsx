"use client";

import { useState } from "react";
import { useVenue, useRevenue } from "@/lib/hooks/useAdminData";
import { DollarSign, TrendingUp, ArrowUpRight, Download, CreditCard, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const flood  = "#FFC93C";
const turf   = "#2E7D5B";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

const PERIODS = [{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }];

function BarChart({ data, color }: { data: { date: string; net: number }[]; color: string }) {
  if (data.length === 0) return <div style={{ height: "140px", display: "flex", alignItems: "center", justifyContent: "center", color: slate, fontSize: "13px" }}>No revenue data yet.</div>;
  const max = Math.max(...data.map(d => d.net), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "140px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
            <div title={`Rs. ${d.net.toFixed(0)}`} style={{ width: "100%", borderRadius: "4px 4px 0 0", height: `${(d.net / max) * 100}%`, background: i === data.length - 1 ? color : `${color}66`, minHeight: "4px", transition: "height 0.4s ease" }} />
          </div>
          <span style={{ fontSize: "9px", color: slate, transform: "rotate(-40deg)", transformOrigin: "center", whiteSpace: "nowrap" as const }}>
            {new Date(d.date).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RevenuePage() {
  const { venue, loading: vLoading } = useVenue();
  const [periodDays, setPeriodDays] = useState(30);
  const { rows, loading: rLoading, payout, savePayout } = useRevenue(venue?.id ?? null, periodDays);

  const [payoutMethod, setPayoutMethod] = useState<"khalti"|"esewa">(payout?.method ?? "khalti");
  const [account, setAccount] = useState(payout?.account ?? "");
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);
  const [payoutErr, setPayoutErr] = useState<string|null>(null);
  const [focusField, setFF] = useState<string|null>(null);

  const loading = vLoading || rLoading;

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalNet   = rows.reduce((s, r) => s + r.net,   0);
  const totalCut   = totalGross - totalNet;
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  const handleSavePayout = async () => {
    setSavingPayout(true); setPayoutErr(null);
    const result = await savePayout(payoutMethod, account);
    setSavingPayout(false);
    if (result?.error) { setPayoutErr(result.error); return; }
    setPayoutSaved(true);
    setTimeout(() => setPayoutSaved(false), 2500);
  };

  const inp = (f: string): React.CSSProperties => ({
    width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)",
    border: `1.5px solid ${focusField === f ? pink : "rgba(255,255,255,0.08)"}`,
    borderRadius: "10px", color: paper, fontSize: "14px", fontFamily: "'Inter',sans-serif",
    outline: "none", boxSizing: "border-box" as const,
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading revenue…
    </div>
  );

  if (!venue) return <p style={{ color: slate, padding: "20px" }}>Set up your venue first. <a href="/admin/venue" style={{ color: pink }}>Go to Venue →</a></p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Revenue</h1>
          <p className="adm-page-sub">Earnings and payout setup for {venue.name}.</p>
        </div>
        <button className="adm-btn-secondary"><Download size={14} /> Export CSV</button>
      </div>

      {/* Stat cards */}
      <div className="adm-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px" }}>
        {[
          { label: "Gross revenue",  value: `Rs. ${totalGross.toLocaleString()}`, color: turf,     icon: DollarSign  },
          { label: "Platform cut",   value: `Rs. ${totalCut.toLocaleString()}`,   color: slate,    icon: CreditCard  },
          { label: "Net payout",     value: `Rs. ${totalNet.toLocaleString()}`,   color: "#60a5fa",icon: ArrowUpRight },
          { label: "Total bookings", value: String(totalCount),                   color: flood,    icon: TrendingUp  },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="adm-stat-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} color={s.color} />
                </div>
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: paper, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-0.5px", marginBottom: "4px" }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: slate }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Revenue chart */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={16} color={turf} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Net Revenue (daily)</span>
          </div>
          <div style={{ display: "flex", background: inkMid, borderRadius: "8px", padding: "3px", border: "1px solid rgba(255,255,255,0.07)" }}>
            {PERIODS.map(p => (
              <button key={p.label} onClick={() => setPeriodDays(p.days)} style={{ padding: "5px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 700, fontFamily: "'Inter',sans-serif", background: periodDays === p.days ? "rgba(255,255,255,0.1)" : "transparent", color: periodDays === p.days ? paper : slate }}>{p.label}</button>
            ))}
          </div>
        </div>
        <BarChart data={rows} color={turf} />
      </div>

      {/* Payout + breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px" }}>

        {/* Recent revenue rows */}
        <div className="adm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Daily Breakdown</span>
          </div>
          {rows.length === 0 ? (
            <p style={{ color: slate, fontSize: "13px", padding: "20px" }}>No revenue recorded yet.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr><th>Date</th><th>Bookings</th><th>Gross</th><th>Cut (10%)</th><th>Net</th></tr>
              </thead>
              <tbody>
                {[...rows].reverse().slice(0, 20).map(r => (
                  <tr key={r.date}>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: slate }}>{r.date}</td>
                    <td>{r.count}</td>
                    <td>Rs. {r.gross.toFixed(0)}</td>
                    <td style={{ color: pink }}>-Rs. {(r.gross - r.net).toFixed(0)}</td>
                    <td style={{ color: turf, fontWeight: 700 }}>Rs. {r.net.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payout setup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="adm-card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <CreditCard size={15} color={flood} />
              <span style={{ fontWeight: 700, fontSize: "14px", color: paper }}>Payout Method</span>
            </div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              {(["khalti","esewa"] as const).map(m => (
                <button key={m} onClick={() => setPayoutMethod(m)} style={{ flex: 1, padding: "10px", borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "13px", fontFamily: "'Inter',sans-serif", background: payoutMethod === m ? "rgba(255,201,60,0.15)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${payoutMethod === m ? flood : "rgba(255,255,255,0.08)"}`, color: payoutMethod === m ? flood : slate, textTransform: "capitalize" as const }}>{m}</button>
              ))}
            </div>
            <label className="adm-label">{payoutMethod === "khalti" ? "Khalti" : "eSewa"} number</label>
            <input value={account} onChange={e => setAccount(e.target.value)} placeholder="98XXXXXXXX" style={inp("account")} onFocus={() => setFF("account")} onBlur={() => setFF(null)} />
            {payoutErr && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
                <AlertCircle size={12} color="#ef4444" /><span style={{ fontSize: "12px", color: "#ef4444" }}>{payoutErr}</span>
              </div>
            )}
            <button className="adm-btn-primary" onClick={handleSavePayout} disabled={savingPayout} style={{ width: "100%", marginTop: "12px", justifyContent: "center" }}>
              {savingPayout ? <Loader2 size={14} style={{ animation: "spin-slow 1s linear infinite" }} /> : payoutSaved ? <CheckCircle2 size={14} /> : <CheckCircle2 size={14} />}
              {savingPayout ? "Saving…" : payoutSaved ? "Saved!" : "Save payout details"}
            </button>
          </div>

          {/* Fee breakdown */}
          <div className="adm-card" style={{ padding: "20px" }}>
            <span style={{ fontWeight: 700, fontSize: "14px", color: paper, display: "block", marginBottom: "14px" }}>Fee Breakdown (per booking)</span>
            {[
              { label: "Booking amount",      value: "Rs. 120",  color: paper  },
              { label: "Khelumna cut (10%)",  value: "- Rs. 12", color: pink   },
              { label: "Payment gateway",     value: "- Rs. 3",  color: pink   },
              { label: "Net to you",          value: "Rs. 105",  color: turf   },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ fontSize: "13px", color: slate }}>{row.label}</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: row.color, fontFamily: "'JetBrains Mono',monospace" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
