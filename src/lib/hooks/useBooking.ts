"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type BookingResult = { success: boolean; message: string };

export function useBooking() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  /** Call this before any booking/hosting action.
   *  If not logged in, saves the intended action and redirects to /login.
   *  Returns the current user if logged in, or null if redirected away. */
  async function requireAuth(intent?: { type: "join" | "host"; eventId?: string }) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      if (intent) {
        sessionStorage.setItem("khelumna_pending_intent", JSON.stringify(intent));
      }
      router.push("/login");
      return null;
    }
    return user;
  }

  /** Join an event. Auth-gated. */
  async function joinEvent(eventId: string): Promise<BookingResult> {
    const user = await requireAuth({ type: "join", eventId });
    if (!user) return { success: false, message: "Redirecting to login…" };

    setLoading(true);
    const { error } = await supabase
      .from("bookings")
      .insert({ event_id: eventId, user_id: user.id, status: "confirmed" });
    setLoading(false);

    if (error) {
      if (error.code === "23505") {
        return { success: false, message: "You've already joined this game." };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: "You're in! See you on the court." };
  }

  /** Cancel a booking. Auth-gated implicitly via RLS (user can only cancel their own). */
  async function cancelBooking(eventId: string): Promise<BookingResult> {
    const user = await requireAuth();
    if (!user) return { success: false, message: "Redirecting to login…" };

    setLoading(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("event_id", eventId)
      .eq("user_id", user.id);
    setLoading(false);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Booking cancelled." };
  }

  /** Host a new event. Auth-gated. */
  async function hostEvent(eventData: {
    sport: string;
    title: string;
    venue: string;
    event_date: string;
    max_players: number;
    fee?: number;
    description?: string;
    venue_lat?: number;
    venue_lng?: number;
  }): Promise<BookingResult & { eventId?: string }> {
    const user = await requireAuth({ type: "host" });
    if (!user) return { success: false, message: "Redirecting to login…" };

    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .insert({ ...eventData, host_id: user.id })
      .select()
      .single();
    setLoading(false);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Event created!", eventId: data.id };
  }

  /** Call this on the page that follows login (e.g. homepage or /discover)
   *  to resume whatever action the user was trying to do before being
   *  redirected to /login. */
  async function resumePendingIntent() {
    const raw = sessionStorage.getItem("khelumna_pending_intent");
    if (!raw) return;
    sessionStorage.removeItem("khelumna_pending_intent");

    const intent = JSON.parse(raw) as { type: "join" | "host"; eventId?: string };
    if (intent.type === "join" && intent.eventId) {
      await joinEvent(intent.eventId);
    }
    if (intent.type === "host") {
      router.push("/create");
    }
  }

  return { joinEvent, cancelBooking, hostEvent, resumePendingIntent, requireAuth, loading };
}
