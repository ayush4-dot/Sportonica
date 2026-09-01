import Link from "next/link";
import { Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyVenues, getCourtsForVenues } from "@/lib/admin/queries";
import type { CourtBooking } from "@/lib/admin/types";
import { Topbar } from "../ui";
import BookingsTable from "./BookingsTable";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const venues = await getMyVenues();
  const venueIds = venues.map((v) => v.id);
  const courts = await getCourtsForVenues(venueIds);

  const sb = await createClient();
  const { data } = venueIds.length
    ? await sb.from("court_bookings").select("*").in("venue_id", venueIds).order("starts_at", { ascending: false }).limit(200)
    : { data: [] as CourtBooking[] };
  const bookings = (data as CourtBooking[]) ?? [];

  return (
    <>
      <Topbar title="Bookings" crumb="OPERATE" />
      <div className="adm-body">
        {venueIds.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty-icon"><Ticket size={22} /></div>
            <h3>No bookings yet</h3>
            <p>Once you add a venue and start taking bookings, they&apos;ll all show up here.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        ) : (
          <BookingsTable bookings={bookings} courts={courts} />
        )}
      </div>
    </>
  );
}
