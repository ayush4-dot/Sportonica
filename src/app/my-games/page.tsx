import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyGamesClient from "./MyGamesClient";

export const dynamic = "force-dynamic";

export default async function MyGamesPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Games this person is hosting.
  const { data: hosted } = await sb
    .from("events_with_counts")
    .select("*")
    .eq("host_id", user.id)
    .order("event_date", { ascending: true });

  // Games they joined (but don't host).
  const { data: myBookings } = await sb
    .from("bookings")
    .select("event_id")
    .eq("user_id", user.id)
    .eq("status", "confirmed");

  const joinedIds = (myBookings ?? []).map((b: { event_id: string }) => b.event_id);
  const { data: joined } = joinedIds.length
    ? await sb
        .from("events_with_counts")
        .select("*")
        .in("id", joinedIds)
        .neq("host_id", user.id)
        .order("event_date", { ascending: true })
    : { data: [] };

  // Pending invites on the hosted games.
  const hostedIds = (hosted ?? []).map((e: { id: string }) => e.id);
  const { data: invites } = hostedIds.length
    ? await sb.from("invites").select("*").in("event_id", hostedIds)
    : { data: [] };

  return (
    <MyGamesClient
      hosted={hosted ?? []}
      joined={joined ?? []}
      invites={invites ?? []}
    />
  );
}
