"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, isActionError, type ActionError } from "@/lib/actionError";
import { friendlyTournamentError } from "./types";
import type {
  Tournament, TournamentDraftInput, TournamentTeam, TournamentTeamPlayer,
  TournamentMatch, TournamentAnnouncement, TournamentStanding, WalkinMember,
  TournamentMatchPlayerStat, PlayerScorecard, TournamentPlayerStatRow, TournamentAwards,
  MatchAuditEntry, TournamentManager,
} from "./types";

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

export async function getTournamentVenueName(venueId: string | null): Promise<string | null> {
  if (!venueId) return null;
  const sb = await createClient();
  const { data } = await sb.from("venues").select("name").eq("id", venueId).maybeSingle();
  return data?.name ?? null;
}

// Every display site needs the same fallback — a real, listed venue's
// name, or an Organizer's own venue name — so it lives in one place
// rather than repeating the ternary at every call site.
export async function getDisplayVenueName(
  tournament: Pick<Tournament, "venue_id" | "own_venue_name">
): Promise<string> {
  if (tournament.venue_id) return (await getTournamentVenueName(tournament.venue_id)) ?? "—";
  return tournament.own_venue_name ?? "—";
}

// Everything a player can browse/register for — published and later,
// upcoming only. Used to blend real tournaments into /tournaments
// alongside the existing events_full-sourced rows (see
// src/lib/play/tournaments.ts), and to feed the detail page.
export async function listPublicTournaments(): Promise<(Tournament & { venue_name: string })[] | ActionError> {
  const sb = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("tournaments")
    .select("*, venues(name)")
    .in("status", ["published", "registration_open", "registration_closed", "live", "completed"])
    // Upcoming/ongoing tournaments still need the ends_at guard (a
    // published tournament whose dates slipped into the past without a
    // status change shouldn't linger); completed ones are exempt since
    // they're meant to stay browsable as a result, not a listing.
    .or(`ends_at.gte.${nowIso},status.eq.completed`)
    .order("starts_at", { ascending: true })
    .limit(100);
  if (error) return actionError(error.message);
  return ((data ?? []) as unknown as (Tournament & { venues: { name: string } | null })[]).map((t) => {
    const { venues, ...rest } = t;
    return { ...rest, venue_name: venues?.name ?? t.own_venue_name ?? "—" };
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
  const ids = players.map((p) => p.user_id).filter((id): id is string => id !== null);
  const { data: profiles } = ids.length
    ? await sb.from("profiles").select("id, full_name, name, username, avatar_url").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; name: string | null; username: string | null; avatar_url: string | null }[] };
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return players.map((p) => {
    const prof = p.user_id ? map.get(p.user_id) : undefined;
    return {
      ...p,
      name: prof?.full_name ?? prof?.name ?? prof?.username ?? p.guest_name ?? "Player",
      username: prof?.username ?? null,
      avatar_url: prof?.avatar_url ?? null,
    };
  });
}

// Public-safe roster for the event page's Teams tab — name + role only,
// via a security-definer RPC (the raw table has no public read policy
// since it holds walk-in guest_phone/guest_email). Confirmed teams only.
export async function getTeamRosterPublic(teamId: string): Promise<{ id: string; name: string; role: string; is_linked: boolean }[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_team_roster_public", { p_team_id: teamId });
  if (error) return actionError(error.message);
  return (data ?? []) as { id: string; name: string; role: string; is_linked: boolean }[];
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

// Uploads happen before the tournament row exists (creation is a multi-step
// draft), so the storage path is keyed by the uploader's own id rather than
// a tournament id — same convention as uploadHostQr() in
// src/lib/playTogether/actions.ts. Targets the public 'tournament-banners'
// bucket (see supabase/tournaments.sql).
export async function uploadTournamentBanner(file: File): Promise<string | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) return actionError("Upload a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) return actionError("Image must be under 5 MB.");

  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("tournament-banners").upload(path, file, { upsert: false });
  if (error) return actionError(error.message);

  const { data: pub } = sb.storage.from("tournament-banners").getPublicUrl(path);
  return pub.publicUrl;
}

export async function createTournament(input: TournamentDraftInput): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("create_tournament", { p: input });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  revalidatePath("/organize");
  return data as Tournament;
}

export async function updateTournamentDraft(id: string, input: TournamentDraftInput): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("update_tournament_draft", { p_id: id, p: input });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath(`/organize/tournaments/${id}`);
  return data as Tournament;
}

