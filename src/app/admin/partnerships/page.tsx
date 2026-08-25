import { listPartnershipInvitesForVendor } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { Topbar } from "../ui";
import PartnershipInvitesClient from "./PartnershipInvitesClient";

export const dynamic = "force-dynamic";

export default async function AdminPartnershipsPage() {
  const invites = await listPartnershipInvitesForVendor();

  return (
    <>
      <Topbar title="Organizers" crumb="OPERATE / ORGANIZERS" />
      <div className="adm-body" style={{ maxWidth: 780 }}>
        <p style={{ opacity: 0.6, fontSize: 13.5, marginBottom: 20, maxWidth: 560 }}>
          People who want to run tournaments at your venue. Accepting is a standing yes to being
          picked — you still confirm or decline each tournament on its own from Venue bookings.
        </p>
        <div className="adm-card">
          <PartnershipInvitesClient initial={isActionError(invites) ? [] : invites} />
        </div>
      </div>
    </>
  );
}
