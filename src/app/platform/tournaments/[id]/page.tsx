import { notFound } from "next/navigation";
import {
  getTournament, getDisplayVenueName, listTournamentTeamsWithRosterCount, listTournamentPayments,
  getTournamentMatches, getTournamentAnnouncements, getTournamentTeamFines,
} from "@/lib/tournaments/actions";
import { listTournamentPaymentsForReview } from "@/lib/payments/adminActions";
import { isActionError } from "@/lib/actionError";
import TournamentControlCenter from "@/components/tournaments/TournamentControlCenter";

export const dynamic = "force-dynamic";

export default async function PlatformTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();

  const [venueName, teams, payments, matches, announcements, reviewPayments, teamFines] = await Promise.all([
    getDisplayVenueName(tournament),
    listTournamentTeamsWithRosterCount(id),
    listTournamentPayments(id),
    getTournamentMatches(id),
    getTournamentAnnouncements(id),
    listTournamentPaymentsForReview(id),
    getTournamentTeamFines(id),
  ]);

  return (
    <TournamentControlCenter
      tournament={tournament}
      venueName={venueName}
      teams={isActionError(teams) ? [] : teams}
      payments={isActionError(payments) ? [] : payments}
      matches={isActionError(matches) ? [] : matches}
      announcements={isActionError(announcements) ? [] : announcements}
      reviewPayments={isActionError(reviewPayments) ? [] : reviewPayments}
      teamFines={isActionError(teamFines) ? [] : teamFines}
      viewer="super_admin"
      backHref="/platform/tournaments"
    />
  );
}
