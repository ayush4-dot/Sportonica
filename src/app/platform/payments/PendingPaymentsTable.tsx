"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageCircle } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { createClient } from "@/lib/supabase/client";
import ReviewPaymentModal from "./ReviewPaymentModal";
import { whatsappNotifyUrl } from "@/lib/payments/types";
import type { Payment } from "@/lib/payments/types";

interface Row extends Payment, Record<string, unknown> {
  customer_name: string;
  booking_label: string;
  venue_name: string;
  booking_when: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function whenLabel(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
  });
}

const COLS: Column<Row>[] = [
  { key: "booking_label", label: "Booking" },
  { key: "customer_name", label: "Customer" },
  { key: "venue_name", label: "Venue" },
  { key: "booking_when", label: "Date/Time", render: (r) => whenLabel(r.booking_when) },
  { key: "expected_amount", label: "Amount", type: "money" },
  {
    // Both stay within the Sportonica green/ink palette — no new colors.
    key: "payment_method", label: "Method", type: "badge",
    badgeColors: { esewa: "#006241", khalti: "#1e3932" },
  },
  { key: "transaction_id", label: "Transaction" },
  { key: "submitted_at", label: "Submitted", render: (r) => timeAgo(r.submitted_at) },
];

// Realtime (Supabase Realtime on the `payments` table, added to the
// supabase_realtime publication in supabase/payments/payments.sql) so the queue
// updates the moment a customer submits, without a manual page reload.
export default function PendingPaymentsTable({ initialPayments }: { initialPayments: Row[] }) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [latest, setLatest] = useState<Payment | null>(null);

  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("platform-payments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payments" },
        (payload) => {
          setNewCount((c) => c + 1);
          setLatest(payload.new as Payment);
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  function refreshNow() {
    setNewCount(0);
    router.refresh();
  }

  return (
    <>
      {newCount > 0 && (
        <div className="ppt-new">
          <button className="ppt-new-btn" onClick={refreshNow}>
            <Bell size={13} /> {newCount} new payment{newCount !== 1 ? "s" : ""} submitted — click to refresh
          </button>
          {latest && (
            // No WhatsApp Business/Twilio account is set up yet, so this
            // is a click-to-chat link, not an automatic push — see
            // whatsappNotifyUrl() in src/lib/payments/types.ts.
            <a
              className="ppt-new-wa"
              href={whatsappNotifyUrl(
                `New payment to verify — Rs ${Math.round(latest.expected_amount)} via ${latest.payment_method}, txn ${latest.transaction_id}. Review: /platform/payments`
              )}
              target="_blank" rel="noopener noreferrer"
            >
              <MessageCircle size={13} /> Notify via WhatsApp
            </a>
          )}
        </div>
      )}

      <DataTable<Row>
        columns={COLS}
        rows={initialPayments}
        pageSize={10}
        empty="No payments awaiting verification."
        actions={(p) => (
          <button className="dt-btn ok" onClick={() => setReviewing(p)}>Review</button>
        )}
      />

      {reviewing && (
        <ReviewPaymentModal
          payment={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => { setReviewing(null); router.refresh(); }}
        />
      )}

      <style>{`
        .ppt-new {
          display: flex; align-items: center; gap: 10px; width: 100%; margin-bottom: 12px;
          background: rgba(0,98,65,0.12); border: 1px solid rgba(0,98,65,0.4); color: #2E7D5B;
          border-radius: 10px; padding: 10px 14px; flex-wrap: wrap;
        }
        .ppt-new-btn {
          display: flex; align-items: center; gap: 8px; background: none; border: none;
          color: inherit; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; padding: 0;
        }
        .ppt-new-wa {
          display: inline-flex; align-items: center; gap: 6px; margin-left: auto;
          font-size: 12px; font-weight: 700; color: inherit; text-decoration: none;
          border: 1px solid rgba(46,125,91,0.5); border-radius: 8px; padding: 5px 10px;
        }
        .ppt-new-wa:hover { background: rgba(46,125,91,0.15); }
      `}</style>
    </>
  );
}
