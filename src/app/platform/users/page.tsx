import { allUsersForPlatform } from "@/lib/platform/actions";
import { listPendingOrganizerRequests } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";
import UsersGrid from "./UsersGrid";
import OrganizerRequestsCard from "./OrganizerRequestsCard";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const [users, requests] = await Promise.all([allUsersForPlatform(), listPendingOrganizerRequests()]);

  if (isActionError(users)) {
    return (
      <>
        <h1 className="plt-h1">Users</h1>
        <p style={{ color: "#ef4444", fontSize: 14, marginTop: 16 }}>
          Couldn&apos;t load users — refresh the page to try again.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="plt-h1">Users</h1>
      <p className="plt-sub2">Everyone on Sportonica. Promote players to venue owners here.</p>
      <OrganizerRequestsCard initial={isActionError(requests) ? [] : requests} />
      <UsersGrid users={users} />
    </>
  );
}
