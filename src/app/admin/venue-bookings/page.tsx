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
          Every tournament proposed at your venue, one at a time — even from an organizer you&apos;ve
          already partnered with. Nothing here is automatic: each one needs your own yes before it
          can go any further.
        </p>
        <div className="adm-card">
          <VenueBookingsClient initial={isActionError(bookings) ? [] : bookings} />
        </div>
      </div>
    </>
  );
}
