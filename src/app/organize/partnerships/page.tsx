import { listMyPartnerships } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import PartnershipsClient from "./PartnershipsClient";

export default async function OrganizePartnershipsPage() {
  const partnerships = await listMyPartnerships();

  return (
    <div>
      <h1 className="plt-h1">Partnerships</h1>
      <p className="plt-sub2" style={{ marginBottom: 20 }}>
        Only venues you have an active partnership with show up when you create a tournament.
      </p>
      <PartnershipsClient initial={isActionError(partnerships) ? [] : partnerships} />
    </div>
  );
}
