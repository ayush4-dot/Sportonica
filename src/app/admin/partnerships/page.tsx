import { listPartnershipInvitesForVendor } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import { Topbar } from "../ui";
import PartnershipInvitesClient from "./PartnershipInvitesClient";

export const dynamic = "force-dynamic";

export default async function AdminPartnershipsPage() {
  const invites = await listPartnershipInvitesForVendor();

  return (
    <>
      <Topbar title="Partnerships" crumb="OPERATE / PARTNERSHIPS" />
      <div className="adm-body" style={{ maxWidth: 780 }}>
        <p style={{ opacity: 0.6, fontSize: 13.5, marginBottom: 20, maxWidth: 560 }}>
          Organizers who want to run tournaments at your venue. Accept once and every tournament
          they later propose at your venue still needs your confirmation from Venue bookings.
        </p>
        <div className="adm-card">
          <div className="adm-card-t">Invites</div>
          <div style={{ marginTop: 12 }}>
            <PartnershipInvitesClient initial={isActionError(invites) ? [] : invites} />
          </div>
        </div>
      </div>
    </>
  );
}
