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

export type GamePlayerStatus = "joined" | "left";
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

// Friendly messages for the Postgres exceptions raised by the RPCs in
// supabase/play_together.sql — keeps the mapping in one place instead of
// repeated inline string checks (mirrors src/lib/payments/types.ts).
export const PLAY_TOGETHER_ERROR_MESSAGES: Record<string, string> = {
  RISK_NOT_ACKNOWLEDGED: "Please confirm you understand the venue payment terms before continuing.",
  INVALID_CAPACITY: "Minimum players must be at least 1, and can't be more than the maximum.",
  DEADLINE_AFTER_START: "The joining deadline must be before the game starts.",
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