export async function publishTournament(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("publish_tournament", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/organize");
  revalidatePath(`/organize/tournaments/${id}`);
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
  revalidatePath(`/organize/tournaments/${id}`);
  revalidatePath("/tournaments");
  return data as Tournament;
}

export async function closeTournamentRegistration(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("close_tournament_registration", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath(`/organize/tournaments/${id}`);
  return data as Tournament;
}

export async function startSingleEvent(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("start_single_event", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath(`/organize/tournaments/${id}`);
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${id}`);
  return data as Tournament;
}

export async function cancelTournament(id: string, reason: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("cancel_tournament", { p_id: id, p_reason: reason });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/tournaments");
  revalidatePath("/platform/tournaments");
  revalidatePath("/organize");
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath(`/organize/tournaments/${id}`);
  revalidatePath("/tournaments");
  return data as Tournament;
}

// ── Player registration ─────────────────────────────────────────────

export async function registerTeam(
  tournamentId: string, name: string, ackTerms: boolean, managerName?: string, managerPhone?: string
): Promise<TournamentTeam | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("register_team", {
    p_tournament_id: tournamentId, p_name: name, p_ack_terms: ackTerms,
    p_manager_name: managerName || null, p_manager_phone: managerPhone || null,
  });
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

// Admin/organizer-only — removes by the roster row's own id, so it also
// works for a walk-in/guest member (no user_id to match on).
export async function removeTeamPlayerAdmin(teamPlayerId: string): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("remove_team_player_admin", { p_team_player_id: teamPlayerId });
  if (error) return actionError(friendlyTournamentError(error.message));
}

// Admin/organizer-only — add a no-account (walk-in) member directly to
// an existing team, and edit one's own name/phone/email afterwards.
export async function addWalkinTeamPlayer(
  teamId: string, name: string, phone: string, email?: string, role: "player" | "substitute" = "player"
): Promise<TournamentTeamPlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("add_walkin_team_player", {
    p_team_id: teamId, p_name: name, p_phone: phone, p_email: email ?? null, p_role: role,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentTeamPlayer;
}

export async function updateTeamPlayerGuest(
  teamPlayerId: string, name: string, phone: string, email?: string
): Promise<TournamentTeamPlayer | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("update_team_player_guest", {
    p_team_player_id: teamPlayerId, p_name: name, p_phone: phone, p_email: email ?? null,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentTeamPlayer;
}

// ── Walk-in teams: registered by whoever manages the tournament, on
// behalf of people who signed up in person — no accounts involved. ──
export async function createWalkinTeam(
  tournamentId: string,
  teamName: string,
  members: WalkinMember[],
  managerName?: string,
  managerPhone?: string
): Promise<TournamentTeam | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("create_walkin_team", {
    p_tournament_id: tournamentId,
    p_team_name: teamName,
    p_members: members.map((m) => ({ name: m.name, phone: m.phone, email: m.email || null })),
    p_manager_name: managerName || null,
    p_manager_phone: managerPhone || null,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/organize/tournaments/${tournamentId}`);
  revalidatePath(`/platform/tournaments/${tournamentId}`);
  return data as TournamentTeam;
}

export async function markWalkinTeamPaid(teamId: string, tournamentId: string): Promise<TournamentTeam | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("mark_walkin_team_paid", { p_team_id: teamId });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/organize/tournaments/${tournamentId}`);
  revalidatePath(`/platform/tournaments/${tournamentId}`);
  return data as TournamentTeam;
}

// ── Fixtures / bracket / standings / announcements (Phase 2) ───────

export async function getTournamentMatches(tournamentId: string): Promise<TournamentMatch[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tournament_matches").select("*").eq("tournament_id", tournamentId)
    .order("stage", { ascending: true }).order("round", { ascending: true });
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentMatch[];
}

export async function getTournamentAnnouncements(tournamentId: string): Promise<TournamentAnnouncement[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tournament_announcements").select("*").eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false });
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentAnnouncement[];
}

export async function getTournamentStandings(tournamentId: string, groupName?: string): Promise<TournamentStanding[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("tournament_standings", { p_tournament_id: tournamentId, p_group_name: groupName ?? null });
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentStanding[];
}

// Fully manual fixtures/bracket: the organizer picks both teams from the
// confirmed pool, a stage, a round number, and a round label — no
// auto-seeding or auto-pairing. First match created flips the
// tournament to 'live', same as the old auto-generation did.
export async function createMatch(input: {
  tournamentId: string;
  stage: "group" | "league" | "knockout";
  round: number;
  roundLabel: string;
  teamAId: string;
  teamBId?: string;
  groupName?: string;
}): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("create_match", {
    p_tournament_id: input.tournamentId, p_stage: input.stage, p_round: input.round,
    p_round_label: input.roundLabel, p_team_a_id: input.teamAId, p_team_b_id: input.teamBId ?? null,
    p_group_name: input.groupName ?? null,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${input.tournamentId}`);
  revalidatePath(`/tournaments/${input.tournamentId}`);
  return data as TournamentMatch;
}

