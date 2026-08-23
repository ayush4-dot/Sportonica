"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, isActionError, type ActionError } from "@/lib/actionError";
import { friendlyTournamentError } from "./types";
import type { Tournament, TournamentDraftInput, TournamentTeam, TournamentTeamPlayer } from "./types";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// RLS already scopes every one of these selects to what the caller can
// see (has_venue_access() for a vendor, everything for super_admin, only
// published+ for anyone else) — no extra filtering needed here.

export async function getMyVendorTournaments(): Promise<Tournament[] | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.from("tournaments").select("*").order("created_at", { ascending: false });
  if (error) return actionError(error.message);
  return (data ?? []) as Tournament[];
}

// Same query as getMyVendorTournaments() — RLS (tournaments_read_super)
// already widens it to every tournament for a super_admin caller, so
// there's nothing platform-specific to add here. Kept as a separate
// export purely so /platform call sites read clearly.
export const listAllTournaments = getMyVendorTournaments;

export async function getTournament(id: string): Promise<Tournament | null | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (error) return actionError(error.message);
  return data as Tournament | null;
}

export async function getTournamentVenueName(venueId: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.from("venues").select("name").eq("id", venueId).maybeSingle();
  return data?.name ?? null;
}

// Everything a player can browse/register for — published and later,
// upcoming only. Used to blend real tournaments into /tournaments
// alongside the existing events_full-sourced rows (see
// src/lib/play/tournaments.ts), and to feed the detail page.
export async function listPublicTournaments(): Promise<(Tournament & { venue_name: string })[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tournaments")
    .select("*, venues(name)")
    .in("status", ["published", "registration_open", "registration_closed", "live"])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  if (error) return actionError(error.message);
  return ((data ?? []) as unknown as (Tournament & { venues: { name: string } | null })[]).map((t) => {
    const { venues, ...rest } = t;
    return { ...rest, venue_name: venues?.name ?? "—" };
  });
}

export async function listTournamentTeams(tournamentId: string): Promise<TournamentTeam[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tournament_teams").select("*").eq("tournament_id", tournamentId).order("created_at", { ascending: true });
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentTeam[];
}

// Teams plus their roster size — for the control center's Registrations
// tab, where "how many players signed up" matters at a glance.
export async function listTournamentTeamsWithRosterCount(tournamentId: string): Promise<
  (TournamentTeam & { roster_count: number })[] | ActionError
> {
  const teams = await listTournamentTeams(tournamentId);
  if (isActionError(teams)) return teams;
  if (teams.length === 0) return [];

  const sb = await createClient();
  const { data: players } = await sb
    .from("tournament_team_players").select("team_id").in("team_id", teams.map((t) => t.id));
  const counts = new Map<string, number>();
  for (const p of players ?? []) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);

  return teams.map((t) => ({ ...t, roster_count: counts.get(t.id) ?? 0 }));
}

export async function getMyTeamForTournament(tournamentId: string): Promise<TournamentTeam | null | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("tournament_teams").select("*").eq("tournament_id", tournamentId).eq("captain_id", user.id).maybeSingle();
  if (error) return actionError(error.message);
  return data as TournamentTeam | null;
}

export async function getTeamRoster(teamId: string): Promise<
  (TournamentTeamPlayer & { name: string; username: string | null; avatar_url: string | null })[] | ActionError
> {
  const sb = await createClient();
  const { data: rows, error } = await sb
    .from("tournament_team_players").select("*").eq("team_id", teamId).order("joined_at", { ascending: true });
  if (error) return actionError(error.message);
  const players = (rows ?? []) as TournamentTeamPlayer[];
  const ids = players.map((p) => p.user_id);
  const { data: profiles } = ids.length
    ? await sb.from("profiles").select("id, full_name, name, username, avatar_url").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; name: string | null; username: string | null; avatar_url: string | null }[] };
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return players.map((p) => {
    const prof = map.get(p.user_id);
    return {
      ...p,
      name: prof?.full_name ?? prof?.name ?? prof?.username ?? "Player",
      username: prof?.username ?? null,
      avatar_url: prof?.avatar_url ?? null,
    };
  });
}

