import { createClient } from "@/lib/supabase/server";
import type { Game, GamePlayer } from "./types";

export interface GameWithVenue extends Game {
  venues: { name: string } | null;
  courts: { name: string } | null;
}

// Public browsing — RLS (games_read_public) allows anyone to select
// status = 'published' rows.
export async function listPublishedGames(): Promise<(GameWithVenue & { joined_count: number })[]> {
  const sb = await createClient();
  const { data: games } = await sb
    .from("games")
    .select("*, venues(name), courts(name)")
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (!games?.length) return [];

  const ids = games.map((g) => g.id);
  const { data: players } = await sb
    .from("game_players").select("game_id").eq("status", "joined").in("game_id", ids);

  const counts = new Map<string, number>();
  (players ?? []).forEach((p) => counts.set(p.game_id, (counts.get(p.game_id) ?? 0) + 1));

  return (games as GameWithVenue[]).map((g) => ({ ...g, joined_count: counts.get(g.id) ?? 0 }));
}

// RLS scopes this to: published (anyone), or the host (any status), or a
// super-admin. notFound() upstream if the row isn't visible/doesn't exist.
export async function getGame(gameId: string): Promise<GameWithVenue | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("games").select("*, venues(name), courts(name)").eq("id", gameId).maybeSingle();
  return data as GameWithVenue | null;
}

export interface GamePlayerWithProfile extends GamePlayer {
  profiles: { full_name: string | null; name: string | null; avatar_url: string | null; phone: string | null } | null;
}

export async function getGamePlayers(gameId: string): Promise<GamePlayerWithProfile[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players")
    .select("*, profiles(full_name, name, avatar_url, phone)")
    .eq("game_id", gameId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });
  return (data as GamePlayerWithProfile[]) ?? [];
}

// Host-only (RLS: game_players_read_host) — the queue the host reviews on
// their dashboard. PENDING_HOST_APPROVAL only — a player who's already
// been approved and is mid-payment shows up in getAwaitingPaymentReview()
// / getPaymentPendingPlayers() instead, never here again.
export async function getPendingRequests(gameId: string): Promise<GamePlayerWithProfile[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players")
    .select("*, profiles(full_name, name, avatar_url, phone)")
    .eq("game_id", gameId)
    .eq("status", "requested")
    .order("joined_at", { ascending: true });
  return (data as GamePlayerWithProfile[]) ?? [];
}

// Host-only — the "Manage Payments" queue: players who've submitted proof
// and are waiting on the host's verify/reject call. This is the ONLY
// action that actually adds a player to the group (see
// verify_play_together_payment() in play_together_payments.sql).
export async function getAwaitingPaymentReview(gameId: string): Promise<GamePlayerWithProfile[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players")
    .select("*, profiles(full_name, name, avatar_url, phone)")
    .eq("game_id", gameId)
    .eq("status", "payment_verification_pending")
    .order("payment_submitted_at", { ascending: true });
  return (data as GamePlayerWithProfile[]) ?? [];
}

// Host-only — approved players still inside their 2-hour payment window
// (or whose proof was rejected and can still resubmit). Shown on the
// manage page purely as visibility, not actionable until they submit.
export async function getPaymentPendingPlayers(gameId: string): Promise<GamePlayerWithProfile[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players")
    .select("*, profiles(full_name, name, avatar_url, phone)")
    .eq("game_id", gameId)
    .in("status", ["payment_pending", "payment_rejected"])
    .order("payment_deadline", { ascending: true });
  return (data as GamePlayerWithProfile[]) ?? [];
}

// Host-only — historical requests that never became members: the host
// rejected the original request, or the payment window expired. Purely
// for visibility (spec: "Expired / Rejected" bucket on the manage page) —
// nothing here is actionable.
export async function getHistoricalRequests(gameId: string): Promise<GamePlayerWithProfile[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players")
    .select("*, profiles(full_name, name, avatar_url, phone)")
    .eq("game_id", gameId)
    .in("status", ["rejected", "expired"])
    .order("joined_at", { ascending: false });
  return (data as GamePlayerWithProfile[]) ?? [];
}

// A player's own request/membership row for a game — drives the "Request
// sent, waiting for approval" vs "You're in" vs nothing-yet UI state.
export async function getMyGamePlayerStatus(gameId: string, userId: string): Promise<GamePlayer | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("game_players").select("*").eq("game_id", gameId).eq("user_id", userId).maybeSingle();
  return data as GamePlayer | null;
}

// For the host dashboard's "venue payment" status line. RLS on
// court_bookings scopes select to the owning user (the host, here).
export async function getGameCourtBookingStatus(courtBookingId: string): Promise<{
  price: number;
  payment_status: string;
  state: string;
} | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("court_bookings").select("price, payment_status, state").eq("id", courtBookingId).maybeSingle();
  if (!data) return null;
  return { price: Number(data.price) || 0, payment_status: data.payment_status, state: data.state };
}
