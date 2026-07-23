// ================================================================
// Notifications: the "who gets told what" layer.
//
// This sits between your actions (booking, joining) and the mailer.
// Actions call these; they gather the right recipients, pick a
// template, and hand it to sendMail. Nothing here knows about SMTP.
// ================================================================

import { createClient } from "@/lib/supabase/server";
import { sendMail } from "./mailer";
import {
  playerBooked, venueNewBooking, hostGameLive, playerJoined, hostSomeoneJoined,
} from "./templates";

// Emails live in auth.users, not profiles — so we need the admin API to
// read them. Falls back to null rather than throwing: a missing email
// should never break a booking.
async function emailFor(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.email ?? null;
  } catch {
    return null;
  }
}

async function nameFor(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Player";
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("full_name, name").eq("id", userId).maybeSingle();
  return data?.full_name ?? data?.name ?? "Player";
}

// ── A court was booked ──────────────────────────────────────────
export async function notifyCourtBooked(input: {
  playerId: string | null;
  venueId: string;
  courtName: string;
  startsAt: string;
  endsAt: string;
  price: number;
  customerName?: string | null;
}) {
  const sb = await createClient();

  const { data: venue } = await sb
    .from("venues").select("name, owner_id").eq("id", input.venueId).maybeSingle();
  if (!venue) return;

  const [playerEmail, ownerEmail, playerName] = await Promise.all([
    emailFor(input.playerId),
    emailFor(venue.owner_id),
    input.customerName ? Promise.resolve(input.customerName) : nameFor(input.playerId),
  ]);

  const mails = [];
  if (playerEmail) {
    mails.push(playerBooked({
      to: playerEmail, playerName, venue: venue.name, court: input.courtName,
      startsAt: input.startsAt, endsAt: input.endsAt, price: input.price,
    }));
  }
  if (ownerEmail) {
    mails.push(venueNewBooking({
      to: ownerEmail, venue: venue.name, court: input.courtName,
      playerName, startsAt: input.startsAt, price: input.price,
    }));
  }
  if (mails.length) await sendMail(mails);
}

// ── A host opened a game to players ─────────────────────────────
export async function notifyGameHosted(input: {
  hostId: string;
  sport: string;
  venue: string;
  startsAt: string;
  spots: number;
  perHead: number;
  origin: string;
}) {
  const [to, hostName] = await Promise.all([emailFor(input.hostId), nameFor(input.hostId)]);
  if (!to) return;
  await sendMail(hostGameLive({
    to, hostName, sport: input.sport, venue: input.venue,
    startsAt: input.startsAt, spots: input.spots, perHead: input.perHead,
    link: `${input.origin}/discover`,
  }));
}

// ── Someone joined a game ───────────────────────────────────────
export async function notifyGameJoined(input: {
  joinerId: string;
  eventId: string;
}) {
  const sb = await createClient();

  const { data: ev } = await sb
    .from("events_with_counts")
    .select("host_id, sport, venue, event_date, fee, slots_remaining")
    .eq("id", input.eventId)
    .maybeSingle();
  if (!ev) return;

  const [joinerEmail, joinerName, hostEmail, hostName] = await Promise.all([
    emailFor(input.joinerId), nameFor(input.joinerId),
    emailFor(ev.host_id), nameFor(ev.host_id),
  ]);

  const mails = [];
  if (joinerEmail) {
    mails.push(playerJoined({
      to: joinerEmail, playerName: joinerName, sport: ev.sport,
      venue: ev.venue, startsAt: ev.event_date, fee: Number(ev.fee) || 0,
    }));
  }
  // Don't email the host about their own join.
  if (hostEmail && ev.host_id !== input.joinerId) {
    mails.push(hostSomeoneJoined({
      to: hostEmail, hostName, joinerName, sport: ev.sport,
      startsAt: ev.event_date, spotsLeft: Number(ev.slots_remaining) || 0,
    }));
  }
  if (mails.length) await sendMail(mails);
}
