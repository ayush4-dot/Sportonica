import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cookie-free anonymous Supabase client for SERVER rendering of fully
// public pages (home rails, public listings). Because it never calls
// cookies(), a page whose only data source is this client can be
// statically rendered and cached (`export const revalidate = …`) instead
// of being forced dynamic — and therefore re-rendered on every single
// request against a database ~150ms away.
//
// RLS still applies: anon only sees what your public SELECT policies
// allow (the same data the browser client shows on /discover).
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
