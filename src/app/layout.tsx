import type { Metadata, Viewport } from 'next'
import './globals.css'
import NavWrapper from '@/components/NavWrapper'
import PWARegister from '@/components/PWARegister'
import Onboarding from '@/components/Onboarding'
import CapacitorBridge from '@/components/CapacitorBridge'
import PageTransition from '@/components/PageTransition'

export const metadata: Metadata = {
  // Social bots need absolute URLs for og:image. In production set
  // NEXT_PUBLIC_SITE_URL to your real domain (e.g. https://sportonica.com).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  title: 'Sportonica — Find your game',
  description: 'Book courts, join pickup games, and find your regular crew across Kathmandu.',
  applicationName: 'Sportonica',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS ignores the manifest — these tell Safari it's an installable app.
  appleWebApp: {
    capable: true,
    title: 'Sportonica',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#F2EDE6',
  width: 'device-width',
  initialScale: 1,
  // Let the app fill the notch area on phones.
  viewportFit: 'cover',
}

// Function region is set via vercel.json's "regions" field (bom1 —
// Mumbai, closest to Nepal), not here: `preferredRegion` only applies to
// Edge Runtime functions, and this app runs standard Node.js serverless
// functions (needed for the cookie-based Supabase auth in lib/supabase/
// server.ts). Confirmed via x-vercel-id header before/after which one
// actually takes effect for this project.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="paper" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Extensions inject attributes into body before React hydrates. */}
      <body suppressHydrationWarning>
        <NavWrapper />
        <PageTransition>{children}</PageTransition>
        <PWARegister />
        <Onboarding />
        <CapacitorBridge />
      </body>
    </html>
  )
}
