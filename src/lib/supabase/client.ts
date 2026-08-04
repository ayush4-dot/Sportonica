import { createBrowserClient } from '@supabase/ssr'

// A real singleton, not a factory — this used to create a brand new
// client (new session listeners, new internal auth-state machinery) on
// every single call. With several components independently calling
// createClient() on the same page (header, dock, home content, ...),
// that meant redundant session validation work multiplying across all of
// them. One shared client per browser tab is the documented pattern.
//
// Created eagerly at module load rather than lazily-cached behind a
// ReturnType<typeof createBrowserClient> variable — that pattern broke
// downstream type inference for consumers (Supabase's realtime .on(...)
// overloads went implicit-any) because createBrowserClient has multiple
// overloads and ReturnType<> resolves against the wrong one. A plain
// top-level call keeps the exact type a live call site would produce.
const client = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function createClient() {
  return client
}
