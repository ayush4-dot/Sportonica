"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyPaymentError, bookingLabel } from "./types";
import type { Payment, PaymentMethod, PaymentMethodConfig } from "./types";
import { notifyPaymentReviewed, notifyHostedEventIfPublished } from "@/lib/mail/notify";

// Every platform action re-checks the role in the DATABASE — the UI gate
// alone is not security. Mirrors the identical helper already used in
// src/lib/platform/actions.ts (each domain file keeps its own copy, the
// established convention in this codebase rather than a shared import).
async function requireSuperAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const { data } = await sb.rpc("is_super_admin");
  if (!data) throw new Error("FORBIDDEN");
  return { sb, user };
}

// ── Payment Settings (QR management) ──────────────────────────────
export async function getPaymentMethodsAdmin(): Promise<(PaymentMethodConfig & { updated_by_name: string | null })[]> {
  const { sb } = await requireSuperAdmin();
  const { data, error } = await sb.from("payment_methods").select("*").order("method");
  if (error) throw new Error(error.message);
  const methods = (data ?? []) as PaymentMethodConfig[];

  const updaterIds = [...new Set(methods.map((m) => m.updated_by).filter((id): id is string => !!id))];
  const { data: profiles } = updaterIds.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", updaterIds)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.name ?? "—"]));

  return methods.map((m) => ({ ...m, updated_by_name: m.updated_by ? nameMap.get(m.updated_by) ?? "—" : null }));
}

export async function setPaymentMethodConfig(
  method: PaymentMethod,
  patch: { enabled?: boolean; merchant_name?: string; account_identifier?: string }
) {
  const { sb } = await requireSuperAdmin();
  const { error } = await sb.from("payment_methods").update(patch).eq("method", method);
  if (error) throw new Error(error.message);
  revalidatePath("/platform/payments");
}

// Single-image replace (not an array append like venue photos) — mirrors
// uploadVenuePhoto()'s upload shape but for a one-QR-per-method field.
export async function uploadPaymentQr(method: PaymentMethod, file: File) {
  const { sb } = await requireSuperAdmin();

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    throw new Error("Upload a JPG, PNG or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("QR image must be under 5 MB.");
  }
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${method}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage.from("payment-qr").upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { error } = await sb.from("payment_methods").update({ qr_path: path }).eq("method", method);
  if (error) throw new Error(error.message);

  revalidatePath("/platform/payments");
  return path;
}

export async function removePaymentQr(method: PaymentMethod) {
  const { sb } = await requireSuperAdmin();
  const { data: current } = await sb.from("payment_methods").select("qr_path").eq("method", method).maybeSingle();

  const { error } = await sb.from("payment_methods").update({ qr_path: null }).eq("method", method);
  if (error) throw new Error(error.message);

  // Best-effort cleanup — the config change (above) is what actually
  // matters; a leftover orphaned file in storage isn't a correctness bug.
  if (current?.qr_path) {
    await sb.storage.from("payment-qr").remove([current.qr_path]);
  }
  revalidatePath("/platform/payments");
}

// ── Payment Verification Center ───────────────────────────────────
export async function listPendingPayments() {
  const { sb } = await requireSuperAdmin();
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .eq("status", "PENDING_VERIFICATION")
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);

  const payments = (data ?? []) as Payment[];
  return attachDisplayInfo(sb, payments);
}

export async function listAllPayments(limit = 200) {
  const { sb } = await requireSuperAdmin();
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return attachDisplayInfo(sb, (data ?? []) as Payment[]);
}

// Batches the customer-name/booking-label/venue/when lookups a review table
// needs so the UI doesn't have to join client-side (and so this stays O(1)
// queries regardless of how many rows are in the list, not O(n)).
async function attachDisplayInfo(
  sb: Awaited<ReturnType<typeof createClient>>,
  payments: Payment[]
) {
  const userIds = [...new Set(payments.map((p) => p.user_id))];
  const { data: profiles } = userIds.length
    ? await sb.from("profiles").select("id, full_name, name").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null; name: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.name ?? "—"]));

  const courtIds = payments.filter((p) => p.booking_type === "court_booking").map((p) => p.court_booking_id!);
  const eventBookingIds = payments.filter((p) => p.booking_type === "event_booking").map((p) => p.event_booking_id!);

  const whenMap = new Map<string, { venue: string; when: string }>();

  if (courtIds.length) {
    const { data: courtBookings } = await sb
      .from("court_bookings").select("id, starts_at, venue_id").in("id", courtIds);
    const venueIds = [...new Set((courtBookings ?? []).map((b) => b.venue_id).filter(Boolean))];
    const { data: venues } = venueIds.length
      ? await sb.from("venues").select("id, name").in("id", venueIds)
      : { data: [] as { id: string; name: string }[] };
    const venueNameMap = new Map((venues ?? []).map((v) => [v.id, v.name]));
    for (const b of courtBookings ?? []) {
      whenMap.set(`court_booking:${b.id}`, { venue: venueNameMap.get(b.venue_id) ?? "—", when: b.starts_at });
    }
  }

  if (eventBookingIds.length) {
    const { data: legacyBookings } = await sb
      .from("bookings").select("id, event_id").in("id", eventBookingIds);
    const eventIds = [...new Set((legacyBookings ?? []).map((b) => b.event_id).filter(Boolean))];
    const { data: events } = eventIds.length
      ? await sb.from("events").select("id, venue, event_date").in("id", eventIds)
      : { data: [] as { id: string; venue: string | null; event_date: string }[] };
    const eventMap = new Map((events ?? []).map((e) => [e.id, e]));
    for (const b of legacyBookings ?? []) {
      const ev = b.event_id ? eventMap.get(b.event_id) : null;
      whenMap.set(`event_booking:${b.id}`, { venue: ev?.venue ?? "—", when: ev?.event_date ?? "" });
    }
  }

  return payments.map((p) => {
    const w = whenMap.get(`${p.booking_type}:${p.court_booking_id ?? p.event_booking_id}`);
    return {
      ...p,
      customer_name: nameMap.get(p.user_id) ?? "—",
      booking_label: bookingLabel(p.booking_type, p.court_booking_id ?? p.event_booking_id ?? ""),
      venue_name: w?.venue ?? "—",
      booking_when: w?.when ?? "",
    };
  });
}

