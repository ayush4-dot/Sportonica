"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { createPricingRule, togglePricingRule } from "@/lib/admin/actions";
import type { Court, PricingRule } from "@/lib/admin/types";
import { DOW_LABELS } from "@/lib/admin/types";

export default function PricingManager({
  venueId, courts, rules,
}: { venueId: string; courts: Court[]; rules: PricingRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"multiplier" | "fixed" | "discount_pct">("multiplier");
  const [amount, setAmount] = useState("1.5");
  const [days, setDays] = useState<number[]>([5, 6]);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("22:00");

  const toggleDay = (d: number) => setDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);

  function save() {
    if (!label.trim() || !courtId) return;
    startTransition(async () => {
      await createPricingRule({
        court_id: courtId, venue_id: venueId, label: label.trim(), kind,
        amount: Number(amount), days,
        start_time: startTime || null, end_time: endTime || null,
        priority: kind === "discount_pct" ? 5 : 10,
      });
      setAdding(false); setLabel("");
      router.refresh();
    });
  }

  function describe(r: PricingRule) {
    const dayTxt = r.days.length === 7 ? "every day" : r.days.map((d) => DOW_LABELS[d]).join(", ");
    const timeTxt = r.start_time ? ` ${r.start_time.slice(0, 5)}–${r.end_time?.slice(0, 5)}` : "";
    const amtTxt = r.kind === "multiplier" ? `×${r.amount}` : r.kind === "discount_pct" ? `${r.amount}% off` : `Rs ${r.amount}/hr`;
    return `${amtTxt} · ${dayTxt}${timeTxt}`;
  }

  return (
    <>
      {/* Auto-suggest teaser (blueprint 6.3) */}
      <div className="adm-card" style={{ marginBottom: 18, borderColor: "rgba(200,243,91,0.2)" }}>
        <div className="adm-flex" style={{ alignItems: "flex-start", gap: 12 }}>
          <Sparkles size={18} style={{ color: "var(--a-lime)", marginTop: 2 }} />
          <div>
            <div className="adm-card-t" style={{ marginBottom: 2 }}>Smart off-peak discounts</div>
            <div className="adm-card-sub" style={{ marginBottom: 0 }}>
              Once you have a few weeks of bookings, Khelum Na spots chronically empty slots and suggests a discount to fill them — found revenue, no guesswork.
            </div>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="adm-card-t">Pricing rules</div>
            <div className="adm-card-sub" style={{ marginBottom: 0 }}>Base price is set per court. Rules layer peak, happy-hour and weekend pricing on top.</div>
          </div>
          {!adding && courts.length > 0 && (
            <button className="adm-btn sm primary" onClick={() => setAdding(true)}><Plus size={14} /> Add rule</button>
          )}
        </div>

        {adding && (
          <div style={{ background: "var(--a-bg)", border: "1px solid var(--a-line-2)", borderRadius: 11, padding: 16, marginBottom: 16 }}>
            <div className="adm-row">
              <div className="adm-field">
                <label className="adm-label">Court</label>
                <select className="adm-select" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>)}
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label">Label</label>
                <input className="adm-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Weekend peak" />
              </div>
            </div>
            <div className="adm-row">
              <div className="adm-field">
                <label className="adm-label">Type</label>
                <select className="adm-select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="multiplier">Multiplier (e.g. ×1.5)</option>
                  <option value="discount_pct">Discount %</option>
                  <option value="fixed">Fixed Rs/hour</option>
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label">
                  {kind === "multiplier" ? "Multiplier" : kind === "discount_pct" ? "Discount %" : "Rs / hour"}
                </label>
                <input className="adm-input mono" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
            </div>
            <div className="adm-field">
              <label className="adm-label">Days</label>
              <div className="adm-chips">
                {DOW_LABELS.map((d, i) => (
                  <div key={i} className={`adm-chip ${days.includes(i) ? "on" : ""}`} onClick={() => toggleDay(i)}>{d}</div>
                ))}
              </div>
            </div>
            <div className="adm-row">
              <div className="adm-field">
                <label className="adm-label">From</label>
                <input type="time" className="adm-input mono" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">To</label>
                <input type="time" className="adm-input mono" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="adm-flex">
              <button className="adm-btn primary sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save rule"}</button>
              <button className="adm-btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}

        {courts.length === 0 ? (
          <div className="adm-dim" style={{ fontSize: 13 }}>Add a court first to create pricing rules.</div>
        ) : rules.length === 0 && !adding ? (
          <div className="adm-dim" style={{ fontSize: 13, padding: "10px 0" }}>
            No rules yet. Bookings use each court's base price until you add peak or discount rules.
          </div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr><th>Rule</th><th>Court</th><th>Applies</th><th>Active</th></tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const court = courts.find((c) => c.id === r.court_id);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {r.auto_suggested && <Sparkles size={11} style={{ color: "var(--a-lime)", verticalAlign: -1, marginRight: 4 }} />}
                        {r.label}
                      </div>
                    </td>
                    <td className="adm-dim">{court?.name}</td>
                    <td className="adm-num adm-dim" style={{ fontSize: 12 }}>{describe(r)}</td>
                    <td>
                      <button
                        className={`adm-badge ${r.active ? "ok" : "neutral"}`}
                        style={{ cursor: "pointer", border: "none" }}
                        onClick={() => startTransition(async () => { await togglePricingRule(r.id, venueId, !r.active); router.refresh(); })}
                      >
                        {r.active ? "on" : "off"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
