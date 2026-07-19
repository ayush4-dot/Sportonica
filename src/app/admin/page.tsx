import Link from "next/link";
import { Building2, Plus, CalendarClock } from "lucide-react";
import { getMyVenues, getCourtsForVenues, getUpcomingBookings } from "@/lib/admin/queries";
import { Topbar, Stat, BookingBadge, money, timeRange, dayLabel, VerifyBadge } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const venues = await getMyVenues();
  const venueIds = venues.map((v) => v.id);
  const courts = await getCourtsForVenues(venueIds);
  const upcoming = await getUpcomingBookings(venueIds, 8);

  const todayStr = new Date().toDateString();
  const todays = upcoming.filter((b) => new Date(b.starts_at).toDateString() === todayStr);
  const todayRevenue = todays
    .filter((b) => !["cancelled", "refunded", "dropped"].includes(b.state))
    .reduce((s, b) => s + Number(b.price), 0);

  if (venues.length === 0) {
    return (
      <>
        <Topbar title="Overview" crumb="KHELUM NA / CONSOLE" />
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><Building2 size={22} /></div>
            <h3>Add your first venue</h3>
            <p>Set up your ground, add courts and opening hours, and start taking bookings. It takes about two minutes.</p>
            <Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Overview"
        crumb="KHELUM NA / CONSOLE"
        action={<Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>}
      />
      <div className="adm-body">
        <div className="adm-stats">
          <Stat label="Venues" value={venues.length} accent="var(--a-sodium)" />
          <Stat label="Courts" value={courts.length} accent="var(--a-turf)" />
          <Stat label="Today's games" value={todays.length} accent="var(--a-sky)" />
          <Stat label="Today's revenue" value={money(todayRevenue)} accent="var(--a-lime)" />
        </div>

        <div className="adm-grid-2" style={{ alignItems: "start" }}>
          {/* Upcoming bookings */}
          <div className="adm-card">
            <div className="adm-between" style={{ marginBottom: 4 }}>
              <div>
                <div className="adm-card-t">Upcoming bookings</div>
                <div className="adm-card-sub">Next games across your venues</div>
              </div>
              <Link href="/admin/bookings" className="adm-btn sm ghost">View all</Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="adm-dim" style={{ fontSize: 13, padding: "20px 0" }}>
                No upcoming bookings yet. They'll appear here as players book.
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>When</th><th>Court</th><th>Customer</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {upcoming.map((b) => {
                    const court = courts.find((c) => c.id === b.court_id);
                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{dayLabel(b.starts_at)}</div>
                          <div className="adm-num adm-dim" style={{ fontSize: 11 }}>{timeRange(b.starts_at, b.ends_at)}</div>
                        </td>
                        <td>{court?.name ?? "—"}<div className="adm-dim" style={{ fontSize: 11 }}>{court?.sport}</div></td>
                        <td>{b.customer_name ?? "Player"}</td>
                        <td className="adm-num">{money(Number(b.price))}</td>
                        <td><BookingBadge state={b.state} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Venue health */}
          <div className="adm-card">
            <div className="adm-card-t">Your venues</div>
            <div className="adm-card-sub">Verification & status</div>
            {venues.map((v) => {
              const vCourts = courts.filter((c) => c.venue_id === v.id);
              return (
                <Link
                  key={v.id}
                  href={`/admin/venues/${v.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="adm-between" style={{
                    padding: "14px 0", borderBottom: "1px solid var(--a-line)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</div>
                      <div className="adm-dim" style={{ fontSize: 12 }}>
                        {vCourts.length} court{vCourts.length !== 1 ? "s" : ""} · {v.venue_type}
                      </div>
                    </div>
                    <VerifyBadge status={v.verification_status} />
                  </div>
                </Link>
              );
            })}
            {venues.some((v) => v.verification_status === "unverified") && (
              <div style={{ marginTop: 14, fontSize: 12 }} className="adm-dim">
                <CalendarClock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                Unverified venues can still take bookings, with a payout cap until verified.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
