import { createClient as createAdminClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS and can call the auth admin
// API. SERVER ONLY. Never import this into a client component: the key it
// carries is a full-access credential. It's only ever used from "use
// server" actions (e.g. phone-based signup in src/lib/auth/actions.ts).
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SERVICE_ROLE_UNCONFIGURED");
  }
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
