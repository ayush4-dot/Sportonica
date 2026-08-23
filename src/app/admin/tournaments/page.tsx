import Link from "next/link";
import { Trophy, Plus } from "lucide-react";
import { getMyVendorTournaments } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, type TournamentStatus } from "@/lib/tournaments/types";
import { Topbar } from "../ui";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: "neutral", pending_approval: "warn", published: "ok", registration_open: "ok",
  registration_closed: "warn", live: "ok", completed: "neutral", cancelled: "danger",
};

export default async function AdminTournamentsPage() {
  const tournaments = await getMyVendorTournaments();
  const rows = isActionError(tournaments) ? [] : tournaments;

  return (
    <>
      <Topbar
        title="Tournaments"
        crumb="OPERATE / TOURNAMENTS"
        action={<Link href="/admin/tournaments/new" className="adm-btn primary"><Plus size={14} /> New tournament</Link>}
      />
      <div className="adm-body">
        <p style={{ opacity: 0.6, fontSize: 13.5, marginBottom: 20, maxWidth: 560 }}>
          Team-based competitive tournaments at your venue — draft, submit for review,
          then open registration once it's published. Payment verification happens through
          the same review process as your other bookings.
        </p>

        {rows.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty-icon"><Trophy size={22} /></div>
            <h3>No tournaments yet</h3>
            <p>Create your first tournament to start taking team registrations.</p>
            <Link href="/admin/tournaments/new" className="adm-btn primary">New tournament</Link>
          </div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr><th>Name</th><th>Sport</th><th>Format</th><th>Starts</th><th>Teams</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/admin/tournaments/${t.id}`} style={{ fontWeight: 700, color: "inherit" }}>{t.name}</Link></td>
                  <td className="adm-dim">{t.sport}</td>
                  <td className="adm-dim" style={{ textTransform: "capitalize" }}>{t.format.replace("_", " + ")}</td>
                  <td className="adm-num adm-dim" style={{ fontSize: 12 }}>
                    {new Date(t.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="adm-num">{t.max_teams}</td>
                  <td><span className={`adm-badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABELS[t.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
