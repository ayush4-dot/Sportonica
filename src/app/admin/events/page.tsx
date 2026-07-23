import { getMyVenues } from "@/lib/admin/queries";
import { createClient } from "@/lib/supabase/server";
import EventForm from "@/components/EventForm";
import { Topbar } from "../ui";
import "../../platform/events/events.css";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const venues = await getMyVenues();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = user
    ? await sb.from("profiles").select("full_name, name").eq("id", user.id).maybeSingle()
    : { data: null };

  const organizer = venues[0]?.name ?? profile?.full_name ?? profile?.name ?? "Venue";

  return (
    <>
      <Topbar title="Create event" crumb="MANAGE / EVENTS" />
      <div className="adm-body">
        <p style={{ opacity: 0.6, fontSize: 13.5, marginBottom: 20, maxWidth: 520 }}>
          Run an official event at your venue — a tournament, ladies&apos; night, or league.
          It appears on discover with an <b>Official</b> badge and players can join directly.
        </p>
        {venues.length === 0 ? (
          <div className="ev-card" style={{ maxWidth: 520 }}>
            <p style={{ margin: 0, fontSize: 14 }}>List and get a venue approved first, then you can run events there.</p>
          </div>
        ) : (
          <EventForm
            kind="venue_event"
            venues={venues.map((v) => ({ id: v.id, name: v.name }))}
            defaultOrganizer={organizer}
          />
        )}
      </div>
    </>
  );
}
