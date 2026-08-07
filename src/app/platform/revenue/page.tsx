import { platformRevenue } from "@/lib/platform/actions";
import PayoutsGrid from "./PayoutsGrid";

export const dynamic = "force-dynamic";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

export default async function RevenuePage() {
  const r = await platformRevenue();

  return (
    <>
      <h1 className="plt-h1">Revenue</h1>
      <p className="plt-sub2">Your commission, and what you owe each venue. Commission is 10% off the top.</p>

      <div className="plt-stats">
        <div className="plt-stat">
          <div className="plt-stat-v dt-mono">{rs(r.gross)}</div>
          <div className="plt-stat-l">Gross booked</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v warn dt-mono">{rs(r.commission)}</div>
          <div className="plt-stat-l">Your commission</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v dt-mono">{rs(r.gross - r.commission)}</div>
          <div className="plt-stat-l">Owed to venues</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v dt-mono" style={{ color: "#006241" }}>{rs(r.payoutPending)}</div>
          <div className="plt-stat-l">Unpaid to venues</div>
        </div>
      </div>

      <div className="plt-sec-t">Payouts by venue</div>
      <PayoutsGrid venues={r.venues} />
    </>
  );
}
