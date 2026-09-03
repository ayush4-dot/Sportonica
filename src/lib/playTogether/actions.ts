"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyPlayTogetherError } from "./types";
import type { Game, GamePlayer, PlayTogetherPaymentMethod, SkillLevel } from "./types";
import {
  notifyPlayTogetherJoinRequested,
  notifyPlayTogetherJoinRejected,
  notifyPlayTogetherLeft,
  notifyPlayTogetherCancelled,
  notifyPlayTogetherPaymentRequired,
  notifyPlayTogetherPaymentSubmitted,
  notifyPlayTogetherPaymentVerified,
  notifyPlayTogetherPaymentRejected,
  notifyPlayTogetherCashSelected,
} from "@/lib/mail/notify";
import { actionError, type ActionError } from "@/lib/actionError";
import { isValidLocalPhone } from "@/lib/validation/identity";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// Upload the host's own eSewa/Khalti QR — shown to players so they pay the
// host directly, never a Sportonica QR. Mirrors uploadPaymentProof() in
// src/lib/payments/actions.ts (same size/type limits), targeting the
// public 'host-qr' bucket instead of the private 'payment-proofs' one.
export async function uploadHostQr(file: File): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    return actionError("Upload a JPG, PNG or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return actionError("Image must be under 5 MB.");
  }
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("host-qr").upload(path, file, { upsert: false });
  if (error) return actionError(error.message);

  return path;
}

// Host creates & pays for a game. This only reserves the court slot and
// records the game as 'awaiting_payment' — it is not joinable, and does not
// appear anywhere for players, until the venue payment is confirmed (see
// finalize_play_together_game() in supabase/play-together/play_together.sql, called from
// the existing confirmFreeBooking()/reviewPayment() payment actions).
export async function createGame(input: {
  court_id: string;
  starts_at: string;
  ends_at: string;
  sport: string;
  game_format?: string;
  min_players: number;
  max_players: number;
  joining_deadline: string;
  host_qr_path: string;
  host_phone: string;
  notes?: string;
  ack_risk: boolean;
  skill_level?: SkillLevel;
}): Promise<{ game: Game; price: number } | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  if (!isValidLocalPhone(input.host_phone)) {
    return actionError("Phone number must contain exactly 10 digits.");
  }
  const { data, error } = await sb.rpc("create_play_together_game", {
    p_court_id: input.court_id,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_sport: input.sport,
    p_game_format: input.game_format ?? null,
    p_min_players: input.min_players,
    p_max_players: input.max_players,
    p_joining_deadline: input.joining_deadline,
    p_host_qr_path: input.host_qr_path,
    p_host_phone: input.host_phone.trim(),
    p_notes: input.notes?.trim() || null,
    p_ack_risk: input.ack_risk,
    p_skill_level: input.skill_level ?? "any",
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));
  const game = data as Game;

  // The wizard's payment step needs the total venue price (what the host
  // actually owes), which lives on the underlying court_booking, not on
  // `games` itself (games only stores the per-head contribution).
  const { data: booking } = await sb
    .from("court_bookings").select("price").eq("id", game.court_booking_id).maybeSingle();

  return { game, price: Number(booking?.price) || 0 };
}

// Not an instant join — creates a pending request. The player isn't
// notified, isn't in the group, and doesn't see the host's QR/phone until
// the host approves it (approveJoinRequest() below). ackTerms is checked
// server-side inside join_play_together_game() — a client can't bypass it
// by just not showing the checkbox.
export async function joinGame(gameId: string, ackTerms: boolean): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("join_play_together_game", { p_game_id: gameId, p_ack_terms: ackTerms });
  if (error) return actionError(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);

  await notifyPlayTogetherJoinRequested({ requesterId: user.id, gameId });

  return data as GamePlayer;
}

// Host-only. Approving does NOT add the player to the game — it opens a
// 2-hour payment window (status -> 'payment_pending'). The player only
// becomes a confirmed member once the host separately verifies their
// payment proof — see verifyPlayTogetherPayment() below.
export async function approveJoinRequest(
  gamePlayerId: string,
  gameId: string,
  approve: boolean
): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("approve_join_request", {
    p_game_player_id: gamePlayerId,
    p_approve: approve,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  if (approve) {
    await notifyPlayTogetherPaymentRequired({ playerId: (data as GamePlayer).user_id, gameId });
  } else {
    await notifyPlayTogetherJoinRejected({ playerId: (data as GamePlayer).user_id, gameId });
  }

  return data as GamePlayer;
}

// Upload proof of payment to the HOST (transaction screenshot). Mirrors
// uploadPaymentProof() in src/lib/payments/actions.ts, targeting the
// private 'game-payment-proofs' bucket instead. Path convention:
// '{user_id}/{game_player_id}_{timestamp}.{ext}' — see
// supabase/play-together/play_together_payments.sql for why the separator is '_' not '-'.
export async function uploadGamePaymentProof(gamePlayerId: string, file: File): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    return actionError("Upload a JPG, PNG or WebP screenshot.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return actionError("Screenshot must be under 5 MB.");
  }
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${user.id}/${gamePlayerId}_${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("game-payment-proofs").upload(path, file, { upsert: false });
  if (error) return actionError(error.message);

  return path;
}

// Player-only. The 2-hour deadline is re-checked server-side inside
// submit_play_together_payment() — never trust the client's countdown. If
// the window already lapsed, the RPC expires the row in place (rather than
// throwing, which would roll back the expiry — see the SQL comment) and
// returns it with status 'expired'; we detect that here and surface the
// friendly message instead of treating the call as a successful submission.
export async function submitPlayTogetherPayment(input: {
  gamePlayerId: string;
  gameId: string;
  method: PlayTogetherPaymentMethod;
  transactionId: string;
  proofPath: string;
}): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("submit_play_together_payment", {
    p_game_player_id: input.gamePlayerId,
    p_payment_method: input.method,
    p_transaction_id: input.transactionId.trim(),
    p_payment_proof_path: input.proofPath,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));
  const row = data as GamePlayer;

  revalidatePath(`/play-together/${input.gameId}`);
  revalidatePath(`/play-together/${input.gameId}/manage`);

  if (row.status === "expired") {
    return actionError(friendlyPlayTogetherError("PAYMENT_DEADLINE_EXPIRED"));
  }

  await notifyPlayTogetherPaymentSubmitted({ gamePlayerId: input.gamePlayerId, gameId: input.gameId });

  return row;
}

