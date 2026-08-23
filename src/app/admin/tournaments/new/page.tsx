import Link from "next/link";
import { getMyVenues } from "@/lib/admin/queries";
import TournamentForm from "@/components/tournaments/TournamentForm";
import { Topbar } from "../../ui";
import "../../../platform/events/events.css";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  const venues = await getMyVenues();

  return (
    <>
      <Topbar title="New tournament" crumb="OPERATE / TOURNAMENTS" />
      <div className="adm-body">
        {venues.length === 0 ? (
          <div className="ev-card" style={{ maxWidth: 560 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              List and get a venue approved first, then you can run a tournament there.
            </p>
            <Link href="/admin/venues/new" className="ev-btn" style={{ marginTop: 16, display: "inline-flex" }}>
              Add venue
            </Link>
          </div>
        ) : (
          <TournamentForm venues={venues.map((v) => ({ id: v.id, name: v.name }))} />
        )}
      </div>
    </>
  );
}
