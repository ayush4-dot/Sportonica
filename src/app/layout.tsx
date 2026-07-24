import type { Metadata, Viewport } from 'next'
import './globals.css'
import NavWrapper from '@/components/NavWrapper'
import PWARegister from '@/components/PWARegister'

export const metadata: Metadata = {
  // Social bots need absolute URLs for og:image. In production set
  // NEXT_PUBLIC_SITE_URL to your real domain (e.g. https://khelamna.com).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  title: 'Khelam Na — Find your game',
  description: 'Book courts, join pickup games, and find your regular crew across Kathmandu.',
  applicationName: 'Khelam Na',
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
    title: 'Khelam Na',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0D11',
  width: 'device-width',
  initialScale: 1,
  // Let the app fill the notch area on phones.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..60,400;12..60,500;12..60,600;12..60,700;12..60,800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Extensions inject attributes into body before React hydrates. */}
      <body suppressHydrationWarning>
        <NavWrapper />
        {children}
        <PWARegister />
      </body>
    </html>
  )
}
