import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyGamesClient from "./MyGamesClient";

export const dynamic = "force-dynamic";

export default async function MyGamesPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?redirect=/my-games");

  // Games this person is hosting.
  const { data: hostedEvents } = await sb
    .from("events_with_counts")
    .select("*")
    .eq("host_id", user.id)
    .order("event_date", { ascending: true });

  // Play Together games they host — a separate table (src/lib/playTogether/),
  // but shown in the same "Hosting" list as regular hosted events rather
  // than a separate page/section, so a host has one place to see everything
  // that needs their attention (including pending join requests).
  const { data: hostedPlayTogetherRaw } = await sb
    .from("games")
    .select("id, sport, game_format, starts_at, contribution_amount, max_players, venues(name)")
    .eq("host_id", user.id)
    .in("status", ["published", "awaiting_payment"])
    .order("starts_at", { ascending: true });
  const hostedPlayTogether = hostedPlayTogetherRaw as unknown as {
    id: string; sport: string; game_format: string | null; starts_at: string;
    contribution_amount: number; max_players: number; venues: { name: string } | null;
  }[] | null;

  const gameIds = (hostedPlayTogether ?? []).map((g) => g.id);
  const { data: gamePlayers } = gameIds.length
    ? await sb.from("game_players").select("game_id, status").in("game_id", gameIds)
    : { data: [] };
  const joinedCountByGame = new Map<string, number>();
  const pendingCountByGame = new Map<string, number>();
  (gamePlayers ?? []).forEach((p) => {
    if (p.status === "joined") joinedCountByGame.set(p.game_id, (joinedCountByGame.get(p.game_id) ?? 0) + 1);
    if (p.status === "requested") pendingCountByGame.set(p.game_id, (pendingCountByGame.get(p.game_id) ?? 0) + 1);
  });

  const hosted = [
    ...(hostedEvents ?? []),
    ...(hostedPlayTogether ?? []).map((g) => {
      const joined = joinedCountByGame.get(g.id) ?? 0;
      return {
        id: g.id,
        title: g.game_format ? `${g.sport} · ${g.game_format}` : g.sport,
        venue: g.venues?.name ?? "Venue",
        sport: g.sport,
        event_date: g.starts_at,
        fee: Number(g.contribution_amount) || 0,
        max_players: g.max_players,
        confirmed_count: joined + 1,
        slots_remaining: Math.max(g.max_players - 1 - joined, 0),
        kind: "play_together" as const,
        pendingRequests: pendingCountByGame.get(g.id) ?? 0,
      };
    }),
  ].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  // Games they joined (but don't host). payment_status rides along so the
  // "Playing" tab can flag a still-unverified or rejected payment;
  // player_name/phone/position so they can fix a typo in their own entry.
  const { data: myBookings } = await sb
    .from("bookings")
    .select("id, event_id, payment_status, player_name, phone, position")
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
    (myBookings ?? []).map((b) => [b.event_id, {
      bookingId: b.id, paymentStatus: b.payment_status,
      playerName: b.player_name ?? null, phone: b.phone ?? null, position: b.position ?? null,
    }])
  );

  // Pending invites on the hosted events (invites only apply to regular
  // hosted events, not Play Together games — those use join requests).
  const hostedEventIds = (hostedEvents ?? []).map((e) => e.id);
  const { data: invites } = hostedEventIds.length
    ? await sb.from("invites").select("*").in("event_id", hostedEventIds)
    : { data: [] };

  // Direct court/venue bookings (BookingFlow → court_bookings) — these have
  // no `events` row at all, so they were previously invisible here.
  // court_id/venue_id/customer_name/phone let the card offer an edit +
  // reschedule flow (src/lib/bookings/actions.ts).
  const { data: courtBookings } = await sb
    .from("court_bookings")
    .select("id, court_id, venue_id, customer_name, phone, starts_at, ends_at, price, state, payment_status, courts(name, sport), venues(name)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(50);

  // Courts at every venue the person has a booking with — powers the
  // "move to another court" option in the edit sheet.
  const bookingVenueIds = [...new Set((courtBookings ?? []).map((b) => b.venue_id).filter(Boolean))];
  const { data: venueCourts } = bookingVenueIds.length
    ? await sb.from("courts").select("id, name, sport, venue_id").in("venue_id", bookingVenueIds)
    : { data: [] };

  return (
    <MyGamesClient
      hosted={hosted ?? []}
      joined={(joined ?? []).map((g) => {
        const p = paymentByEvent.get(g.id);
        return {
          ...g,
          paymentStatus: p?.paymentStatus ?? "paid",
          bookingId: p?.bookingId ?? null,
          myPlayerName: p?.playerName ?? null,
          myPhone: p?.phone ?? null,
          myPosition: p?.position ?? null,
        };
      })}
      invites={invites ?? []}
      courtBookings={(courtBookings ?? []) as unknown as CourtBookingRow[]}
      venueCourts={(venueCourts ?? []) as unknown as CourtOption[]}
    />
  );
}

export type CourtOption = { id: string; name: string; sport: string; venue_id: string };

export type CourtBookingRow = {
  id: string;
  court_id: string;
  venue_id: string;
  customer_name: string | null;
  phone: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  state: string;
  payment_status: string;
  courts: { name: string; sport: string } | null;
  venues: { name: string } | null;
};