// Player-only alternative to submitPlayTogetherPayment(): commits to
// paying the host in cash at the venue instead of online, so it skips
// proof/verification entirely and goes straight to 'joined' — the
// original Play Together model, offered alongside the QR-and-upload path
// so a player can pick whichever the host actually supports. The 2-hour
// deadline is still re-checked server-side inside
// choose_play_together_cash_payment() (see supabase/play-together/
// play_together_cash_payment.sql) — a lapsed window expires the row in
// place exactly like submitPlayTogetherPayment() does, never trust the
// client's countdown.
export async function chooseCashPaymentAtVenue(gamePlayerId: string, gameId: string): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("choose_play_together_cash_payment", {
    p_game_player_id: gamePlayerId,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));
  const row = data as GamePlayer;

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  if (row.status === "expired") {
    return actionError(friendlyPlayTogetherError("PAYMENT_DEADLINE_EXPIRED"));
  }

  await notifyPlayTogetherCashSelected({ gamePlayerId, gameId });

  return row;
}

// Host-only. This is the ONLY point a player is actually added to the
// group — approving the original request never does this on its own. A
// reason is required to reject (enforced server-side too) so the player
// always gets a concrete "why", same UX as the admin's REJECTION_REASONS.
export async function verifyPlayTogetherPayment(
  gamePlayerId: string,
  gameId: string,
  approve: boolean,
  reason?: string
): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("verify_play_together_payment", {
    p_game_player_id: gamePlayerId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));
  const row = data as GamePlayer;

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  if (approve) {
    await notifyPlayTogetherPaymentVerified({ playerId: row.user_id, gameId });
  } else {
    await notifyPlayTogetherPaymentRejected({ playerId: row.user_id, gameId, reason: reason ?? null });
  }

  return row;
}

// Host-only — a short-lived signed URL to view a submitted proof
// screenshot. Mirrors getSignedScreenshotUrl() in
// src/lib/payments/adminActions.ts; storage RLS (game_proof_read in
// supabase/play-together/play_together_payments.sql) independently enforces that only
// the uploading player or that game's host can ever read the object, so
// this never needs its own ownership check beyond "row is visible to me".
export async function getSignedGamePaymentProofUrl(gamePlayerId: string): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data: row, error: rowErr } = await sb
    .from("game_players").select("payment_proof_path").eq("id", gamePlayerId).maybeSingle();
  if (rowErr) return actionError(rowErr.message);
  if (!row?.payment_proof_path) return actionError("No payment proof on file for this request.");

  const { data, error } = await sb.storage
    .from("game-payment-proofs").createSignedUrl(row.payment_proof_path, 300);
  if (error) return actionError(error.message);
  return data.signedUrl;
}

// Withdraw a pending request, or leave after being approved — either way,
// before the joining deadline.
export async function leaveGame(gameId: string): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("leave_play_together_game", { p_game_id: gameId });
  if (error) return actionError(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  await notifyPlayTogetherLeft({ leaverId: user.id, gameId });

  return data as GamePlayer;
}

// Host-only: toggles a player's cash-collection record. This is only a
// record — Sportonica never processes or holds this cash.
export async function markContributionCollected(
  gamePlayerId: string,
  gameId: string,
  collected: boolean
): Promise<GamePlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("mark_contribution_collected", {
    p_game_player_id: gamePlayerId,
    p_collected: collected,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}/manage`);

  return data as GamePlayer;
}

// Host-only. No refund is computed or processed here — refunds depend on
// venue/Sportonica policy, which isn't implemented yet (see
// supabase/play-together/play_together.sql). Any refund must currently be handled
// manually by an admin.
export async function cancelGame(gameId: string, reason?: string): Promise<Game | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("cancel_play_together_game", {
    p_game_id: gameId,
    p_reason: reason?.trim() || null,
  });
  if (error) return actionError(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  await notifyPlayTogetherCancelled({ hostId: user.id, gameId });

  return data as Game;
}