export async function deleteMatch(matchId: string): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("delete_match", { p_match_id: matchId });
  if (error) return actionError(friendlyTournamentError(error.message));
}

export async function updateMatchTeams(matchId: string, teamAId: string, teamBId?: string): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("update_match_teams", {
    p_match_id: matchId, p_team_a_id: teamAId, p_team_b_id: teamBId ?? null,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentMatch;
}

export async function getMatchAudit(matchId: string): Promise<(MatchAuditEntry & { changed_by_name: string })[] | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("get_match_audit", { p_match_id: matchId });
  if (error) return actionError(friendlyTournamentError(error.message));
  const entries = (data ?? []) as MatchAuditEntry[];
  const ids = [...new Set(entries.map((e) => e.changed_by).filter((id): id is string => !!id))];
  const { data: profiles } = ids.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return entries.map((e) => ({
    ...e,
    changed_by_name: e.changed_by ? (map.get(e.changed_by)?.full_name ?? map.get(e.changed_by)?.name ?? "Someone") : "System",
  }));
}

export async function recordMatchResult(
  matchId: string, scoreA: number | null, scoreB: number | null, winnerTeamId?: string,
  extraTime?: { scoreA: number; scoreB: number },
  penalties?: { scoreA: number; scoreB: number },
  confirmCascade?: boolean
): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("record_match_result", {
    p_match_id: matchId, p_score_a: scoreA, p_score_b: scoreB, p_winner_team_id: winnerTeamId ?? null,
    p_score_a_et: extraTime?.scoreA ?? null, p_score_b_et: extraTime?.scoreB ?? null,
    p_score_a_pens: penalties?.scoreA ?? null, p_score_b_pens: penalties?.scoreB ?? null,
    p_confirm_cascade: confirmCascade ?? false,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentMatch;
}

export async function getMatchPlayerStats(matchId: string): Promise<TournamentMatchPlayerStat[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.from("tournament_match_player_stats").select("*").eq("match_id", matchId);
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentMatchPlayerStat[];
}

export async function recordMatchPlayerStats(
  matchId: string,
  stats: { team_player_id: string; goals: number; assists: number; is_mom: boolean; yellow_cards: number; red_card: boolean }[]
): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("record_match_player_stats", { p_match_id: matchId, p_stats: stats });
  if (error) return actionError(friendlyTournamentError(error.message));
}

// Tournament-wide leaderboard — public, no login required (matches how
// tournament results/scores are already public elsewhere on this page).
export async function getTournamentPlayerStats(tournamentId: string): Promise<TournamentPlayerStatRow[] | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_tournament_player_stats", { p_tournament_id: tournamentId });
  if (error) return actionError(error.message);
  return (data ?? []) as TournamentPlayerStatRow[];
}

// "When", not "where" — venue is already fixed for the whole
// tournament, so this just sets a match's date/time for the public
// Fixtures list, no court or conflict-checking involved.
export async function setMatchTime(
  matchId: string, startsAt: string | null, endsAt: string | null, courtLabel?: string, notes?: string
): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("set_match_time", {
    p_match_id: matchId, p_starts_at: startsAt, p_ends_at: endsAt,
    p_court_label: courtLabel ?? null, p_notes: notes ?? null,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentMatch;
}

export async function setMatchStatus(matchId: string, status: "unscheduled" | "scheduled" | "live" | "postponed" | "cancelled"): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("set_match_status", { p_match_id: matchId, p_status: status });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentMatch;
}

export async function setMatchAdvancement(matchId: string, nextMatchId: string, nextMatchSlot: "a" | "b"): Promise<TournamentMatch | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("set_match_advancement", {
    p_match_id: matchId, p_next_match_id: nextMatchId, p_next_match_slot: nextMatchSlot,
  });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentMatch;
}

