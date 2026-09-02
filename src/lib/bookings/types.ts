// Friendly messages for the Postgres exceptions raised by the booking
// self-service RPCs in supabase/venues/booking_self_service.sql — same
// pattern as src/lib/payments/types.ts's friendlyPaymentError().

export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_NOT_FOUND: "We couldn't find that booking.",
  FORBIDDEN: "That booking doesn't belong to you.",
  BOOKING_LOCKED:
    "This booking can't be changed here anymore — it's already paid for or has started. Ask the venue to help.",
  SLOT_TAKEN: "That time is already booked on that court.",
  SLOT_BLOCKED: "That time is blocked on that court.",
  "End time must be after start time": "The end time has to be after the start time.",
  "Court not found": "That court doesn't exist.",
};

export function friendlyBookingError(message: string): string {
  for (const code in BOOKING_ERROR_MESSAGES) {
    if (message.includes(code)) return BOOKING_ERROR_MESSAGES[code];
  }
  return message;
}
