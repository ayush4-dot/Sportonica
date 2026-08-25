import { Trophy } from "lucide-react";
import { getMyPartneredVenues, listMyPartnerships } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import PartnershipsClient from "../../partnerships/PartnershipsClient";
import "@/app/platform/events/events.css";

export default async function NewOrganizerTournamentPage() {
  const venues = await getMyPartneredVenues();
  const rows = isActionError(venues) ? [] : venues;

  if (rows.length === 0) {
    const partnerships = await listMyPartnerships();
    return (
      <div>
        <div className="adm-empty" style={{ marginBottom: 4 }}>
          <div className="adm-empty-icon"><Trophy size={22} /></div>
          <h3>You&apos;ll need a venue to host at</h3>
          <p>Search for one below and send an invite — once they accept, you can create a tournament there.</p>
        </div>
        <PartnershipsClient initial={isActionError(partnerships) ? [] : partnerships} />
      </div>
    );
  }

  return <TournamentForm venues={rows} mode="organizer" />;
}
