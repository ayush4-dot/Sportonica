import Link from "next/link";
import { Trophy } from "lucide-react";
import { getMyPartneredVenues } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import "@/app/platform/events/events.css";

export default async function NewOrganizerTournamentPage() {
  const venues = await getMyPartneredVenues();
  const rows = isActionError(venues) ? [] : venues;

  if (rows.length === 0) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-icon"><Trophy size={22} /></div>
        <h3>Partner with a venue first</h3>
        <p>You need an active partnership with at least one venue before you can create a tournament there.</p>
        <Link href="/organize/partnerships" className="adm-btn primary">Find a venue to partner with</Link>
      </div>
    );
  }

  return <TournamentForm venues={rows} mode="organizer" />;
}
