import { listMyPartnerships } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import PartnershipsClient from "./PartnershipsClient";

export default async function OrganizePartnershipsPage() {
  const partnerships = await listMyPartnerships();

  return (
    <div>
      <h1 className="plt-h1">Venues</h1>
      <p className="plt-sub2" style={{ marginBottom: 20 }}>
        You can only pick a venue for a tournament once its owner has said yes to your invite.
      </p>
      <PartnershipsClient initial={isActionError(partnerships) ? [] : partnerships} />
    </div>
  );
}
