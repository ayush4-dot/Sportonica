import Link from "next/link";
import { Trophy, Plus } from "lucide-react";
import { getMyOrganizerTournaments, getMyRole } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, type TournamentStatus } from "@/lib/tournaments/types";
import RoleExplainerBanner from "@/components/RoleExplainerBanner";
import BecomeOrganizerButton from "./BecomeOrganizerButton";

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: "neutral", pending_approval: "warn", published: "ok", registration_open: "ok",
  registration_closed: "warn", live: "ok", completed: "neutral", cancelled: "danger",
};

export default async function OrganizePage() {
  const role = await getMyRole();

  if (role !== "organizer" && role !== "super_admin") {
    return (
      <div className="adm-empty">
        <div className="adm-empty-icon"><Trophy size={22} /></div>
        <h3>Run your own tournaments</h3>
        <p>
          You don&apos;t need to own a venue — invite one to host, and once they say yes you can
          set up a tournament there. Sportonica reviews it the same as any other, then it goes live.
        </p>
        <BecomeOrganizerButton />
      </div>
    );
  }

  const tournaments = await getMyOrganizerTournaments();
  const rows = isActionError(tournaments) ? [] : tournaments;

  return (
    <div className="adm-body" style={{ padding: 0 }}>
      <RoleExplainerBanner
        storageKey="organizer-dashboard-explainer-dismissed"
        title="You're viewing the Organizer dashboard"
        body="As an Organizer, you set up and run tournaments — fixtures, teams, results, announcements. You don't own the venue; the venue's owner (a Vendor) confirms hosting each tournament separately."
      />
      <div className="adm-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="plt-h1">Your tournaments</h1>
          <p className="plt-sub2">Everything you&apos;re organizing, across every venue that&apos;s said yes.</p>
        </div>
        <Link href="/organize/tournaments/new" className="adm-btn primary"><Plus size={14} /> New tournament</Link>
      </div>

      {rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-icon"><Trophy size={22} /></div>
          <h3>No tournaments yet</h3>
          <p>Invite a venue to host, then create your first tournament once they say yes.</p>
          <Link href="/organize/partnerships" className="adm-btn primary">Find a venue</Link>
        </div>
      ) : (
        <table className="adm-table">
          <thead>
            <tr><th>Name</th><th>Sport</th><th>Format</th><th>Starts</th><th>Teams</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/organize/tournaments/${t.id}`} style={{ fontWeight: 700, color: "inherit" }}>{t.name}</Link></td>
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
  );
}
