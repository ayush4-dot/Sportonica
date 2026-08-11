"use client";

import DataTable, { type Column } from "@/components/DataTable";

interface BookingRow extends Record<string, unknown> {
  id: string;
  venue: string;
  starts_at: string;
  price: number | null;
  state: string | null;
  payment_status: string | null;
  source: string | null;
  customer_name: string | null;
  phone: string | null;
  payment_method: string | null;
  transaction_id: string | null;
}

// 10% platform commission, shown per booking.
const COMMISSION = 0.10;

const COLS: Column<BookingRow>[] = [
  { key: "venue", label: "Venue" },
  { key: "starts_at", label: "When", type: "date" },
  {
    key: "customer_name", label: "Customer", type: "custom",
    render: (r) => (
      <>
        {r.customer_name ?? "Player"}
        {r.phone && <div className="dt-dim" style={{ fontSize: 11 }}>{r.phone}</div>}
      </>
    ),
  },
  { key: "price", label: "Amount", type: "money" },
  {
    key: "commission", label: "Our cut", type: "custom",
    render: (r) => <span className="dt-mono" style={{ color: "#006241" }}>Rs {Math.round((Number(r.price) || 0) * COMMISSION).toLocaleString("en-IN")}</span>,
  },
  {
    key: "state", label: "Status", type: "badge",
    badgeColors: {
      reserved: "#F5A623", paid: "#2E7D5B", confirmed: "#2E7D5B", checked_in: "#2E7D5B",
      played: "#3b82f6", dropped: "#8A95A3", no_show: "#ef4444", refunded: "#8A95A3", cancelled: "#ef4444",
    },
  },
  {
    key: "payment_status", label: "Payment", type: "badge",
    badgeColors: {
      unpaid: "#8A95A3", pending_verification: "#F5A623", paid: "#2E7D5B",
      rejected: "#ef4444", partial: "#F5A623", refunded: "#8A95A3",
    },
  },
  {
    key: "transaction_id", label: "Approved via", type: "custom",
    render: (r) => r.payment_method && r.transaction_id
      ? <span className="dt-mono" style={{ fontSize: 12 }}>{String(r.payment_method).toUpperCase()} · {r.transaction_id}</span>
      : <span className="dt-dim">—</span>,
  },
  {
    key: "source", label: "Source", type: "badge",
    badgeColors: { platform: "#3b82f6", walk_in: "#8A95A3", phone: "#006241" },
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
