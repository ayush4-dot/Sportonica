"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, type ActionError } from "@/lib/actionError";
import { friendlyTournamentError, type Tournament } from "@/lib/tournaments/types";

export interface Partnership {
  id: string;
  organizer_id: string;
  vendor_id: string;
  status: "pending_invite" | "active" | "revoked";
  created_at: string;
  updated_at: string;
}

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// Read straight from the DB, same as getPlatformRole() in
// src/lib/platform/actions.ts ("Not user_metadata, not a cookie — the
// profiles.role column, under RLS") — used to decide whether /organize
// shows the dashboard or the "Become an organizer" CTA.
export async function getMyRole(): Promise<string | null> {
  const { sb, user } = await requireUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role ?? null;
}

// Request, not grant — sets role to 'organizer_pending', which
// is_organizer() does NOT satisfy, so it unlocks nothing by itself. A
// Super Admin has to call approveOrganizerRequest() below before
// anything organizer-related actually works. The DB trigger
// guard_profile_role_change() is what enforces this is the only
// self-serve transition a client session can make — this action is a
// thin, readable wrapper around that.
export async function requestOrganizerAccess(): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.from("profiles").update({ role: "organizer_pending" }).eq("id", user.id);
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/profile");
  revalidatePath("/organize");
}

// Super-admin-only — see approve_organizer_request() in
// supabase/organizer_approval_and_own_venue.sql for why this has to be a
// security-definer RPC rather than a plain client update() the way
// setUserRole() in src/lib/platform/actions.ts does it: profiles' only
// update policy is "id = auth.uid()", so a super_admin acting on someone
// ELSE's row needs RLS bypassed properly, not assumed away.
export async function approveOrganizerRequest(userId: string, approve: boolean): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("approve_organizer_request", { p_user_id: userId, p_approve: approve });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/platform/users");
}

export async function listPendingOrganizerRequests(): Promise<
  { id: string; name: string }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  // profiles' select policy is public ("viewable by everyone"), so this
  // needs its own super-admin check — nothing else here scopes it.
  const { data: isSuperAdmin } = await sb.rpc("is_super_admin");
  if (!isSuperAdmin) return actionError("FORBIDDEN");
  const { data, error } = await sb
    .from("profiles").select("id, full_name, name, username").eq("role", "organizer_pending");
  if (error) return actionError(error.message);
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.name ?? p.username ?? "Player" }));
}

// Search PUBLIC venues by name — this is how an Organizer finds a Vendor
// to invite, per spec ("search by venue name/location"). Deliberately not
// a user/phone/email search: venues are already a public, browsable
// surface (discover/book), searching people directly would be a privacy
// problem the existing app doesn't have anywhere else.
export async function searchVenuesToPartner(q: string): Promise<
  { id: string; name: string; address: string | null; owner_id: string }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const term = q.trim();
  if (term.length < 2) return [];

  const { data, error } = await sb
    .from("venues")
    .select("id, name, address, owner_id")
    .ilike("name", `%${term}%`)
    .neq("owner_id", user.id)
    .limit(10);
  if (error) return actionError(error.message);
  return data ?? [];
}

export async function sendPartnershipInvite(vendorId: string): Promise<Partnership | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("partnerships")
    .insert({ organizer_id: user.id, vendor_id: vendorId, status: "pending_invite" })
    .select()
    .single();
  if (error) return actionError(error.code === "23505" ? "You've already invited this vendor." : error.message);
  revalidatePath("/organize/partnerships");
  return data as Partnership;
}

// The organizer's own view of who they've invited/partnered with.
export async function listMyPartnerships(): Promise<
  (Partnership & { vendor_name: string })[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("partnerships").select("*").eq("organizer_id", user.id).order("created_at", { ascending: false });
  if (error) return actionError(error.message);
  const rows = (data ?? []) as Partnership[];

  const vendorIds = [...new Set(rows.map((r) => r.vendor_id))];
  const { data: profiles } = vendorIds.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", vendorIds)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.name ?? "—"]));

  return rows.map((r) => ({ ...r, vendor_name: nameMap.get(r.vendor_id) ?? "—" }));
}

