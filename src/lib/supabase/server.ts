import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
