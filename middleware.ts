import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesList) => {
          cookiesList.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesList.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Browsing is open (venues, groups). Login is required only at the point
  // of committing — the booking action itself checks auth server-side.
  const protectedPaths = ['/profile']
  if (!user && protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
    // Remember where they were headed, so login can send them back.
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin gate — must be logged in AND have an owner/admin role. Checked
  // against the database, not user_metadata: that field is set via
  // supabase.auth.updateUser() straight from the browser, with no server
  // round-trip at all, so trusting it here was a direct privilege-escalation
  // path independent of anything on the profiles table itself.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role
    // super_admin oversees the whole platform, so it can open the venue
    // console too. Without this it gets bounced to the homepage.
    if (role !== 'admin' && role !== 'venue_owner' && role !== 'super_admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // The post-Google role step needs a session.
  if (!user && request.nextUrl.pathname.startsWith('/welcome')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  // Previously this only excluded _next/static|_next/image|favicon.ico —
  // every other request, including every plain static file under /public
  // (panel photos, sport photos, icons, manifest, service worker) was
  // running a full Supabase auth round-trip before being served. None of
  // that is a page navigation and none of it needs the auth/role gating
  // below, so it's excluded here too.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/|panels/|sports/|\\.well-known/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|mp4|css|js|woff2?|geojson)$).*)',
  ],
}
