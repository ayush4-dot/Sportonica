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
// ── All bookings across every venue ─────────────────────────────
export async function allBookingsForPlatform() {
  const { sb } = await requireSuperAdmin();
  // court_bookings has no `status` column (that was the bug making this
  // page render empty — the query errored and the discarded error left
  // `data` as null). The real columns are `state` and `payment_status`.
  const { data, error } = await sb
    .from("court_bookings")
    .select("id, starts_at, ends_at, price, state, payment_status, source, customer_name, phone, venue_id, court_id")
    .order("starts_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const bookingIds = (data ?? []).map((b) => b.id);
  const venueIds = [...new Set((data ?? []).map((b) => b.venue_id).filter(Boolean))];
  const [{ data: venues }, { data: payments }] = await Promise.all([
    venueIds.length
      ? sb.from("venues").select("id, name").in("id", venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    // Connect each booking to the payment that verified it — method +
    // transaction id, for the super-admin's "who approved this and how".
    bookingIds.length
      ? sb.from("payments")
          .select("court_booking_id, payment_method, transaction_id, status")
          .eq("booking_type", "court_booking")
          .in("court_booking_id", bookingIds)
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] as { court_booking_id: string | null; payment_method: string; transaction_id: string; status: string }[] }),
  ]);
  const vMap = new Map((venues ?? []).map((v) => [v.id, v.name]));
  // A booking can have more than one payment attempt (rejected, then
  // resubmitted) — rows are newest-first, so the first one seen per
  // booking is the latest attempt.
  const payMap = new Map<string, { payment_method: string; transaction_id: string; status: string }>();
  for (const p of payments ?? []) {
    if (p.court_booking_id && !payMap.has(p.court_booking_id)) {
      payMap.set(p.court_booking_id, { payment_method: p.payment_method, transaction_id: p.transaction_id, status: p.status });
    }
  }

  return (data ?? []).map((b) => ({
    ...b,
    venue: vMap.get(b.venue_id) ?? "—",
    payment_method: payMap.get(b.id)?.payment_method ?? null,
    transaction_id: payMap.get(b.id)?.transaction_id ?? null,
  }));
}

// ── All users on the platform ───────────────────────────────────
export async function allUsersForPlatform() {
  const { sb } = await requireSuperAdmin();
  const { data } = await sb
    .from("profiles")
    .select("id, full_name, name, username, role, trust_score, city, is_public")
    .order("trust_score", { ascending: false });
  return (data ?? []).map((u) => ({
    ...u,
    display_name: u.full_name ?? u.name ?? u.username ?? "—",
  }));
}

// ── Change a user's role (promote to venue_owner, etc.) ─────────
export async function setUserRole(userId: string, role: "player" | "venue_owner" | "super_admin") {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform/users");
}

// ── Revenue: totals + per-venue payouts (Step 4) ────────────────
export async function platformRevenue() {
  const { sb } = await requireSuperAdmin();

  const { data: totals } = await sb
    .from("commission_ledger")
    .select("gross, commission, venue_payout, payout_status");

  const rows = totals ?? [];
  const gross = rows.reduce((s, r) => s + Number(r.gross || 0), 0);
  const commission = rows.reduce((s, r) => s + Number(r.commission || 0), 0);
  const payoutPending = rows
    .filter((r) => r.payout_status === "pending")
    .reduce((s, r) => s + Number(r.venue_payout || 0), 0);

  const { data: byVenue } = await sb
    .from("venue_payouts")
    .select("*")
    .order("payout_total", { ascending: false });

  return {
    gross, commission, payoutPending,
    bookings: rows.length,
    venues: (byVenue ?? []).map((v) => ({
      ...v,
      venue_name: v.venue_name ?? "—",
    })),
  };
}

// Mark a venue's pending payouts as paid (real payment wired later).
export async function markVenuePaid(venueId: string) {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb
    .from("commission_ledger")
    .update({ payout_status: "paid" })
    .eq("venue_id", venueId)
    .eq("payout_status", "pending");
  if (error) throw new Error(error.message);
  revalidatePath("/platform/revenue");
}

// ── Moderation: reports queue ───────────────────────────────────
export async function allReports() {
  const { sb } = await requireSuperAdmin();
  const { data } = await sb
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason, details, status, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const ids = [...new Set((data ?? []).map((r) => r.reporter_id))];
  const { data: profiles } = ids.length
    ? await sb.from("profiles").select("id, full_name, name, username").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; name: string | null; username: string | null }[] };
  const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.name ?? p.username ?? "—"]));

  return (data ?? []).map((r) => ({ ...r, reporter: pMap.get(r.reporter_id) ?? "—" }));
}

export async function setReportStatus(reportId: string, status: "reviewed" | "dismissed" | "open") {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb.from("reports").update({ status }).eq("id", reportId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform/reports");
}

export async function setVenueVerification(venueId: string, status: "verified" | "rejected" | "pending") {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb
    .from("venues")
    .update({ verification_status: status })
    .eq("id", venueId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}
