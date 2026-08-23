import { allVenuesForPlatform } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";
import TournamentForm from "@/components/tournaments/TournamentForm";
import "../../events/events.css";

export const dynamic = "force-dynamic";

export default async function PlatformNewTournamentPage() {
  const venues = await allVenuesForPlatform();
  const rows = isActionError(venues) ? [] : venues;

  return (
    <>
      <h1 className="plt-h1">New tournament</h1>
      <p className="plt-sub2">A Sportonica-run tournament or one-off event — team-based or single-entry, at any venue on the platform.</p>
      <TournamentForm venues={rows.map((v) => ({ id: v.id, name: v.name }))} mode="platform" />
    </>
  );
}
