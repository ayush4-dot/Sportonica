import { notFound } from "next/navigation";
import { getMyVenues } from "@/lib/admin/queries";
import {
  getTournament, getTournamentVenueName, listTournamentTeamsWithRosterCount, listTournamentPayments,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import TournamentControlCenter from "@/components/tournaments/TournamentControlCenter";
import { Topbar } from "../../ui";
import "../../../platform/events/events.css";

export const dynamic = "force-dynamic";

export default async function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();

  if (tournament.status === "draft") {
    const venues = await getMyVenues();
    return (
      <>
        <Topbar title="Edit draft" crumb="OPERATE / TOURNAMENTS" />
        <div className="adm-body">
          <TournamentForm venues={venues.map((v) => ({ id: v.id, name: v.name }))} existing={tournament} />
        </div>
      </>
    );
  }

  const [venueName, teams, payments] = await Promise.all([
    getTournamentVenueName(tournament.venue_id),
    listTournamentTeamsWithRosterCount(id),
    listTournamentPayments(id),
  ]);

  return (
    <>
      <Topbar title={tournament.name} crumb="OPERATE / TOURNAMENTS" />
      <div className="adm-body">
        <TournamentControlCenter
          tournament={tournament}
          venueName={venueName ?? "—"}
          teams={isActionError(teams) ? [] : teams}
          payments={isActionError(payments) ? [] : payments}
          viewer="vendor"
          backHref="/admin/tournaments"
        />
      </div>
    </>
  );
}
