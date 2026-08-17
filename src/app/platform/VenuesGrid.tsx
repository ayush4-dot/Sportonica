"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { setVenueVerification } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";

interface VenueRow extends Record<string, unknown> {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  owner: string;
  verification_status: string | null;
  created_at: string;
}

const COLS: Column<VenueRow>[] = [
  { key: "name", label: "Venue" },
  { key: "venue_type", label: "Type" },
  { key: "owner", label: "Owner" },
  { key: "address", label: "Address" },
  {
    key: "verification_status", label: "Status", type: "badge",
    badgeColors: { verified: "#2E7D5B", pending: "#d97706", rejected: "#ef4444" },
  },
  { key: "created_at", label: "Listed", type: "date" },
];

export default function VenuesGrid({ venues }: { venues: VenueRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(id: string, status: "verified" | "rejected") {
    startTransition(async () => {
      const res = await setVenueVerification(id, status);
      if (isActionError(res)) { alert(res.message); return; }
      router.refresh();
    });
  }

  return (
    <DataTable<VenueRow>
      columns={COLS}
      rows={venues}
      pageSize={10}
      exportName="sportonica-venues"
      empty="No venues listed yet."
      actions={(v) => (
        <>
          {v.verification_status !== "verified" && (
            <button className="dt-btn ok" disabled={pending} onClick={() => setStatus(v.id, "verified")}>
              <Check size={12} /> Approve
            </button>
          )}
          {v.verification_status !== "rejected" && (
            <button className="dt-btn bad" disabled={pending} onClick={() => setStatus(v.id, "rejected")}>
              <X size={12} /> Reject
            </button>
          )}
        </>
      )}
    />
  );
}
