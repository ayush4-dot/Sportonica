import Link from "next/link";
import { Trophy, Plus } from "lucide-react";
import { getMyOrganizerTournaments, getMyRole } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, type TournamentStatus } from "@/lib/tournaments/types";
import RoleExplainerBanner from "@/components/RoleExplainerBanner";

const STATUS_BADGE: Record<TournamentStatus, string> = {
  draft: "neutral", pending_approval: "warn", published: "ok", registration_open: "ok",
  registration_closed: "warn", live: "ok", completed: "neutral", cancelled: "danger",
};

// Requesting/checking organizer access happens in the popup behind the
// header's trophy icon (OrganizerAccessModal.tsx) now, not here — this
// page assumes access and only needs a short fallback for anyone who
// lands here directly without it (bookmark, back button, shared link).
//
// A plain player can also land here with something to manage: a super
// admin can grant "Owner access" to one specific tournament without
// making them a platform-wide Organizer (see TournamentAccessTab.tsx /
// tournament_owner_access.sql). getMyOrganizerTournaments() already
// picks up both cases via RLS — so the access gate below only blocks
// someone who is neither an Organizer nor has been granted anything.
export default async function OrganizePage() {
  const role = await getMyRole();
  const isOrganizerRole = role === "organizer" || role === "super_admin";
  const tournaments = await getMyOrganizerTournaments();
  const rows = isActionError(tournaments) ? [] : tournaments;

  if (!isOrganizerRole && rows.length === 0) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-icon"><Trophy size={22} /></div>
        <h3>Organizer access needed</h3>
        <p>Use the trophy icon in the header to request or check your organizer access.</p>
      </div>
    );
  }

  return (
    <div className="adm-body" style={{ padding: 0 }}>
      <RoleExplainerBanner
        storageKey="organizer-dashboard-explainer-dismissed"
        title="You're viewing the Organizer dashboard"
        body="As an Organizer, you set up and run tournaments — fixtures, teams, results, announcements. Use your own venue directly, or invite a Sportonica venue's owner (a Vendor) to host — they confirm each tournament separately."
      />
      <div className="adm-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="plt-h1">Your tournaments</h1>
          <p className="plt-sub2">
            {isOrganizerRole
              ? "Everything you're organizing, across every venue that's said yes."
              : "Tournaments you've been given access to manage."}
          </p>
        </div>
        {isOrganizerRole && (
          <Link href="/organize/tournaments/new" className="adm-btn primary"><Plus size={14} /> New tournament</Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-icon"><Trophy size={22} /></div>
          <h3>No tournaments yet</h3>
          {isOrganizerRole ? (
            <>
              <p>Create one at your own venue, or invite a Sportonica venue to host.</p>
              <Link href="/organize/tournaments/new" className="adm-btn primary">New tournament</Link>
            </>
          ) : (
            <p>You haven&apos;t been given access to manage any tournaments yet.</p>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table className="adm-table">
          <thead>
            <tr><th>Name</th><th>Sport</th><th>Format</th><th>Starts</th><th>Teams</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td data-label="Name"><Link href={`/organize/tournaments/${t.id}`} style={{ fontWeight: 700, color: "inherit" }}>{t.name}</Link></td>
                <td className="adm-dim" data-label="Sport">{t.sport}</td>
                <td className="adm-dim" style={{ textTransform: "capitalize" }} data-label="Format">{t.format.replace("_", " + ")}</td>
                <td className="adm-num adm-dim" style={{ fontSize: 12 }} data-label="Starts">
                  {new Date(t.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="adm-num" data-label="Teams">{t.max_teams ?? "∞"}</td>
                <td data-label="Status"><span className={`adm-badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABELS[t.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
