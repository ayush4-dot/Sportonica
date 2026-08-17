// Shared "Play Together" types — mirrors supabase/play_together.sql exactly.
//
// Model: the host books and pays for the venue through KhelamNa upfront.
// Other players join for free and reimburse the host in cash at the venue —
// KhelamNa never collects, holds, or distributes player contributions.

export const GAME_STATUS = {
  AWAITING_PAYMENT: "awaiting_payment",
  PUBLISHED: "published",
  CANCELLED_BY_HOST: "cancelled_by_host",
} as const;
export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS];

// Mirrors SKILL_LABEL in src/lib/play/gameQueries.ts (the regular-events
// system) — same four values, so the two game types read consistently
// wherever they're mixed together (e.g. Discover's shared card grid).
export type SkillLevel = "any" | "beginner" | "intermediate" | "advanced";

// A "Join" tap only ever creates a 'requested' row (PENDING_HOST_APPROVAL).
// A player is NEVER a confirmed member just because the host approved the
// request — approval only opens a 2-hour payment window ('payment_pending').
// The player becomes 'joined' (CONFIRMED, added to the group) only once the
// host verifies their submitted payment proof. See supabase/
// play_together_payments.sql for the full state machine and backend
// enforcement of the deadline.
//
//   requested -> [host approves] -> payment_pending -> [player submits proof]
//     -> payment_verification_pending -> [host verifies] -> joined
//                                      -> [host rejects]  -> payment_rejected (may resubmit before deadline)
//   payment_pending / payment_rejected -> [deadline passes] -> expired
//   requested -> [host rejects] -> rejected
export type GamePlayerStatus =
  | "requested"
  | "payment_pending"
  | "payment_verification_pending"
  | "joined"
  | "left"
  | "rejected"
  | "payment_rejected"
  | "expired";
export type ContributionStatus = "pending" | "collected";
export type PlayTogetherPaymentMethod = "host_qr" | "esewa" | "khalti" | "bank_transfer" | "cash";

// The 2-hour window is set server-side (approve_join_request() in
// play_together_payments.sql) — this is only for client-side display math,
// never trusted to compute or extend an actual deadline.
export const PAYMENT_WINDOW_MINUTES = 120;

export interface Game {
  id: string;
  host_id: string;
  court_booking_id: string;
  venue_id: string;
  court_id: string;
  sport: string;
  game_format: string | null;
  starts_at: string;
  ends_at: string;
  min_players: number;
  max_players: number;
  contribution_amount: number;
  service_fee: number;
  joining_deadline: string;
  notes: string | null;
  // Informational only — nothing server-side checks a requester's actual
  // skill against this; it just helps a player judge fit before asking.
  skill_level: SkillLevel;
  cancel_reason: string | null;
  // The host's own eSewa/Khalti QR + phone — players pay the host
  // directly with these, never a KhelamNa QR.
  host_qr_path: string | null;
  host_phone: string | null;
  status: GameStatus;
  created_at: string;
  updated_at: string;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  status: GamePlayerStatus;
  contribution_amount: number;
  contribution_status: ContributionStatus;
  collected_at: string | null;
  joined_at: string;
  left_at: string | null;
  approved_at: string | null;
  payment_deadline: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_rejected_at: string | null;
  expired_at: string | null;
  payment_method: PlayTogetherPaymentMethod | null;
  transaction_id: string | null;
  payment_proof_path: string | null;
  payment_rejection_reason: string | null;
  payment_reminder_count: number;
  last_payment_reminder_at: string | null;
}

// Mirrors REJECTION_REASONS in src/lib/payments/types.ts — same pattern,
// scoped to a host rejecting a player's payment proof instead of an admin
// rejecting a booking payment.
export const PLAY_TOGETHER_PAYMENT_REJECTION_REASONS: Record<string, string> = {
  incorrect_amount: "Incorrect amount",
  invalid_transaction: "Invalid transaction ID",
  cannot_verify: "Payment cannot be verified",
  duplicate_proof: "Duplicate payment proof",
  other: "Other",
};

