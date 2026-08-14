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

// A "Join" tap only ever creates a 'requested' row — the host must
// explicitly approve it before the player is actually in. That's the
// only point the player is notified or counted toward capacity.
export type GamePlayerStatus = "requested" | "joined" | "left" | "rejected";
export type ContributionStatus = "pending" | "collected";

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
  DEADLINE_AFTER_START: "The joining deadline must be before the game starts.",
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
};

export function friendlyPlayTogetherError(message: string): string {
  for (const code in PLAY_TOGETHER_ERROR_MESSAGES) {
    if (message.includes(code)) return PLAY_TOGETHER_ERROR_MESSAGES[code];
  }
  return message;
}
