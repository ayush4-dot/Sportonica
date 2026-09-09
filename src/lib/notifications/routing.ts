import type { Notification } from "@/lib/hooks/useNotifications";

/* Where a notification takes you when tapped, and which filter bucket
   it belongs to. Shared by the bell dropdown and the /notifications
   page so the two never drift apart. */

// Host-facing Play Together kinds land on the manage console (where the
// approve / verify actions live); every other game_id notification —
// including all the payment-reminder kinds — goes to the player's game
// page, which auto-opens the pay / upload-proof popup itself.
const HOST_FACING: Notification["kind"][] = [
  "game_join_requested",
  "game_host_payment_submitted",
  "game_host_payment_expired",
  "game_payment_cash_selected",
];

export function notificationHref(n: Notification): string {
  if (n.kind === "friend_request" || n.kind === "friend_accepted") return "/players";
  if (n.conversation_id) return `/messages/${n.conversation_id}`;
  if (n.squad_id) return `/league/${n.squad_id}`;
  if (n.game_id) return HOST_FACING.includes(n.kind) ? `/play-together/${n.game_id}/manage` : `/play-together/${n.game_id}`;
  if (n.tournament_id) return `/tournaments/${n.tournament_id}`;
  if (n.event_id) return `/game/${n.event_id}`;
  return "/notifications";
}

export type NotificationCategory = "games" | "payments" | "tournaments" | "social";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  games: "Games",
  payments: "Payments",
  tournaments: "Tournaments",
  social: "Social",
};

export function notificationCategory(kind: Notification["kind"]): NotificationCategory {
  if (kind.includes("payment")) return "payments";
  if (kind.startsWith("tournament")) return "tournaments";
  if (kind === "friend_request" || kind === "friend_accepted") return "social";
  // joined / left / spots_needed / hosted / event / game_* / published …
  return "games";
}
