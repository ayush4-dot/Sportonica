"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyPlayTogetherError } from "./types";
import type { Game, GamePlayer } from "./types";
import {
  notifyPlayTogetherJoinRequested,
  notifyPlayTogetherJoined,
  notifyPlayTogetherJoinRejected,
  notifyPlayTogetherLeft,
  notifyPlayTogetherCancelled,
} from "@/lib/mail/notify";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

// Upload the host's own eSewa/Khalti QR — shown to players so they pay the
// host directly, never a KhelamNa QR. Mirrors uploadPaymentProof() in
// src/lib/payments/actions.ts (same size/type limits), targeting the
// public 'host-qr' bucket instead of the private 'payment-proofs' one.
export async function uploadHostQr(file: File): Promise<string> {
  const { sb, user } = await requireUser();

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    throw new Error("Upload a JPG, PNG or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be under 5 MB.");
  }
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("host-qr").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);

  return path;
}

// Host creates & pays for a game. This only reserves the court slot and
// records the game as 'awaiting_payment' — it is not joinable, and does not
// appear anywhere for players, until the venue payment is confirmed (see
// finalize_play_together_game() in supabase/play_together.sql, called from
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
}): Promise<{ game: Game; price: number }> {
  const { sb } = await requireUser();
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
  });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));
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
// the host approves it (approveJoinRequest() below).
export async function joinGame(gameId: string): Promise<GamePlayer> {
  const { sb, user } = await requireUser();
  const { data, error } = await sb.rpc("join_play_together_game", { p_game_id: gameId });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);

  await notifyPlayTogetherJoinRequested({ requesterId: user.id, gameId });

  return data as GamePlayer;
}

// Host-only. This is the only point a player is actually in the game,
// notified, and counted toward capacity.
export async function approveJoinRequest(
  gamePlayerId: string,
  gameId: string,
  approve: boolean
): Promise<GamePlayer> {
  const { sb } = await requireUser();
  const { data, error } = await sb.rpc("approve_join_request", {
    p_game_player_id: gamePlayerId,
    p_approve: approve,
  });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  if (approve) {
    await notifyPlayTogetherJoined({ playerId: (data as GamePlayer).user_id, gameId });
  } else {
    await notifyPlayTogetherJoinRejected({ playerId: (data as GamePlayer).user_id, gameId });
  }

  return data as GamePlayer;
}

// Withdraw a pending request, or leave after being approved — either way,
// before the joining deadline.
export async function leaveGame(gameId: string): Promise<GamePlayer> {
  const { sb, user } = await requireUser();
  const { data, error } = await sb.rpc("leave_play_together_game", { p_game_id: gameId });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  await notifyPlayTogetherLeft({ leaverId: user.id, gameId });

  return data as GamePlayer;
}

// Host-only: toggles a player's cash-collection record. This is only a
// record — KhelamNa never processes or holds this cash.
export async function markContributionCollected(
  gamePlayerId: string,
  gameId: string,
  collected: boolean
): Promise<GamePlayer> {
  const { sb } = await requireUser();
  const { data, error } = await sb.rpc("mark_contribution_collected", {
    p_game_player_id: gamePlayerId,
    p_collected: collected,
  });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}/manage`);

  return data as GamePlayer;
}

// Host-only. No refund is computed or processed here — refunds depend on
// venue/KhelamNa policy, which isn't implemented yet (see
// supabase/play_together.sql). Any refund must currently be handled
// manually by an admin.
export async function cancelGame(gameId: string, reason?: string): Promise<Game> {
  const { sb, user } = await requireUser();
  const { data, error } = await sb.rpc("cancel_play_together_game", {
    p_game_id: gameId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath(`/play-together/${gameId}/manage`);
  revalidatePath("/play-together");

  await notifyPlayTogetherCancelled({ hostId: user.id, gameId });

  return data as Game;
}
