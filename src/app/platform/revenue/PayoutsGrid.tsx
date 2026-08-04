"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { markVenuePaid } from "@/lib/platform/actions";

interface PayoutRow extends Record<string, unknown> {
  venue_id: string;
  venue_name: string;
  bookings: number;
  gross_total: number;
  commission_total: number;
  payout_total: number;
  payout_pending: number | null;
  payout_paid: number | null;
}

const COLS: Column<PayoutRow>[] = [
  { key: "venue_name", label: "Venue" },
  { key: "bookings", label: "Bookings", type: "custom", render: (v) => <span className="dt-mono">{v.bookings}</span> },
  { key: "gross_total", label: "Gross", type: "money" },
  { key: "commission_total", label: "Our cut", type: "custom", render: (v) => <span className="dt-mono" style={{ color: "#A78BFA" }}>Rs {Number(v.commission_total || 0).toLocaleString("en-IN")}</span> },
  { key: "payout_total", label: "Venue earns", type: "money" },
  { key: "payout_pending", label: "Unpaid", type: "custom", render: (v) => <span className="dt-mono" style={{ color: Number(v.payout_pending) > 0 ? "#DE3163" : undefined }}>Rs {Number(v.payout_pending || 0).toLocaleString("en-IN")}</span> },
];

export default function PayoutsGrid({ venues }: { venues: PayoutRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pay(venueId: string) {
    startTransition(async () => {
      await markVenuePaid(venueId);
      router.refresh();
    });
  }

  return (
    <DataTable<PayoutRow>
      columns={COLS}
      rows={venues}
      pageSize={15}
      exportName="khelamna-payouts"
      empty="No revenue yet — bookings will show here."
      actions={(v) => (
        Number(v.payout_pending) > 0 ? (
          <button className="dt-btn ok" disabled={pending} onClick={() => pay(v.venue_id)}>
            <Check size={12} /> Mark paid
          </button>
        ) : <span className="dt-dim">settled</span>
      )}
    />
  );
}
