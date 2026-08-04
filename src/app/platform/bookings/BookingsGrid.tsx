"use client";

import DataTable, { type Column } from "@/components/DataTable";

interface BookingRow extends Record<string, unknown> {
  id: string;
  venue: string;
  starts_at: string;
  price: number | null;
  status: string | null;
  source: string | null;
}

// 10% platform commission, shown per booking.
const COMMISSION = 0.10;

const COLS: Column<BookingRow>[] = [
  { key: "venue", label: "Venue" },
  { key: "starts_at", label: "When", type: "date" },
  { key: "price", label: "Amount", type: "money" },
  {
    key: "commission", label: "Our cut", type: "custom",
    render: (r) => <span className="dt-mono" style={{ color: "#A78BFA" }}>Rs {Math.round((Number(r.price) || 0) * COMMISSION).toLocaleString("en-IN")}</span>,
  },
  {
    key: "status", label: "Status", type: "badge",
    badgeColors: { confirmed: "#2E7D5B", booked: "#2E7D5B", cancelled: "#DE3163", no_show: "#DE3163", played: "#3b82f6" },
  },
  {
    key: "source", label: "Source", type: "badge",
    badgeColors: { platform: "#3b82f6", walk_in: "#8A95A3", phone: "#a855f7" },
  },
];

export default function BookingsGrid({ bookings }: { bookings: BookingRow[] }) {
  const total = bookings.reduce((s, b) => s + (Number(b.price) || 0), 0);
  const cut = Math.round(total * COMMISSION);

  return (
    <>
      <div className="plt-stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="plt-stat">
          <div className="plt-stat-v">{bookings.length}</div>
          <div className="plt-stat-l">Bookings shown</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v dt-mono">Rs {total.toLocaleString("en-IN")}</div>
          <div className="plt-stat-l">Gross value</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v warn dt-mono">Rs {cut.toLocaleString("en-IN")}</div>
          <div className="plt-stat-l">Our commission (10%)</div>
        </div>
      </div>

      <DataTable<BookingRow>
        columns={COLS}
        rows={bookings}
        pageSize={15}
        exportName="khelamna-bookings"
        empty="No bookings yet."
      />
    </>
  );
}
