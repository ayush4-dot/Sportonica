import EventForm from "@/components/EventForm";
import "./events.css";

export const dynamic = "force-dynamic";

export default function PlatformEventsPage() {
  return (
    <>
      <h1 className="plt-h1">Create platform event</h1>
      <p className="plt-sub2">A Sportonica-run event — a tournament, a league night, a city-wide game. Shows on discover with a platform badge.</p>
      <EventForm kind="platform_event" defaultOrganizer="Sportonica" />
    </>
  );
}