// A Vendor's incoming invites — /admin/partnerships.
export async function listPartnershipInvitesForVendor(): Promise<
  (Partnership & { organizer_name: string })[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("partnerships").select("*").eq("vendor_id", user.id).order("created_at", { ascending: false });
  if (error) return actionError(error.message);
  const rows = (data ?? []) as Partnership[];

  const organizerIds = [...new Set(rows.map((r) => r.organizer_id))];
  const { data: profiles } = organizerIds.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", organizerIds)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.name ?? "—"]));

  return rows.map((r) => ({ ...r, organizer_name: nameMap.get(r.organizer_id) ?? "—" }));
}

// Vendor accepts/declines, or either side revokes an already-active one.
export async function respondToPartnership(
  id: string, status: "active" | "revoked"
): Promise<Partnership | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb.from("partnerships").update({ status }).eq("id", id).select().single();
  if (error) return actionError(error.message);
  revalidatePath("/admin/partnerships");
  revalidatePath("/organize/partnerships");
  return data as Partnership;
}

// Venues an Organizer can actually pick when creating a tournament —
// every venue owned by a vendor they have an ACTIVE partnership with.
// Feeds TournamentForm's venue picker for mode="organizer", replacing
// getMyVenues() (owned/staffed venues), which is what the Vendor's own
// create flow used before tournament creation moved off that role.
export async function getMyPartneredVenues(): Promise<
  { id: string; name: string }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data: partnerships } = await sb
    .from("partnerships").select("vendor_id").eq("organizer_id", user.id).eq("status", "active");
  const vendorIds = [...new Set((partnerships ?? []).map((p) => p.vendor_id))];
  if (vendorIds.length === 0) return [];

  const { data, error } = await sb.from("venues").select("id, name").in("owner_id", vendorIds).order("name");
  if (error) return actionError(error.message);
  return data ?? [];
}

// Vendor's read-only "Bookings" list — every tournament scheduled at any
// of their venues, regardless of who organizes it, for their own planning.
export async function listVendorTournamentBookings(): Promise<
  { id: string; name: string; status: string; venue_booking_status: string; starts_at: string; venue_name: string }[] | ActionError
> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { data, error } = await sb
    .from("tournaments")
    .select("id, name, status, venue_booking_status, starts_at, venues(name)")
    .order("starts_at", { ascending: true });
  if (error) return actionError(error.message);
  return ((data ?? []) as unknown as { id: string; name: string; status: string; venue_booking_status: string; starts_at: string; venues: { name: string } | null }[])
    .map((t) => ({ id: t.id, name: t.name, status: t.status, venue_booking_status: t.venue_booking_status, starts_at: t.starts_at, venue_name: t.venues?.name ?? "—" }));
}

export async function setVenueBookingStatus(
  tournamentId: string, status: "confirmed" | "declined"
): Promise<void | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const { error } = await sb.rpc("set_venue_booking_status", { p_id: tournamentId, p_status: status });
  if (error) return actionError(friendlyTournamentError(error.message));
  revalidatePath("/admin/venue-bookings");
}

// Tournaments the current user organizes — /organize dashboard. Same
// "everything, RLS scopes it" shape as getMyVendorTournaments() in
// src/lib/tournaments/actions.ts, but for the tournaments_read_organizer_own
// policy (owner_id = auth.uid()) instead of has_venue_access().
// Explicit owner-or-managed filter, NOT a bare select relying on RLS —
// tournaments_read_public (a separate policy, for the /tournaments
// browse page) makes every non-draft tournament readable by anyone,
// and RLS policies for the same command OR together. A plain
// `select *` here would return every published/live/cancelled/
// completed tournament on the platform to whoever's logged in, not
// just the ones this person owns or was granted "Owner access" to.
export async function getMyOrganizerTournaments(): Promise<Tournament[] | ActionError> {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");

  const { data: managed, error: managedErr } = await sb
    .from("tournament_managers").select("tournament_id").eq("user_id", user.id);
  if (managedErr) return actionError(managedErr.message);
  const managedIds = (managed ?? []).map((m) => m.tournament_id);

  const filters = [`owner_id.eq.${user.id}`];
  if (managedIds.length > 0) filters.push(`id.in.(${managedIds.join(",")})`);

  const { data, error } = await sb
    .from("tournaments").select("*").or(filters.join(",")).order("created_at", { ascending: false });
  if (error) return actionError(error.message);
  return (data ?? []) as Tournament[];
}
