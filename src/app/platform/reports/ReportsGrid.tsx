"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { setReportStatus } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";

interface ReportRow extends Record<string, unknown> {
  id: string;
  reporter: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

const COLS: Column<ReportRow>[] = [
  { key: "created_at", label: "When", type: "date" },
  { key: "reporter", label: "Reported by" },
  {
    key: "target_type", label: "Type", type: "badge",
    badgeColors: { message: "#3b82f6", squad: "#006241", user: "#f97316" },
  },
  { key: "reason", label: "Reason" },
  { key: "details", label: "Details" },
  {
    key: "status", label: "Status", type: "badge",
    badgeColors: { open: "#d97706", reviewed: "#2E7D5B", dismissed: "#8A95A3" },
  },
];

export default function ReportsGrid({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resolve(id: string, status: "reviewed" | "dismissed") {
    startTransition(async () => {
      const res = await setReportStatus(id, status);
      if (isActionError(res)) { alert(res.message); return; }
      router.refresh();
    });
  }

  return (
    <DataTable<ReportRow>
      columns={COLS}
      rows={reports}
      pageSize={15}
      exportName="khelamna-reports"
      empty="No reports — all quiet."
      actions={(r) => (
        r.status === "open" ? (
          <>
            <button className="dt-btn ok" disabled={pending} onClick={() => resolve(r.id, "reviewed")}>
              <Check size={12} /> Reviewed
            </button>
            <button className="dt-btn" disabled={pending} onClick={() => resolve(r.id, "dismissed")}>
              <X size={12} /> Dismiss
            </button>
          </>
        ) : <span className="dt-dim">closed</span>
      )}
    />
  );
}
