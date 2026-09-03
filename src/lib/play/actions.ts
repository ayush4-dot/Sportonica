"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyGameJoined } from "@/lib/mail/notify";
import { actionError, safeActionError } from "@/lib/actionError";
import { isValidLocalPhone } from "@/lib/validation/identity";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// Hosting a game from a court booking ("need players") used to live here —
// it created the public event and emailed "your game is live" immediately
// at booking time, before the court payment was ever verified. That logic
// now lives entirely server-side in maybe_publish_hosted_event()
// (supabase/payments/payments.sql), invoked only once payment is approved (or
// instantly for a free court) — see bookCourt() in src/lib/admin/actions.ts
// and confirmFreeBooking()/reviewPayment() in src/lib/payments/.

// Join an existing game — inserts a confirmed booking row (the view counts
// these for slots_remaining). Blocks double-joining and full games.
//
// `amount` is intentionally NOT an input here — a Server Action is reachable
// by direct POST, so a client-supplied price could be tampered with (the
// exact "customer changes a Rs 2,500 booking into Rs 100" scenario). The fee
// is always read fresh from `events.fee`, never trusted from the caller.
export async function joinGame(input: {
  event_id: string;
  // kept in the type for call-site compatibility but no longer trusted —
  // venue_id and sport are read from the event row server-side below.
  venue_id?: string | null;
  sport?: string;
  player_name?: string;
  position?: string;
  phone?: string;
}) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const phone = input.phone?.trim() || null;
  if (phone && !isValidLocalPhone(phone)) {
    return actionError("Phone number must contain exactly 10 digits.");
  }

  // Already joined?
  const { data: existing } = await sb
    .from("bookings")
    .select("id")
    .eq("event_id", input.event_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return actionError("ALREADY_JOINED");

  // Full? Check the view's remaining count. Also the source of truth for
  // the fee — never trust a client-supplied amount.
  const { data: ev } = await sb
    .from("events_with_counts")
    .select("slots_remaining, fee, venue_id, sport")
    .eq("id", input.event_id)
    .single();
  if (!ev) return actionError("We couldn't find that game.");
  if (ev.slots_remaining <= 0) return actionError("GAME_FULL");
  const amount = Number(ev.fee) || 0;

  const name =
    input.player_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Player";

  const { data: booking, error } = await sb.from("bookings").insert({
    event_id: input.event_id,
    user_id: user.id,
    status: "confirmed",
    venue_id: ev.venue_id ?? null,
    sport: ev.sport ?? null,
    amount,
    payment_status: amount > 0 ? "unpaid" : "paid",
    player_name: name,
    position: input.position ?? null,
    phone,
  }).select().single();
  if (error) return safeActionError(error, "Could not join this game. Please try again.");

  revalidatePath("/discover");

  // A paid join isn't real until admin approves the payment —
  // notifyPaymentReviewed() (src/lib/mail/notify.ts) sends the "you're
  // in, payment verified" email then. Telling the joiner "Paid Rs X" and
  // the host "someone joined" here, before any payment was even
  // submitted, is exactly the premature-confirmation bug this fixes.
  // Free joins are confirmed immediately (confirmFreeBooking), so it's
  // safe to notify right away.
  if (amount === 0) {
    await notifyGameJoined({ joinerId: user.id, eventId: input.event_id });
  }

  return booking;
}
