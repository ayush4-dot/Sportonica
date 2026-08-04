"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/authCache";

const sb = () => createClient();

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "player" | "venue_owner" | "admin" | "super_admin";
  phone: string | null;
  trust_score: number;
  games_played: number;
  games_hosted: number;
  cancellations: number;
  created_at: string;
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser]       = useState<{ id: string; email: string | undefined } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const u = await getCachedUser();
    if (!u) { setLoading(false); return; }

    setUser({ id: u.id, email: u.email });

    const { data, error } = await sb()
      .from("profiles")
      .select("*")
      .eq("id", u.id)
      .maybeSingle();

    if (error || !data) {
      // Profile doesn't exist yet — create it
      const { data: created } = await sb()
        .from("profiles")
        .upsert({
          id:        u.id,
          full_name: u.user_metadata?.full_name ?? u.email ?? null,
          role:      u.user_metadata?.role ?? "player",
        }, { onConflict: "id" })
        .select()
        .single();
      setProfile(created as Profile | null);
    } else {
      setProfile(data as Profile);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Re-fetch on sign-in/sign-out so consumers (header, dock, nav) that
    // now share this hook instead of polling auth themselves stay live.
    const { data: sub } = sb().auth.onAuthStateChange(() => { void load(); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const update = async (patch: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => {
    if (!user) return { error: "Not authenticated" };
    const { error } = await sb().from("profiles").update(patch).eq("id", user.id);
    if (!error) setProfile(p => p ? { ...p, ...patch } : p);
    return { error: error?.message ?? null };
  };

  return { profile, user, loading, reload: load, update };
}

// ── Fetch any user's public profile ──────────────────────────────
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await sb()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data as Profile | null;
}
