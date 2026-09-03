// Friendly messages for the Postgres exceptions raised by book_court()
// (supabase/booking_payment_gated.sql) and the no-double-booking
// exclusion constraint (supabase/booking_no_double.sql) — same pattern
// as src/lib/payments/types.ts's friendlyPaymentError().

export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  SLOT_TAKEN: "That time is already booked on that court.",
  SLOT_BLOCKED: "That time is blocked on that court.",
  SLOT_IN_PAST: "That time has already passed. Pick a later slot.",
  NOT_VENUE_STAFF: "Only venue staff can add a booking that way.",
  PHONE_INVALID: "Phone number must contain exactly 10 digits.",
  // Postgres exclusion_violation from court_bookings_no_overlap — another
  // booker's payment was approved for this slot first.
  "23P01": "Sorry, this time slot has just been booked by another user. Please choose another time.",
  court_bookings_no_overlap:
    "Sorry, this time slot has just been booked by another user. Please choose another time.",
  "End time must be after start time": "The end time has to be after the start time.",
  "Court not found": "That court doesn't exist.",
};

export function friendlyBookingError(message: string): string {
  for (const code in BOOKING_ERROR_MESSAGES) {
    if (message.includes(code)) return BOOKING_ERROR_MESSAGES[code];
  }
  return message;
}