// Search players to add to a team roster — same shape/behavior as
// searchPlayers() in src/lib/squads/actions.ts, scoped to one team's
// existing roster instead of a squad's membership.
export async function searchPlayersForTeam(q: string, teamId: string): Promise<
  { id: string; name: string; username: string | null; avatar_url: string | null }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const term = q.trim();
  if (term.length < 2) return [];

  const { data: existing } = await sb.from("tournament_team_players").select("user_id").eq("team_id", teamId);
  const already = new Set((existing ?? []).map((m) => m.user_id));

  const { data } = await sb
    .from("profiles")
    .select("id, full_name, name, username, avatar_url")
    .or(`full_name.ilike.%${term}%,username.ilike.%${term}%,name.ilike.%${term}%`)
    .limit(10);

  return (data ?? [])
    .filter((p) => !already.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.full_name ?? p.name ?? p.username ?? "Player",
      username: p.username,
      avatar_url: p.avatar_url,
    }));
}

// View-only for a vendor (RLS: pay_vendor_tournament_read scopes this to
// their own venue's tournament payments) — approving/rejecting still only
// happens through /platform/payments, same as every other booking type.
export async function listTournamentPayments(tournamentId: string): Promise<
  { team_id: string; team_name: string; status: string; payment_method: string | null; expected_amount: number; submitted_at: string | null }[] | ActionError
> {
  const sb = await createClient();
  const { data: teams, error: teamsErr } = await sb
    .from("tournament_teams").select("id, name").eq("tournament_id", tournamentId);
  if (teamsErr) return actionError(teamsErr.message);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return [];

  const { data: payments, error } = await sb
    .from("payments")
    .select("tournament_registration_id, status, payment_method, expected_amount, submitted_at")
    .in("tournament_registration_id", teamIds)
    .order("submitted_at", { ascending: false });
  if (error) return actionError(error.message);

  const nameMap = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const latestByTeam = new Map<string, typeof payments[number]>();
  for (const p of payments ?? []) {
    if (!p.tournament_registration_id) continue;
    if (!latestByTeam.has(p.tournament_registration_id)) latestByTeam.set(p.tournament_registration_id, p);
  }
  return [...latestByTeam.entries()].map(([teamId, p]) => ({
    team_id: teamId,
    team_name: nameMap.get(teamId) ?? "—",
    status: p.status,
    payment_method: p.payment_method,
    expected_amount: Number(p.expected_amount),
    submitted_at: p.submitted_at,
  }));
}

// ── Vendor / super-admin lifecycle RPCs ─────────────────────────────

export async function createTournament(input: TournamentDraftInput): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("create_tournament", { p: input });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  return data as Tournament;
}

export async function updateTournamentDraft(id: string, input: TournamentDraftInput): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("update_tournament_draft", { p_id: id, p: input });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  return data as Tournament;
}

export async function publishTournament(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("publish_tournament", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/tournaments");
  return data as Tournament;
}

export async function approveTournament(id: string, approve: boolean, reason?: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("approve_tournament", { p_id: id, p_approve: approve, p_reason: reason ?? null });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/platform/tournaments");
  revalidatePath("/tournaments");
  return data as Tournament;
}

export async function openTournamentRegistration(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("open_tournament_registration", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/tournaments");
  return data as Tournament;
}

export async function closeTournamentRegistration(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("close_tournament_registration", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  return data as Tournament;
}

export async function cancelTournament(id: string, reason: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("cancel_tournament", { p_id: id, p_reason: reason });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  revalidatePath("/platform/tournaments");
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/tournaments");
  return data as Tournament;
}

// ── Player registration ─────────────────────────────────────────────

export async function registerTeam(tournamentId: string, name: string, ackTerms: boolean): Promise<TournamentTeam | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("register_team", { p_tournament_id: tournamentId, p_name: name, p_ack_terms: ackTerms });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/tournaments/${tournamentId}`);
  return data as TournamentTeam;
}

export async function addTeamPlayer(teamId: string, userId: string, role: "player" | "substitute" = "player"): Promise<TournamentTeamPlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("add_team_player", { p_team_id: teamId, p_user_id: userId, p_role: role });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentTeamPlayer;
}

export async function removeTeamPlayer(teamId: string, userId: string): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("remove_team_player", { p_team_id: teamId, p_user_id: userId });
  if (error) return actionError(friendlyTournamentError(error.message));
}
