import { platformOverview, allVenuesForPlatform } from "@/lib/platform/actions";
import VenuesGrid from "./VenuesGrid";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const [stats, venues] = await Promise.all([platformOverview(), allVenuesForPlatform()]);

  return (
    <>
      <h1 className="plt-h1">Overview</h1>
      <p className="plt-sub2">Everything on the platform, in one place.</p>

      <div className="plt-stats">
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.venues}</div>
          <div className="plt-stat-l">Venues</div>
        </div>
        <div className="plt-stat">
          <div className={`plt-stat-v ${stats.pending > 0 ? "warn" : ""}`}>{stats.pending}</div>
          <div className="plt-stat-l">Awaiting approval</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.users}</div>
          <div className="plt-stat-l">Users</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.bookings}</div>
          <div className="plt-stat-l">Court bookings</div>
        </div>
      </div>

      <div className="plt-sec-t">Venues</div>
      <VenuesGrid venues={venues} />
    </>
  );
}
