import { notFound } from "next/navigation";
import { getMyPartneredVenues } from "@/lib/organizer/actions";
import {
  getTournament, getDisplayVenueName, listTournamentTeamsWithRosterCount, listTournamentPayments,
  getTournamentMatches, getTournamentAnnouncements, getTournamentTeamFines,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import TournamentControlCenter from "@/components/tournaments/TournamentControlCenter";
import "@/app/platform/events/events.css";

export default async function OrganizerTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();

  if (tournament.status === "draft") {
    const venues = await getMyPartneredVenues();
    return <TournamentForm venues={isActionError(venues) ? [] : venues} existing={tournament} mode="organizer" />;
  }

  const [venueName, teams, payments, matches, announcements, teamFines] = await Promise.all([
    getDisplayVenueName(tournament),
    listTournamentTeamsWithRosterCount(id),
    listTournamentPayments(id),
    getTournamentMatches(id),
    getTournamentAnnouncements(id),
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
      teamFines={isActionError(teamFines) ? [] : teamFines}
      viewer="organizer"
      backHref="/organize"
    />
  );
}
