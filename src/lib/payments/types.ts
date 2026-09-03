// Shared payment enums/types — the "consistent enums, not random strings"
// source of truth for both the customer checkout UI and the /platform
// verification console. Mirrors supabase/payments/payments.sql exactly.

export const PAYMENT_METHODS = ["esewa", "khalti", "fonepay", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUS = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export type BookingType = "court_booking" | "event_booking" | "tournament_registration";

export const REJECTION_REASONS: Record<string, string> = {
  incorrect_amount: "Incorrect amount",
  invalid_transaction_id: "Invalid transaction ID",
  payment_not_found: "Payment not found",
  duplicate_payment: "Duplicate payment",
  screenshot_unclear: "Screenshot unclear",
  other: "Other",
};
export type RejectionReason = keyof typeof REJECTION_REASONS;

export interface PaymentMethodConfig {
  id: string;
  method: PaymentMethod;
  enabled: boolean;
  merchant_name: string;
  account_identifier: string | null;
  qr_path: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Payment {
  id: string;
  booking_type: BookingType;
  court_booking_id: string | null;
  event_booking_id: string | null;
  tournament_registration_id: string | null;
  venue_id: string | null;
  user_id: string;
  payment_method: PaymentMethod;
  merchant_account_snapshot: string | null;
  expected_amount: number;
  transaction_id: string;
  screenshot_path: string;
  status: PaymentStatus;
  rejection_reason: RejectionReason | null;
  rejection_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentAuditLog {
  id: string;
  payment_id: string;
  action: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  performed_by: string | null;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  created_at: string;
}

// Friendly messages for the Postgres exceptions raised by submit_payment()/
// review_payment()/confirm_free_booking() in supabase/payments/payments.sql — keeps
// the mapping in one place instead of repeated inline string checks.
export const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_NOT_FOUND: "We couldn't find that booking.",
  NOT_YOUR_BOOKING: "That booking doesn't belong to you.",
  BOOKING_CANCELLED: "This booking was cancelled and can no longer be paid for.",
  BOOKING_ALREADY_PAID: "This booking has already been paid for.",
  BOOKING_NOT_FREE: "This booking isn't free — a payment is required.",
  PAYMENT_ALREADY_PENDING: "A payment for this booking is already awaiting verification.",
  PAYMENT_METHOD_DISABLED: "That payment method isn't available right now — try the other one.",
  DUPLICATE_TRANSACTION_ID: "This transaction ID has already been used for another payment.",
  TRANSACTION_ID_REQUIRED: "Enter the transaction/reference ID from your payment app.",
  SCREENSHOT_REQUIRED: "Upload a screenshot of your payment.",
  INVALID_BOOKING_TYPE: "Something went wrong with this booking. Please try again.",
  FORBIDDEN: "You don't have permission to do that.",
  PAYMENT_NOT_FOUND: "We couldn't find that payment.",
  ALREADY_REVIEWED: "This payment has already been reviewed.",
  BOOKING_NO_LONGER_VALID: "This booking was cancelled since the payment was submitted — it can't be approved.",
  SLOT_ALREADY_BOOKED: "Another payment for this time slot was already approved — reject this one.",
  REJECTION_REASON_REQUIRED: "Pick a reason before rejecting a payment.",
  INVALID_ACTION: "Something went wrong. Please try again.",
};

export function friendlyPaymentError(message: string): string {
  for (const code in PAYMENT_ERROR_MESSAGES) {
    if (message.includes(code)) return PAYMENT_ERROR_MESSAGES[code];
  }
  return message;
}

// Short cosmetic label for display only ("BK-A1B2C3D4") — the DB has no
// short-code system, bookings are plain UUIDs. Shared by the client
// checkout UI, the admin review table, and email/notification copy so
// the same booking always shows the same label everywhere.
export function bookingLabel(bookingType: BookingType, bookingId: string): string {
  const prefix = bookingType === "court_booking" ? "BK" : bookingType === "tournament_registration" ? "TR" : "GM";
  return `${prefix}-${bookingId.slice(0, 8).toUpperCase()}`;
}

// No WhatsApp Business/Twilio account is configured, so there's no way to
// push a message automatically yet — this is a click-to-chat link
// (api.whatsapp.com's documented, no-auth "send" endpoint), not a live
// send. It opens the admin's own WhatsApp with the message pre-filled;
// they still tap Send. Swap for a real provider call later without
// touching any call site — everything here just builds a URL.
const ADMIN_WHATSAPP_NUMBER = "9779805672621"; // +977 (Nepal) 9805672621

export function whatsappNotifyUrl(message: string): string {
  return `https://api.whatsapp.com/send?phone=${ADMIN_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
}

// 'payment-qr' is a public bucket, so this is a plain, stable URL — no
// signed-URL round trip needed (unlike payment-proofs, which is private).
export function paymentQrPublicUrl(qrPath: string | null): string | null {
  if (!qrPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/payment-qr/${qrPath}`;
}
