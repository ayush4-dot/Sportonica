import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesList) => {
          // Server Components can READ cookies but not WRITE them — only
          // Server Actions and Route Handlers can. Supabase tries to refresh
          // the session cookie on every call, which throws in a page render.
          // Swallowing it is the documented pattern: middleware handles the
          // actual refresh, so nothing is lost here.
          try {
            cookiesList.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            /* called from a Server Component — safe to ignore */
          }
        },
      },
    }
  )
}

// Server-side pages often fetch several things that each independently
// need "who's logged in" (e.g. LeaguePage's browseSquads() + myMemberships()
// both called auth.getUser() on their own client, two redundant network
// round-trips for one page render). React's cache() memoizes this per
// request — same dedup idea as the client-side authCache.ts, but scoped
// to a single server render instead of a browser session.
export const getUser = cache(async () => {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  return user
})