// Opt-in starting point — only usable while zero matches exist yet for
// this tournament, so it can never clobber a hand-built fixture list.
export async function generateKnockoutBracket(tournamentId: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("generate_knockout_bracket", { p_tournament_id: tournamentId });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/organize/tournaments/${tournamentId}`);
  revalidatePath(`/platform/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}`);
  return data as Tournament;
}

export async function setTeamSeed(teamId: string, seed: number, groupName?: string): Promise<TournamentTeam | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("set_team_seed", { p_team_id: teamId, p_seed: seed, p_group_name: groupName ?? null });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentTeam;
}

// Per-tournament delegated access — super admin only. Distinct from
// profiles.role === "organizer" (see organizer_partnerships.sql); this
// grants one specific person the same control a tournament's own
// owner/organizer already has, scoped to just that one tournament.
export async function findUserByEmail(email: string): Promise<{ id: string; full_name: string | null; email: string } | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("find_user_by_email", { p_email: email }).maybeSingle();
  if (error) return actionError(friendlyTournamentError(error.message));
  if (!data) return actionError("USER_NOT_FOUND");
  return data as { id: string; full_name: string | null; email: string };
}

export async function listTournamentManagers(tournamentId: string): Promise<TournamentManager[] | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("list_tournament_managers", { p_tournament_id: tournamentId });
  if (error) return actionError(friendlyTournamentError(error.message));
  return (data ?? []).map((r: { id: string; user_id: string; full_name: string | null; email: string; added_at: string }) => ({
    id: r.id, user_id: r.user_id, full_name: r.full_name, email: r.email, added_at: r.added_at,
  }));
}

export async function grantTournamentManager(tournamentId: string, userId: string): Promise<TournamentManager | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("grant_tournament_manager", { p_tournament_id: tournamentId, p_user_id: userId });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/platform/tournaments/${tournamentId}`);
  const list = await listTournamentManagers(tournamentId);
  if (isActionError(list)) return list;
  const row = list.find((m) => m.user_id === userId);
  if (!row) return actionError("NOT_FOUND");
  return row;
}

export async function revokeTournamentManager(tournamentId: string, userId: string): Promise<true | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("revoke_tournament_manager", { p_tournament_id: tournamentId, p_user_id: userId });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/platform/tournaments/${tournamentId}`);
  return true;
}

// Winner/runner-up/semifinalists, derived from the Final and Semifinal
// knockout matches — nothing new to store, just read off the bracket.
export async function getTournamentAwards(tournamentId: string): Promise<TournamentAwards | ActionError> {
  const sb = await createClient();
  const [{ data: matches, error: mErr }, teamsRes] = await Promise.all([
    sb.from("tournament_matches").select("*").eq("tournament_id", tournamentId).in("round_label", ["Final", "Semifinal"]),
    listTournamentTeams(tournamentId),
  ]);
  if (mErr) return actionError(mErr.message);
  const teams = isActionError(teamsRes) ? [] : teamsRes;
  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;

  const final = (matches ?? []).find((m) => m.round_label === "Final");
  const semis = (matches ?? []).filter((m) => m.round_label === "Semifinal");

  const winner = final?.status === "completed" || final?.status === "walkover" ? nameOf(final.winner_team_id) : null;
  const runnerUp = final && winner
    ? nameOf(final.team_a_id === final.winner_team_id ? final.team_b_id : final.team_a_id)
    : null;
  const semifinalists = semis
    .filter((m) => (m.status === "completed" || m.status === "walkover") && m.winner_team_id)
    .map((m) => nameOf(m.team_a_id === m.winner_team_id ? m.team_b_id : m.team_a_id))
    .filter((n): n is string => !!n);

  return { winner, runnerUp, semifinalists };
}

// Total disciplinary fine owed per team (yellow/red cards × the
// tournament's own Rs-per-card rates) — for whoever manages the
// tournament to see what to collect.
export async function getTournamentTeamFines(tournamentId: string): Promise<{ team_id: string; total_fine: number }[] | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("get_tournament_team_fines", { p_tournament_id: tournamentId });
  if (error) return actionError(friendlyTournamentError(error.message));
  return (data ?? []) as { team_id: string; total_fine: number }[];
}

// Career totals for a linked account, across every tournament they've
// played — used on their public profile. Safe for a logged-out visitor:
// the RPC is granted to `anon` too, since it returns nothing more
// revealing than a goals/matches counter.
export async function getPlayerScorecard(userId: string): Promise<PlayerScorecard | ActionError> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_player_scorecard", { p_user_id: userId }).maybeSingle();
  if (error) return actionError(error.message);
  return (data ?? { goals: 0, matches_played: 0, tournaments_played: 0, mom_count: 0 }) as PlayerScorecard;
}

// Links any walk-in roster spot whose guest phone/email matches the
// caller's own account to that account — called right after sign-in and
// after saving a profile phone number, so a claim happens automatically
// without the player needing to do anything.
export async function claimGuestTournamentEntries(): Promise<number | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("claim_guest_tournament_entries");
  if (error) return actionError(error.message);
  return (data ?? 0) as number;
}

export async function completeTournament(id: string): Promise<Tournament | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("complete_tournament", { p_id: id });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${id}`);
  return data as Tournament;
}

export async function postTournamentAnnouncement(tournamentId: string, title: string, body?: string): Promise<TournamentAnnouncement | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.rpc("post_tournament_announcement", { p_tournament_id: tournamentId, p_title: title, p_body: body ?? null });
  if (error) return actionError(friendlyTournamentError(error.message));
  return data as TournamentAnnouncement;
}
