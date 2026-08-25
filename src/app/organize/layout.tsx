import Link from "next/link";
import "../platform/platform.css";
import "../admin/admin.css";

export const dynamic = "force-dynamic";

// Organizer console — deliberately its own top-nav shell (like /platform)
// rather than /admin's sidebar-console (AdminNav assumes venue operations:
// courts, pricing, staff — none of which apply to an Organizer, who never
// needs to own a venue). Auth/role gating happens per-page (mirrors how
// /admin/tournaments/new already gates on "no venues yet" rather than a
// hard layout-level redirect) since a first-time visitor should land on
// the self-serve "Become an organizer" CTA, not get bounced away from it.
export default function OrganizeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="plt">
      <header className="plt-top">
        <div className="plt-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark.png" alt="" className="plt-k" />
          <div>
            <div className="plt-name">Sportonica</div>
            <div className="plt-sub">Organize</div>
          </div>
        </div>
        <nav className="plt-nav">
          <Link href="/organize">Tournaments</Link>
          <Link href="/organize/partnerships">Partnerships</Link>
          <Link href="/organize/tournaments/new">+ Tournament</Link>
          <Link href="/discover">↗ App</Link>
        </nav>
      </header>
      <main className="plt-body">{children}</main>
    </div>
  );
}
