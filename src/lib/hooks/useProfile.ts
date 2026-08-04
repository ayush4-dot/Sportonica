"use client";

import { useCallback, useSyncExternalStore } from "react";
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

type UserRef = { id: string; email: string | undefined };

// Shared across every useProfile() caller on the page (header, dock, home
// content, ...) instead of each independently fetching the profile row
// and attaching its own onAuthStateChange listener — with several of
// those mounted at once, that meant the same query firing 3-6x and the
// same session-validation work repeating per listener.
let snapshot: { profile: Profile | null; user: UserRef | null; loading: boolean } = {
  profile: null, user: null, loading: true,
};
let inFlight: Promise<void> | null = null;
let authListenerSetup = false;
const listeners = new Set<() => void>();

function setSnapshot(next: Partial<typeof snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

async function loadProfile(): Promise<void> {
  setSnapshot({ loading: true });
  const u = await getCachedUser();
  if (!u) { setSnapshot({ loading: false, user: null, profile: null }); return; }
  setSnapshot({ user: { id: u.id, email: u.email } });

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
    setSnapshot({ profile: created as Profile | null, loading: false });
  } else {
    setSnapshot({ profile: data as Profile, loading: false });
  }
}

function ensureLoaded(): Promise<void> {
  if (!inFlight) inFlight = loadProfile();
  return inFlight;
}

function ensureAuthListener() {
  if (authListenerSetup) return;
  authListenerSetup = true;
  sb().auth.onAuthStateChange(() => {
    inFlight = null;
    void ensureLoaded();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureAuthListener();
  void ensureLoaded();
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

// Stable reference (not a fresh object per call) — required for
// useSyncExternalStore's server-render path, hit by any statically
// prerendered page (e.g. /login) that includes AppHeader/MagnetDock.
const SERVER_SNAPSHOT = { profile: null, user: null, loading: true };
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useProfile() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const reload = useCallback(() => {
    inFlight = null;
    return ensureLoaded();
  }, []);

  const update = useCallback(async (patch: Partial<Pick<Profile, "full_name" | "phone" | "avatar_url">>) => {
    if (!snapshot.user) return { error: "Not authenticated" };
    const { error } = await sb().from("profiles").update(patch).eq("id", snapshot.user.id);
    if (!error) {
      setSnapshot({ profile: snapshot.profile ? { ...snapshot.profile, ...patch } : snapshot.profile });
    }
    return { error: error?.message ?? null };
  }, []);

  return { profile: snap.profile, user: snap.user, loading: snap.loading, reload, update };
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
