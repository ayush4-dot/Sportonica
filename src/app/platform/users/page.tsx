import { allUsersForPlatform } from "@/lib/platform/actions";
import UsersGrid from "./UsersGrid";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const users = await allUsersForPlatform();
  return (
    <>
      <h1 className="plt-h1">Users</h1>
      <p className="plt-sub2">Everyone on Khelam Na. Promote players to venue owners here.</p>
      <UsersGrid users={users} />
    </>
  );
}
