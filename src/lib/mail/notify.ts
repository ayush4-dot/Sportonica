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
  paymentSubmitted, paymentApproved, paymentRejected,
} from "./templates";
import { REJECTION_REASONS, bookingLabel } from "@/lib/payments/types";

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

// ── Payment notifications ───────────────────────────────────────
async function paymentContext(paymentId: string) {
  const sb = await createClient();
  const { data: payment } = await sb.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return null;

  const label = bookingLabel(payment.booking_type, payment.court_booking_id ?? payment.event_booking_id);
  const customerName = await nameFor(payment.user_id);

  if (payment.booking_type === "court_booking") {
    const { data: booking } = await sb
      .from("court_bookings")
      .select("starts_at, ends_at, venue_id")
      .eq("id", payment.court_booking_id)
      .maybeSingle();
    const { data: venue } = booking?.venue_id
      ? await sb.from("venues").select("name").eq("id", booking.venue_id).maybeSingle()
      : { data: null };
    return {
      payment, label, customerName,
      venueName: venue?.name ?? "the venue",
      startsAt: booking?.starts_at ?? new Date().toISOString(),
      endsAt: booking?.ends_at ?? new Date().toISOString(),
    };
  }

  const { data: booking } = await sb
    .from("bookings")
    .select("event_id")
    .eq("id", payment.event_booking_id)
    .maybeSingle();
  const { data: event } = booking?.event_id
    ? await sb.from("events").select("venue, event_date, duration_mins").eq("id", booking.event_id).maybeSingle()
    : { data: null };
  const startsAt = event?.event_date ?? new Date().toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + (event?.duration_mins ?? 60) * 60000).toISOString();
  return {
    payment, label, customerName,
    venueName: event?.venue ?? "the venue",
    startsAt, endsAt,
  };
}

// A customer submitted proof of payment — tell every super-admin, both by
// email and via the in-app notifications table (NotificationBell renders
// it whenever they're not already on /platform, which hides its own bell).
export async function notifyPaymentSubmitted(paymentId: string) {
  const sb = await createClient();
  const ctx = await paymentContext(paymentId);
  if (!ctx) return;

  const { data: admins } = await sb.from("profiles").select("id").eq("role", "super_admin");
  if (!admins?.length) return;

  const adminEmails = await Promise.all(admins.map((a) => emailFor(a.id)));
  const mails = adminEmails
    .filter((e): e is string => !!e)
    .map((to) => paymentSubmitted({
      to, bookingLabel: ctx.label, customerName: ctx.customerName,
      amount: ctx.payment.expected_amount, method: ctx.payment.payment_method,
      transactionId: ctx.payment.transaction_id,
    }));
  if (mails.length) await sendMail(mails);

  await sb.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      kind: "payment_submitted",
      title: `New payment to verify — ${ctx.label}`,
      body: `${ctx.customerName} · ${ctx.payment.payment_method} · Rs ${Math.round(ctx.payment.expected_amount)}`,
    }))
  );
}

// Admin approved or rejected — tell the customer both ways, never silently.
export async function notifyPaymentReviewed(paymentId: string) {
  const sb = await createClient();
  const ctx = await paymentContext(paymentId);
  if (!ctx) return;

  const [to, playerName] = await Promise.all([emailFor(ctx.payment.user_id), Promise.resolve(ctx.customerName)]);

  if (ctx.payment.status === "APPROVED") {
    if (to) {
      await sendMail(paymentApproved({
        to, playerName, bookingLabel: ctx.label, amount: ctx.payment.expected_amount,
        venue: ctx.venueName, startsAt: ctx.startsAt, endsAt: ctx.endsAt,
      }));
    }
    await sb.from("notifications").insert({
      user_id: ctx.payment.user_id,
      kind: "payment_approved",
      title: "Booking confirmed",
      body: `Your payment of Rs ${Math.round(ctx.payment.expected_amount)} for ${ctx.label} has been verified.`,
    });
  } else if (ctx.payment.status === "REJECTED") {
    const reason = REJECTION_REASONS[ctx.payment.rejection_reason ?? "other"] ?? "Payment could not be verified";
    if (to) {
      await sendMail(paymentRejected({ to, playerName, bookingLabel: ctx.label, reason }));
    }
    await sb.from("notifications").insert({
      user_id: ctx.payment.user_id,
      kind: "payment_rejected",
      title: "Payment verification failed",
      body: `${ctx.label}: ${reason}. Please submit a valid payment or contact support.`,
    });
  }
}
