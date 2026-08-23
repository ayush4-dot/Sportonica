import { redirect } from "next/navigation";

// Events was folded into Tournaments (as the 'single_event' format) —
// this route is kept as a redirect for anything still linking here.
export default function AdminEventsPage() {
  redirect("/admin/tournaments/new");
}
