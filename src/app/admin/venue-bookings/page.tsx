import { listVendorTournamentBookings } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { Topbar } from "../ui";
import VenueBookingsClient from "./VenueBookingsClient";

export const dynamic = "force-dynamic";

export default async function AdminVenueBookingsPage() {
  const bookings = await listVendorTournamentBookings();

  return (
    <>
      <Topbar title="Venue bookings" crumb="OPERATE / VENUE BOOKINGS" />
      <div className="adm-body">
        <p style={{ opacity: 0.6, fontSize: 13.5, marginBottom: 20, maxWidth: 560 }}>
          Every tournament scheduled at your venue, whoever&apos;s organizing it. A draft tournament
          needs your confirmation before its organizer can submit it for review.
        </p>
        <div className="adm-card">
          <VenueBookingsClient initial={isActionError(bookings) ? [] : bookings} />
        </div>
      </div>
    </>
  );
}
