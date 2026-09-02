import Link from "next/link";
import { listAllTournaments, getDisplayVenueName } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS } from "@/lib/tournaments/types";
import "@/components/tournaments/tournament-console.css";

export const dynamic = "force-dynamic";

export default async function PlatformTournamentsPage() {
  const tournaments = await listAllTournaments();
  const rows = isActionError(tournaments) ? [] : tournaments;
  const venueNames = await Promise.all(rows.map((t) => getDisplayVenueName(t)));

  const pendingCount = rows.filter((t) => t.status === "pending_approval").length;

  return (
    <>
      <h1 className="plt-h1">Tournaments</h1>
      <p className="plt-sub2">
        Every tournament across all venues, plus any Sportonica runs itself. Approve a vendor&apos;s
        draft to publish it, or cancel one outright. Payment verification for tournament
        registrations happens in Payments, exactly like every other booking.
      </p>

      {pendingCount > 0 && (
        <div className="tc-card" style={{ borderColor: "rgba(217,119,6,0.4)" }}>
          <div className="tc-card-t">{pendingCount} awaiting review</div>
          <div className="tc-card-sub">Vendors have submitted tournaments for approval.</div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="tc-empty">No tournaments yet.</div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table className="tc-table">
          <thead><tr><th>Name</th><th>Venue</th><th>Sport</th><th>Starts</th><th>Teams</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td><Link href={`/platform/tournaments/${t.id}`} style={{ fontWeight: 700, color: "inherit" }}>{t.name}</Link></td>
                <td className="tc-dim">{venueNames[i]}</td>
                <td className="tc-dim">{t.sport}</td>
                <td className="tc-num tc-dim" style={{ fontSize: 12 }}>
                  {new Date(t.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="tc-num">{t.max_teams}</td>
                <td><span className={`tc-badge ${t.status === "pending_approval" ? "warn" : t.status === "cancelled" ? "danger" : t.status === "draft" ? "neutral" : "ok"}`}>{STATUS_LABELS[t.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}