// The backend (submit/verify RPCs + the pg_cron sweep) is the real source
// of truth for expiry — this is only so the UI never shows a stale
// "payment pending, X remaining" for a row that's actually past its
// deadline just because nobody's re-fetched it since the cron last ran.
export function effectivePlayerStatus(row: Pick<GamePlayer, "status" | "payment_deadline">): GamePlayerStatus {
  if (
    (row.status === "payment_pending" || row.status === "payment_rejected") &&
    row.payment_deadline &&
    new Date(row.payment_deadline).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return row.status;
}

// A joined-and-active player available spot count — the host occupies one
// of max_players, so this is what's actually joinable.
export function availablePlayerSpots(game: Pick<Game, "max_players">): number {
  return Math.max(game.max_players - 1, 0);
}

// 'host-qr' is a public bucket, so this is a plain, stable URL — same
// shape as paymentQrPublicUrl() in src/lib/payments/types.ts.
export function hostQrPublicUrl(hostQrPath: string | null): string | null {
  if (!hostQrPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/host-qr/${hostQrPath}`;
}

// Click-to-chat link to a specific player's own number (not the platform's),
// e.g. so a host can message a requester before approving them. Same
// no-auth api.whatsapp.com/send pattern as whatsappNotifyUrl() in
// src/lib/payments/types.ts, just parameterized on the recipient.
export function playerWhatsappUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  const withCountryCode = digits.startsWith("977") ? digits : `977${digits}`;
  return `https://api.whatsapp.com/send?phone=${withCountryCode}&text=${encodeURIComponent(message)}`;
}

// Friendly messages for the Postgres exceptions raised by the RPCs in
// supabase/play_together.sql — keeps the mapping in one place instead of
// repeated inline string checks (mirrors src/lib/payments/types.ts).
export const PLAY_TOGETHER_ERROR_MESSAGES: Record<string, string> = {
  RISK_NOT_ACKNOWLEDGED: "Please confirm you understand the venue payment terms before continuing.",
  INVALID_CAPACITY: "Minimum players must be at least 1, and can't be more than the maximum.",
  INVALID_SKILL_LEVEL: "Pick a valid skill level.",
  DEADLINE_AFTER_START: "The joining deadline must be before the game starts.",
  STARTS_AT_IN_PAST: "That time has already passed. Pick a new time and try again.",
  DEADLINE_IN_PAST: "With this start time, the joining deadline would already be in the past. Pick a later start time or a shorter deadline window.",
  HOST_QR_REQUIRED: "Upload your payment QR so players know how to pay you.",
  HOST_PHONE_REQUIRED: "Add a phone number so players can reach you.",
  ALREADY_REVIEWED: "This request has already been reviewed.",
  GAME_NOT_FOUND: "We couldn't find that game.",
  JOINING_CLOSED: "Joining has closed for this game.",
  HOST_CANNOT_JOIN: "You're already hosting this game.",
  ALREADY_JOINED: "You've already joined this game.",
  GAME_FULL: "This game is full.",
  NOT_JOINED: "You haven't joined this game.",
  NOT_FOUND: "We couldn't find that player.",
  FORBIDDEN: "You don't have permission to do that.",
  ALREADY_CANCELLED: "This game has already been cancelled.",
  SLOT_TAKEN: "That time is already booked.",
  SLOT_BLOCKED: "That time is blocked.",
  INVALID_PAYMENT_STATE: "This request isn't awaiting payment right now.",
  PAYMENT_DEADLINE_EXPIRED: "Your payment window has expired. This request has been cancelled.",
  INVALID_PAYMENT_METHOD: "Pick a payment method.",
  TRANSACTION_ID_REQUIRED: "Enter the transaction ID from your payment.",
  PAYMENT_PROOF_REQUIRED: "Upload a screenshot of your payment.",
  NOT_AWAITING_VERIFICATION: "This payment isn't awaiting verification right now.",
  GAME_CANCELLED: "This game has been cancelled by the host.",
  TERMS_NOT_ACKNOWLEDGED: "Please agree to the Play Together Terms & Conditions to continue.",
  REJECTION_REASON_REQUIRED: "Pick a reason for rejecting this payment.",
};

export function friendlyPlayTogetherError(message: string): string {
  for (const code in PLAY_TOGETHER_ERROR_MESSAGES) {
    if (message.includes(code)) return PLAY_TOGETHER_ERROR_MESSAGES[code];
  }
  return message;
}
