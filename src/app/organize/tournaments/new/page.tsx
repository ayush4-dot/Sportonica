import { getMyPartneredVenues } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import "@/app/platform/events/events.css";

// No hard gate on having a partnered venue first — an Organizer can
// always list their own venue instead (TournamentForm's own venue-picker
// toggle handles both paths, including a "no partnered venues yet, here's
// an invite link" inline note when the list below is empty).
export default async function NewOrganizerTournamentPage() {
  const venues = await getMyPartneredVenues();
  return <TournamentForm venues={isActionError(venues) ? [] : venues} mode="organizer" />;
}
