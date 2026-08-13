"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyPlayTogetherError } from "./types";
import type { Game, GamePlayer } from "./types";
import {
  notifyPlayTogetherJoined,
  notifyPlayTogetherLeft,
  notifyPlayTogetherCancelled,
} from "@/lib/mail/notify";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
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

export async function joinGame(gameId: string): Promise<GamePlayer> {
  const { sb, user } = await requireUser();
  const { data, error } = await sb.rpc("join_play_together_game", { p_game_id: gameId });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
  revalidatePath("/play-together");

  await notifyPlayTogetherJoined({ joinerId: user.id, gameId });

  return data as GamePlayer;
}

export async function leaveGame(gameId: string): Promise<GamePlayer> {
  const { sb, user } = await requireUser();
  const { data, error } = await sb.rpc("leave_play_together_game", { p_game_id: gameId });
  if (error) throw new Error(friendlyPlayTogetherError(error.message));

  revalidatePath(`/play-together/${gameId}`);
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
