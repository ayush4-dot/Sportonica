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
    client.auth.onAuthStateChange(() => { cached = null; });
  }
  return client;
}

export function getCachedUser(): Promise<User | null> {
  if (!cached) {
    cached = sb().auth.getUser().then(({ data }) => data.user);
  }
  return cached;
}
