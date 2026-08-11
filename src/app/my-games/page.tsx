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

  // Games they joined (but don't host). payment_status rides along so the
  // "Playing" tab can flag a still-unverified or rejected payment.
  const { data: myBookings } = await sb
    .from("bookings")
    .select("id, event_id, payment_status")
    .eq("user_id", user.id)
    .eq("status", "confirmed");

  const joinedIds = (myBookings ?? []).map((b) => b.event_id);
  const { data: joined } = joinedIds.length
    ? await sb
        .from("events_with_counts")
        .select("*")
        .in("id", joinedIds)
        .neq("host_id", user.id)
        .order("event_date", { ascending: true })
    : { data: [] };
  const paymentByEvent = new Map(
    (myBookings ?? []).map((b) => [b.event_id, { bookingId: b.id, paymentStatus: b.payment_status }])
  );

  // Pending invites on the hosted games.
  const hostedIds = (hosted ?? []).map((e: { id: string }) => e.id);
  const { data: invites } = hostedIds.length
    ? await sb.from("invites").select("*").in("event_id", hostedIds)
    : { data: [] };

  // Direct court/venue bookings (BookingFlow → court_bookings) — these have
  // no `events` row at all, so they were previously invisible here.
  const { data: courtBookings } = await sb
    .from("court_bookings")
    .select("id, starts_at, ends_at, price, state, payment_status, courts(name, sport), venues(name)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(50);

  return (
    <MyGamesClient
      hosted={hosted ?? []}
      joined={(joined ?? []).map((g) => ({
        ...g,
        paymentStatus: paymentByEvent.get(g.id)?.paymentStatus ?? "paid",
        bookingId: paymentByEvent.get(g.id)?.bookingId ?? null,
      }))}
      invites={invites ?? []}
      courtBookings={(courtBookings ?? []) as unknown as CourtBookingRow[]}
    />
  );
}

export type CourtBookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  price: number;
  state: string;
  payment_status: string;
  courts: { name: string; sport: string } | null;
  venues: { name: string } | null;
};
