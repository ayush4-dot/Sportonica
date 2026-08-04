import Link from "next/link";
import { Wallet, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyVenues, getPayouts } from "@/lib/admin/queries";
import type { CourtBooking } from "@/lib/admin/types";
import { Topbar, Stat, money } from "../ui";

export const dynamic = "force-dynamic";

const COMMISSION = 0.1; // 10% platform commission

export default async function PayoutsPage() {
  const venues = await getMyVenues();
  const venueIds = venues.map((v) => v.id);
  const payouts = await getPayouts(venueIds);

  // compute pending earnings from played/confirmed bookings not yet paid out
  const sb = await createClient();
  const { data } = venueIds.length
    ? await sb.from("court_bookings").select("*").in("venue_id", venueIds)
        .in("state", ["played", "checked_in", "confirmed", "paid"])
    : { data: [] as CourtBooking[] };
  const earning = (data as CourtBooking[]) ?? [];

  const gross = earning.reduce((s, b) => s + Number(b.price), 0);
  const commission = gross * COMMISSION;
  const net = gross - commission;
  const settled = payouts.filter((p) => p.status === "settled").reduce((s, p) => s + Number(p.net), 0);

  return (
    <>
      <Topbar
        title="Payouts"
        crumb="MONEY"
        action={<button className="adm-btn sm"><Download size={14} /> Statement</button>}
      />
      <div className="adm-body">
        {venueIds.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty-icon"><Wallet size={22} /></div>
            <h3>No earnings yet</h3>
            <p>Your earnings and payouts appear here once games are played at your venue.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        ) : (
          <>
            <div className="adm-stats">
              <Stat label="Gross earnings" value={money(gross)} accent="var(--a-accent)" />
              <Stat label="Commission (10%)" value={money(commission)} accent="var(--a-pink)" />
              <Stat label="Net payable" value={money(net)} accent="var(--a-lime)" />
              <Stat label="Settled to date" value={money(settled)} accent="var(--a-turf)" />
            </div>

            <div className="adm-card">
              <div className="adm-card-t">How your money moves</div>
              <div className="adm-card-sub">Player pays → held in escrow → released after the game is played. Never before.</div>
              <div className="adm-flex" style={{ gap: 0, fontSize: 12.5, flexWrap: "wrap" }}>
                {["Player pays", "Escrow holds", "Game played", "Payout released"].map((step, i, arr) => (
                  <div key={step} className="adm-flex" style={{ gap: 0 }}>
                    <span className="adm-badge neutral" style={{ background: "var(--a-panel-2)" }}>{step}</span>
                    {i < arr.length - 1 && <span className="adm-dim" style={{ margin: "0 10px" }}>→</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="adm-card" style={{ marginTop: 18 }}>
              <div className="adm-card-t">Payout history</div>
              <div className="adm-card-sub">Scheduled settlements to your account</div>
              {payouts.length === 0 ? (
                <div className="adm-dim" style={{ fontSize: 13, padding: "10px 0" }}>
                  No payouts scheduled yet. Your first payout runs after your first games are played.
                </div>
              ) : (
                <table className="adm-table">
                  <thead>
                    <tr><th>Period</th><th>Gross</th><th>Commission</th><th>Net</th><th>Method</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id}>
                        <td className="adm-num adm-dim" style={{ fontSize: 12 }}>{p.period_start} → {p.period_end}</td>
                        <td className="adm-num">{money(Number(p.gross))}</td>
                        <td className="adm-num adm-dim">{money(Number(p.commission))}</td>
                        <td className="adm-num" style={{ fontWeight: 600 }}>{money(Number(p.net))}</td>
                        <td className="adm-dim" style={{ textTransform: "capitalize" }}>{p.method}</td>
                        <td><span className={`adm-badge ${p.status === "settled" ? "ok" : p.status === "failed" ? "danger" : "warn"}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
