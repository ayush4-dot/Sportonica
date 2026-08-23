"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/authCache";

export type Notification = {
  id: string;
  kind: "joined" | "left" | "spots_needed" | "hosted" | "event" | "friend_request" | "friend_accepted"
      | "payment_submitted" | "payment_approved" | "payment_rejected"
      | "game_published" | "game_joined" | "game_left" | "game_cancelled"
      | "game_join_requested" | "game_join_rejected"
      | "game_payment_required" | "game_payment_reminder" | "game_payment_submitted"
      | "game_payment_verified" | "game_payment_rejected" | "game_payment_expired"
      | "game_host_payment_submitted" | "game_host_payment_expired"
      | "game_payment_cash_selected"
      | "tournament_published" | "tournament_registration_submitted"
      | "tournament_payment_verified" | "tournament_payment_rejected"
      | "tournament_announcement";
  title: string;
  body: string | null;
  event_id: string | null;
  squad_id: string | null;
  conversation_id: string | null;
  game_id: string | null;
  tournament_id: string | null;
  read: boolean;
  created_at: string;
};

export function useNotifications() {
  const supabase = createClient();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = await getCachedUser();
    if (!user) { setItems([]); setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, event_id, squad_id, conversation_id, game_id, tournament_id, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: refetch when a new notification arrives for this user.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("notifications-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, load]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.rpc("mark_notifications_read");
  }, [supabase]);

  return { items, unread, loading, markAllRead, reload: load };
}
