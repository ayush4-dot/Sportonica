import { notFound } from "next/navigation";
import {
  getTournament, getDisplayVenueName, listTournamentTeamsWithRosterCount, listTournamentPayments,
  getTournamentMatches, getTournamentAnnouncements,
} from "@/lib/tournaments/actions";
import { getCourts } from "@/lib/admin/queries";
import { listTournamentPaymentsForReview } from "@/lib/payments/adminActions";
import { isActionError } from "@/lib/actionError";
import TournamentControlCenter from "@/components/tournaments/TournamentControlCenter";

export const dynamic = "force-dynamic";

export default async function PlatformTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();

  const [venueName, teams, payments, matches, announcements, courts, reviewPayments] = await Promise.all([
    getDisplayVenueName(tournament),
    listTournamentTeamsWithRosterCount(id),
    listTournamentPayments(id),
    getTournamentMatches(id),
    getTournamentAnnouncements(id),
    getCourts(tournament.venue_id),
    listTournamentPaymentsForReview(id),
  ]);

  return (
    <TournamentControlCenter
      tournament={tournament}
      venueName={venueName}
      teams={isActionError(teams) ? [] : teams}
      payments={isActionError(payments) ? [] : payments}
      matches={isActionError(matches) ? [] : matches}
      announcements={isActionError(announcements) ? [] : announcements}
      courts={courts.map((c) => ({ id: c.id, name: c.name }))}
      reviewPayments={isActionError(reviewPayments) ? [] : reviewPayments}
      viewer="super_admin"
      backHref="/platform/tournaments"
    />
  );
}
