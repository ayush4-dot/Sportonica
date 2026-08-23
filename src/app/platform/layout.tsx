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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark.png" alt="" className="plt-k" />
          <div>
            <div className="plt-name">Sportonica</div>
            <div className="plt-sub">Platform console</div>
          </div>
        </div>
        <nav className="plt-nav">
          <Link href="/platform">Overview</Link>
          <Link href="/platform/events">+ Event</Link>
          <Link href="/platform/tournaments">Tournaments</Link>
          <Link href="/platform/revenue">Revenue</Link>
          <Link href="/platform/payments">Payments</Link>
          <Link href="/platform/bookings">Bookings</Link>
          <Link href="/platform/users">Users</Link>
          <Link href="/platform/reports">Reports</Link>
          <Link href="/discover">↗ App</Link>
        </nav>
      </header>
      <main className="plt-body">{children}</main>
    </div>
  );
}