// Booking/venue/date/time context for the review screen — the `payments`
// row itself only carries the amount and a venue_id, not human-readable
// venue/date details.
export async function getPaymentBookingDetails(paymentId: string): Promise<{
  venue: string; date: string; time: string;
}> {
  const { sb } = await requireSuperAdmin();
  const { data: payment, error } = await sb.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw new Error("Payment not found.");

  const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kathmandu",
  });

  if (payment.booking_type === "court_booking") {
    const { data: booking } = await sb
      .from("court_bookings").select("starts_at, ends_at, venue_id").eq("id", payment.court_booking_id).maybeSingle();
    const { data: venue } = booking?.venue_id
      ? await sb.from("venues").select("name").eq("id", booking.venue_id).maybeSingle()
      : { data: null };
    return {
      venue: venue?.name ?? "—",
      date: booking?.starts_at ? fmt(booking.starts_at) : "—",
      time: booking?.starts_at && booking?.ends_at
        ? `${fmt(booking.starts_at).split(", ").pop()} – ${fmt(booking.ends_at).split(", ").pop()}`
        : "—",
    };
  }

  const { data: booking } = await sb.from("bookings").select("event_id").eq("id", payment.event_booking_id).maybeSingle();
  const { data: event } = booking?.event_id
    ? await sb.from("events").select("venue, event_date").eq("id", booking.event_id).maybeSingle()
    : { data: null };
  return {
    venue: event?.venue ?? "—",
    date: event?.event_date ? fmt(event.event_date) : "—",
    time: event?.event_date ? fmt(event.event_date).split(", ").pop() ?? "—" : "—",
  };
}

export async function getPaymentOverviewStats() {
  const { sb } = await requireSuperAdmin();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [pending, approvedToday, rejectedToday, approvedAll, esewaApproved, khaltiApproved] = await Promise.all([
    sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "PENDING_VERIFICATION"),
    sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "APPROVED").gte("reviewed_at", todayIso),
    sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "REJECTED").gte("reviewed_at", todayIso),
    sb.from("payments").select("expected_amount").eq("status", "APPROVED"),
    sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("payment_method", "esewa"),
    sb.from("payments").select("id", { count: "exact", head: true }).eq("status", "APPROVED").eq("payment_method", "khalti"),
  ]);

  const totalCollected = (approvedAll.data ?? []).reduce((s, r) => s + Number(r.expected_amount || 0), 0);

  return {
    pending: pending.count ?? 0,
    approvedToday: approvedToday.count ?? 0,
    rejectedToday: rejectedToday.count ?? 0,
    totalCollected,
    esewaCount: esewaApproved.count ?? 0,
    khaltiCount: khaltiApproved.count ?? 0,
  };
}

// Screenshots live in a private bucket — always view via a short-lived
// signed URL, never a public one (spec: a customer must not be able to
// guess another customer's screenshot URL).
export async function getSignedScreenshotUrl(paymentId: string): Promise<string> {
  const { sb } = await requireSuperAdmin();
  const { data: payment, error: pErr } = await sb
    .from("payments").select("screenshot_path").eq("id", paymentId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!payment) throw new Error("Payment not found.");

  const { data, error } = await sb.storage.from("payment-proofs").createSignedUrl(payment.screenshot_path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// The only write path for approve/reject — everything (auth, state-machine
// enforcement, the linked booking's payment_status/state) happens inside
// review_payment() in supabase/payments.sql.
export async function reviewPayment(
  paymentId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
  note?: string
): Promise<Payment> {
  const { sb } = await requireSuperAdmin();
  const { data, error } = await sb.rpc("review_payment", {
    p_payment_id: paymentId,
    p_action: action,
    p_reason: reason ?? null,
    p_note: note ?? null,
  });
  if (error) throw new Error(friendlyPaymentError(error.message));

  revalidatePath("/platform/payments");

  const payment = data as Payment;
  // If this booking asked to open its slot to other players, the RPC
  // just published the event for the first time (see
  // maybe_publish_hosted_event() in supabase/payments.sql) — the "game
  // is live" email only makes sense now, not at booking time.
  if (action === "APPROVE" && payment.booking_type === "court_booking" && payment.court_booking_id) {
    await notifyHostedEventIfPublished(payment.court_booking_id);
  }

  // Notify the customer after the write succeeds — never let a failed
  // email/notification undo a successful review.
  await notifyPaymentReviewed(paymentId);

  return payment;
}
