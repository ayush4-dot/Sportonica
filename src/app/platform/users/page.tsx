import { allUsersForPlatform } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";
import UsersGrid from "./UsersGrid";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const users = await allUsersForPlatform();
  if (isActionError(users)) throw new Error(users.message);
  return (
    <>
      <h1 className="plt-h1">Users</h1>
      <p className="plt-sub2">Everyone on Sportonica. Promote players to venue owners here.</p>
      <UsersGrid users={users} />
    </>
  );
}
