import { notFound } from "next/navigation";
import {
  getTournament, getTournamentVenueName, listTournamentTeamsWithRosterCount, listTournamentPayments,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import TournamentControlCenter from "@/components/tournaments/TournamentControlCenter";

export const dynamic = "force-dynamic";

export default async function PlatformTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();

  const [venueName, teams, payments] = await Promise.all([
    getTournamentVenueName(tournament.venue_id),
    listTournamentTeamsWithRosterCount(id),
    listTournamentPayments(id),
  ]);

  return (
    <TournamentControlCenter
      tournament={tournament}
      venueName={venueName ?? "—"}
      teams={isActionError(teams) ? [] : teams}
      payments={isActionError(payments) ? [] : payments}
      viewer="super_admin"
      backHref="/platform/tournaments"
    />
  );
}
