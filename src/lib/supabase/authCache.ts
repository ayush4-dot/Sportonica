"use client";

import { createClient } from "./client";
import type { User } from "@supabase/supabase-js";

// Several components mount at once on every page (header, dock, nav,
// notifications) and each used to call `auth.getUser()` independently —
// on a mobile connection those redundant round-trips visibly stack up.
// This shares one in-flight/resolved call across all of them, and drops
// the cache whenever auth actually changes so nothing goes stale.
let client: ReturnType<typeof createClient> | null = null;
let cached: Promise<User | null> | null = null;

function sb() {
  if (!client) {
    client = createClient();
    // Supabase fires this once synchronously-ish right after subscribing
    // with a synthetic INITIAL_SESSION event, even when nothing changed —
    // resetting the cache on that wiped out the very first getCachedUser()
    // call before it had even resolved, forcing a second real request.
    // Deferred with setTimeout — Supabase's own auth methods are
    // serialized behind an internal, non-reentrant lock, and this
    // fires *during* whatever auth call triggered it (e.g.
    // signInAnonymously()). getCachedUser() below calls auth.getUser()
    // on the same client, so reacting synchronously here would try to
    // reacquire that lock from inside itself and deadlock forever.
    client.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      setTimeout(() => { cached = null; }, 0);
    });
  }
  return client;
}

export function getCachedUser(): Promise<User | null> {
  if (!cached) {
    // Anonymous sessions (created silently for tournament registration —
    // see TournamentRegisterTab) aren't real accounts: no profile row to
    // show, no friends, nothing to notify. Every caller of this function
    // treats a non-null user as "show the logged-in UI" (header/dock
    // profile link → /profile, notifications, friend requests, E2E key
    // setup), and /profile 404/misbehaves for a user with no profile row.
    // Filtering them out here, once, keeps that whole surface showing
    // "sign in" as it did before anonymous registration existed.
    cached = sb().auth.getUser().then(({ data }) => data.user?.is_anonymous ? null : data.user);
  }
  return cached;
}
