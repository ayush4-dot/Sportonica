import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformRole } from "@/lib/platform/actions";
import "./platform.css";

export const dynamic = "force-dynamic";

// The gate: role checked against the DATABASE on every load of this area.
// Not user_metadata, not a cookie — the profiles.role column, under RLS.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const role = await getPlatformRole();
  if (role !== "super_admin") redirect("/login?redirect=/platform");

  return (
    <div className="plt">
      <header className="plt-top">
        <div className="plt-brand">
          <span className="plt-k">K</span>
          <div>
            <div className="plt-name">Khelum Na</div>
            <div className="plt-sub">Platform console</div>
          </div>
        </div>
        <nav className="plt-nav">
          <Link href="/platform">Overview</Link>
          <Link href="/discover">↗ App</Link>
        </nav>
      </header>
      <main className="plt-body">{children}</main>
    </div>
  );
}
