"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, type ActionError } from "@/lib/actionError";
import { friendlyBookingError } from "./types";
import { notifyBookingChanged } from "@/lib/mail/notify";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

export type EditCourtBookingInput = {
  id: string;
  customerName?: string | null;
  phone?: string | null;
  courtId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

type CourtBookingRow = {
  id: string;
  court_id: string;
  venue_id: string;
  starts_at: string;
  ends_at: string;
  price: number;
  state: string;
  payment_status: string | null;
};

// Fix a court booking's contact details, or move it to another slot.
// The RPC decides what's allowed: contact fields any time, date/court
// only while unpaid/rejected for the booker (any time for venue staff).
export async function editCourtBooking(
  input: EditCourtBookingInput
): Promise<CourtBookingRow | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const { data, error } = await sb.rpc("edit_court_booking", {
    p_id: input.id,
    p_customer_name: input.customerName ?? null,
    p_phone: input.phone ?? null,
    p_court_id: input.courtId ?? null,
    p_starts_at: input.startsAt ?? null,
    p_ends_at: input.endsAt ?? null,
  });
  if (error) return actionError(friendlyBookingError(error.message));

  const row = data as CourtBookingRow;
  revalidatePath("/my-games");
  revalidatePath(`/admin/venues/${row.venue_id}/bookings`);
  revalidatePath(`/admin/bookings`);

  const timeChanged =
    (input.startsAt != null || input.courtId != null) && row.payment_status === "paid";
  const details: string[] = [];
  if (timeChanged) details.push("This booking's time or court was changed.");
  if (input.customerName != null || input.phone != null) details.push("Contact details were updated.");
  if (details.length) {
    await notifyBookingChanged({ kind: "court", bookingId: row.id, action: "edited", details });
  }

  return row;
}

export async function cancelCourtBooking(
  id: string
): Promise<CourtBookingRow | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // Grab the paid-state before cancelling so we know whether to notify.
  const { data: before } = await sb
    .from("court_bookings").select("payment_status").eq("id", id).maybeSingle();

  const { data, error } = await sb.rpc("cancel_court_booking", { p_id: id });
  if (error) return actionError(friendlyBookingError(error.message));

  const row = data as CourtBookingRow;
  revalidatePath("/my-games");
  revalidatePath(`/admin/venues/${row.venue_id}/bookings`);
  revalidatePath(`/admin/bookings`);

  if (before?.payment_status === "paid") {
    await notifyBookingChanged({
      kind: "court", bookingId: row.id, action: "cancelled",
      details: ["The player cancelled this booking."],
    });
  }
  return row;
}

export type EditGameJoinInput = {
  bookingId: string;
  playerName?: string | null;
  phone?: string | null;
  position?: string | null;
};

export async function editGameJoin(input: EditGameJoinInput): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const { error } = await sb.rpc("edit_game_join", {
    p_booking_id: input.bookingId,
    p_player_name: input.playerName ?? null,
    p_phone: input.phone ?? null,
    p_position: input.position ?? null,
  });
  if (error) return actionError(friendlyBookingError(error.message));

  revalidatePath("/my-games");
  revalidatePath("/discover");
  await notifyBookingChanged({
    kind: "event_join", bookingId: input.bookingId, action: "edited",
    details: ["A player updated their details."],
  });
}

export async function cancelGameJoin(bookingId: string): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  // Read what the notification needs before the RPC deletes the row.
  const { data: before } = await sb
    .from("bookings")
    .select("event_id, player_name, user_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  const { error } = await sb.rpc("cancel_game_join", { p_booking_id: bookingId });
  if (error) return actionError(friendlyBookingError(error.message));

  revalidatePath("/my-games");
  revalidatePath("/discover");

  if (before?.status === "confirmed") {
    await notifyBookingChanged({
      kind: "event_join", bookingId, action: "cancelled",
      details: ["A player left the game."],
      joinContext: {
        eventId: before.event_id,
        playerName: before.player_name ?? null,
        userId: before.user_id ?? null,
      },
    });
  }
}
