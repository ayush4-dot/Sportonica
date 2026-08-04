"use client";

import { useEffect } from "react";
import { getCachedUser } from "@/lib/supabase/authCache";
import { getOrCreateKeyPair } from "@/lib/crypto/keyStore";

/**
 * Publishes this device's E2E public key as soon as someone's logged in,
 * not only when they happen to open a DM thread. Key generation used to
 * be lazy (inside DMThread on mount), which meant a friend messaging you
 * for the first time would hit "waiting for encryption key" until *you*
 * separately opened chat at least once. Renders nothing.
 */
export default function EnsureE2EKey() {
  useEffect(() => {
    (async () => {
      const user = await getCachedUser();
      if (user) getOrCreateKeyPair().catch(() => { /* best-effort */ });
    })();
  }, []);

  return null;
}
