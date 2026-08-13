"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyPaymentError } from "./types";
import type { BookingType, Payment, PaymentMethod, PaymentMethodConfig } from "./types";
import { notifyPaymentSubmitted, notifyHostedEventIfPublished, notifyPlayTogetherGamePublishedIfAny } from "@/lib/mail/notify";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

// Public: checkout needs to know which methods are enabled and show their
// QR/account details. RLS on payment_methods allows select to everyone.
export async function getPaymentMethods(): Promise<PaymentMethodConfig[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("payment_methods").select("*").order("method");
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentMethodConfig[];
}

// Upload a payment screenshot. Only PNG/JPG/WebP, 5MB cap — same shape as
// uploadAvatar()/uploadVenuePhoto() elsewhere in the codebase. Path is
// prefixed with the uploader's own uid so storage RLS can scope reads to
// "owner or admin" via (storage.foldername(name))[1].
export async function uploadPaymentProof(
  bookingType: BookingType,
  bookingId: string,
  file: File
): Promise<string> {
  const { sb, user } = await requireUser();

  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) {
    throw new Error("Upload a JPG, PNG or WebP screenshot.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Screenshot must be under 5 MB.");
  }
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[file.type];
  const path = `${user.id}/${bookingType}-${bookingId}-${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("payment-proofs").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);

  return path;
}

// The only write path for a payments row — everything else (amount,
// ownership, method availability, duplicate checks) is enforced inside the
// submit_payment() security-definer function, not here.
export async function submitPayment(
  bookingType: BookingType,
  bookingId: string,
  method: PaymentMethod,
  transactionId: string,
  screenshotPath: string
): Promise<Payment> {
  const { sb } = await requireUser();

  const { data, error } = await sb.rpc("submit_payment", {
    p_booking_type: bookingType,
    p_booking_id: bookingId,
    p_payment_method: method,
    p_transaction_id: transactionId,
    p_screenshot_path: screenshotPath,
  });
  if (error) throw new Error(friendlyPaymentError(error.message));

  const payment = data as Payment;

  revalidatePath("/my-games");

  // Notify admins after the write succeeds. notifyPaymentSubmitted()
  // swallows its own errors — a submitted payment must stay submitted
  // even if the email/notification side fails.
  await notifyPaymentSubmitted(payment.id);

  return payment;
}

// Zero-amount bookings (free hosted games) skip the QR step entirely, but
// "it's free" is still re-verified server-side inside the RPC.
export async function confirmFreeBooking(bookingType: BookingType, bookingId: string): Promise<void> {
  const { sb } = await requireUser();
  const { error } = await sb.rpc("confirm_free_booking", {
    p_booking_type: bookingType,
    p_booking_id: bookingId,
  });
  if (error) throw new Error(friendlyPaymentError(error.message));
  revalidatePath("/my-games");

  // Free court, hosting requested: the RPC just published the event for
  // the first time (maybe_publish_hosted_event() in supabase/payments.sql).
  // A Play Together game is a separate, mutually-exclusive path — one of
  // these two is always a no-op.
  if (bookingType === "court_booking") {
    await notifyHostedEventIfPublished(bookingId);
    await notifyPlayTogetherGamePublishedIfAny(bookingId);
  }
}

// Used by /my-games and by a checkout page revisited mid-flow to know
// whether to show "awaiting verification", "rejected — resubmit", or
// nothing. RLS already scopes this to the caller's own payments.
export async function getMyPaymentStatus(bookingType: BookingType, bookingId: string): Promise<Payment | null> {
  const { sb } = await requireUser();
  const column = bookingType === "court_booking" ? "court_booking_id" : "event_booking_id";
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .eq(column, bookingId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Payment | null;
}
