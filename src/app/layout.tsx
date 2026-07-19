import type { Metadata } from 'next'
import './globals.css'
import NavWrapper from '@/components/NavWrapper'

export const metadata: Metadata = {
  // Social bots need absolute URLs for og:image. In production set
  // NEXT_PUBLIC_SITE_URL to your real domain (e.g. https://khelumna.com).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  title: 'Khelum Na — Find your game',
  description: 'Find and join sports events near you in Kathmandu',
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
      <body>
        <NavWrapper />
        {children}
      </body>
    </html>
  )
}
