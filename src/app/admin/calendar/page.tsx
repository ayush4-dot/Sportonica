import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyVenues, getCourtsForVenues, getBookingsInRange, getBlocksInRange } from "@/lib/admin/queries";
import type { CourtHours } from "@/lib/admin/types";
import { Topbar } from "../ui";
import DayCalendar from "./DayCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ venue?: string }> }) {
  const { venue } = await searchParams;
  const venues = await getMyVenues();
  const activeVenue = venues.find((v) => v.id === venue) ?? venues[0];

  if (!activeVenue) {
    return (
      <>
        <Topbar title="Calendar" crumb="OPERATE" />
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><CalendarClock size={22} /></div>
            <h3>No venue yet</h3>
            <p>Add a venue and a court to see its booking calendar.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        </div>
      </>
    );
  }

  const courts = (await getCourtsForVenues([activeVenue.id]));
  const courtIds = courts.map((c) => c.id);

  // pull a 14-day window around today for the calendar
  const from = new Date(); from.setDate(from.getDate() - 1);
  const to = new Date(); to.setDate(to.getDate() + 14);
  const bookings = await getBookingsInRange(courtIds, from.toISOString(), to.toISOString());
  const blocks = await getBlocksInRange(courtIds, from.toISOString(), to.toISOString());

  const sb = await createClient();
  const { data: hoursRows } = courtIds.length
    ? await sb.from("court_hours").select("*").in("court_id", courtIds)
    : { data: [] as CourtHours[] };
  const hoursByCourt: Record<string, CourtHours[]> = {};
  (hoursRows ?? []).forEach((h) => { (hoursByCourt[h.court_id] ??= []).push(h); });

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

  return (
    <>
      <Topbar title="Calendar" crumb={`OPERATE / ${activeVenue.name.toUpperCase()}`} />
      {venues.length > 1 && (
        <div className="adm-body" style={{ paddingBottom: 0 }}>
          <div className="adm-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            {venues.map((v) => (
              <Link key={v.id} href={`/admin/calendar?venue=${v.id}`}
                className={`adm-chip ${v.id === activeVenue.id ? "on" : ""}`}>
                {v.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      {courts.length === 0 ? (
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><CalendarClock size={22} /></div>
            <h3>No courts in {activeVenue.name}</h3>
            <p>Add a court and set its opening hours to start managing its calendar.</p>
            <Link href={`/admin/venues/${activeVenue.id}`} className="adm-btn primary">Manage venue</Link>
          </div>
        </div>
      ) : (
        <DayCalendar
          courts={courts}
          bookings={bookings}
          blocks={blocks}
          hoursByCourt={hoursByCourt}
          initialDate={todayStr}
        />
      )}
    </>
  );
}
