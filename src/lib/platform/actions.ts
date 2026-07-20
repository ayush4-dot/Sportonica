"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Every platform action re-checks the role in the DATABASE — the UI gate
// alone is not security. is_super_admin() runs as the definer, so it can
// read the role even under RLS.
async function requireSuperAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const { data } = await sb.rpc("is_super_admin");
  if (!data) throw new Error("FORBIDDEN");
  return { sb, user };
}

export async function getPlatformRole(): Promise<string | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role ?? null;
}

// ── Overview data ───────────────────────────────────────────────
export async function platformOverview() {
  const { sb } = await requireSuperAdmin();

  const [venues, pending, users, bookings] = await Promise.all([
    sb.from("venues").select("id", { count: "exact", head: true }),
    sb.from("venues").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("court_bookings").select("id", { count: "exact", head: true }),
  ]);

  return {
    venues: venues.count ?? 0,
    pending: pending.count ?? 0,
    users: users.count ?? 0,
    bookings: bookings.count ?? 0,
  };
}

export async function allVenuesForPlatform() {
  const { sb } = await requireSuperAdmin();
  const { data } = await sb
    .from("venues")
    .select("id, name, venue_type, address, verification_status, status, created_at, owner_id")
    .order("created_at", { ascending: false });

  // attach owner names
  const ownerIds = [...new Set((data ?? []).map((v) => v.owner_id).filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", ownerIds)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const ownerMap = new Map((owners ?? []).map((o) => [o.id, o.full_name ?? o.name ?? "—"]));

  return (data ?? []).map((v) => ({ ...v, owner: ownerMap.get(v.owner_id) ?? "—" }));
}

// ── Venue approval (the trust gate) ─────────────────────────────
export async function setVenueVerification(venueId: string, status: "verified" | "rejected" | "pending") {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb
    .from("venues")
    .update({ verification_status: status })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}
