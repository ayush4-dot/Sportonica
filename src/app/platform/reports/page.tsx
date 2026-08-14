import { allReports } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";
import ReportsGrid from "./ReportsGrid";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await allReports();
  if (isActionError(reports)) throw new Error(reports.message);
  const open = reports.filter((r) => r.status === "open").length;

  return (
    <>
      <h1 className="plt-h1">Reports</h1>
      <p className="plt-sub2">Flagged squads, messages and users. Review and resolve.</p>

      <div className="plt-stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="plt-stat">
          <div className={`plt-stat-v ${open > 0 ? "warn" : ""}`}>{open}</div>
          <div className="plt-stat-l">Open</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{reports.filter((r) => r.status === "reviewed").length}</div>
          <div className="plt-stat-l">Reviewed</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{reports.length}</div>
          <div className="plt-stat-l">Total</div>
        </div>
      </div>

      <ReportsGrid reports={reports} />
    </>
  );
}
