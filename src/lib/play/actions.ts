"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyGameHosted, notifyGameJoined } from "@/lib/mail/notify";
import { sportColor, normalizeSport } from "@/lib/sports";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

// Host a game: creates an `events` row (shows on /discover) and enrolls the
// host as the first confirmed player in `bookings`. Called after a court is
// booked with "need players" on. Ties back to the venue via venue_id.
export async function hostGameFromBooking(input: {
  venue_id: string;
  venue_name: string;
  sport: string;
  court_name: string;
  starts_at: string;      // ISO
  total_price: number;    // full court price
  spots_needed: number;   // how many others they want
  venue_lat?: number | null;
  venue_lng?: number | null;
  title?: string;
  skill_level?: string;
  bring_own_gear?: boolean;
  notes?: string;
}) {
  const { sb, user } = await requireUser();

  const maxPlayers = input.spots_needed + 1; // host + others
  const perHead = Math.round(input.total_price / maxPlayers);
  const hostName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Host";

  // Pull the venue's stored location so the event carries real coordinates
  // (used by discover to open Google Maps). Eco-friendly: no geocoding.
  const { data: venue } = await sb
    .from("venues")
    .select("lat, lng")
    .eq("id", input.venue_id)
    .single();
  const lat = input.venue_lat ?? venue?.lat ?? null;
  const lng = input.venue_lng ?? venue?.lng ?? null;

  // 1) Create the event
  const { data: event, error: evErr } = await sb
    .from("events")
    .insert({
      host_id: user.id,
      sport: input.sport,
      title: input.title ?? `${input.sport} at ${input.venue_name}`,
      venue: input.venue_name,
      venue_id: input.venue_id,
      venue_lat: lat,
      venue_lng: lng,
      skill_level: input.skill_level ?? "any",
      bring_own_gear: input.bring_own_gear ?? false,
      notes: input.notes ?? null,
      event_date: input.starts_at,
      max_players: maxPlayers,
      min_players: 2,
      fee: perHead,
      description: `${input.court_name} · Rs ${perHead}/head. Booked on Khelam Na.`,
      status: "open",
      flash: false,
      sport_color: sportColor(normalizeSport(input.sport)),
    })
    .select()
    .single();

  if (evErr) throw new Error(evErr.message);

  // 2) Enroll the host as the first confirmed player
  const { error: bkErr } = await sb.from("bookings").insert({
    event_id: event.id,
    user_id: user.id,
    status: "confirmed",
    venue_id: input.venue_id,
    sport: input.sport,
    court: input.court_name,
    amount: perHead,
    payment_status: "paid",
    player_name: hostName,
  });
  if (bkErr) throw new Error(bkErr.message);

  revalidatePath("/discover");

  // Tell the host their game is live and shareable.
  await notifyGameHosted({
    hostId: user.id,
    sport: input.sport,
    venue: input.venue_name,
    startsAt: input.starts_at,
    spots: input.spots_needed,
    perHead: perHead,
    origin: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });

  return event;
}

// Join an existing game — inserts a confirmed booking row (the view counts
// these for slots_remaining). Blocks double-joining and full games.
export async function joinGame(input: {
  event_id: string;
  venue_id: string | null;
  sport: string;
  player_name?: string;
  position?: string;
  amount: number;
}) {
  const { sb, user } = await requireUser();

  // Already joined?
  const { data: existing } = await sb
    .from("bookings")
    .select("id")
    .eq("event_id", input.event_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) throw new Error("ALREADY_JOINED");

  // Full? Check the view's remaining count.
  const { data: ev } = await sb
    .from("events_with_counts")
    .select("slots_remaining")
    .eq("id", input.event_id)
    .single();
  if (ev && ev.slots_remaining <= 0) throw new Error("GAME_FULL");

  const name =
    input.player_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Player";

  const { error } = await sb.from("bookings").insert({
    event_id: input.event_id,
    user_id: user.id,
    status: "confirmed",
    venue_id: input.venue_id,
    sport: input.sport,
    amount: input.amount,
    payment_status: "paid",
    player_name: name,
    position: input.position ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/discover");

  // Confirm to the joiner, and let the host know someone's in.
  await notifyGameJoined({ joinerId: user.id, eventId: input.event_id });
}
