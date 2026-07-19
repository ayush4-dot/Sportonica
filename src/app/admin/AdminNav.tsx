"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, CalendarClock, Ticket,
  Tag, Wallet, BarChart3, Users, Settings,
} from "lucide-react";

const NAV: { label: string; items: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "Operate",
    items: [
      { href: "/admin", label: "Overview", icon: <LayoutDashboard size={16} /> },
      { href: "/admin/calendar", label: "Calendar", icon: <CalendarClock size={16} /> },
      { href: "/admin/bookings", label: "Bookings", icon: <Ticket size={16} /> },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/venues", label: "Venues & courts", icon: <Building2 size={16} /> },
      { href: "/admin/pricing", label: "Pricing rules", icon: <Tag size={16} /> },
      { href: "/admin/staff", label: "Staff", icon: <Users size={16} /> },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/payouts", label: "Payouts", icon: <Wallet size={16} /> },
      { href: "/admin/analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
    ],
  },
];

export default function AdminNav() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  return (
    <aside className="adm-side">
      <Link href="/admin" className="adm-brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="adm-brand-mark">K</div>
        <div>
          <div className="adm-brand-name">Khelum Na</div>
          <div className="adm-brand-sub">Venue Console</div>
        </div>
      </Link>

      {NAV.map((group) => (
        <div key={group.label}>
          <div className="adm-navlabel">{group.label}</div>
          {group.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`adm-navlink ${isActive(it.href) ? "active" : ""}`}
            >
              {it.icon}
              <span>{it.label}</span>
            </Link>
          ))}
        </div>
      ))}

      <div style={{ marginTop: "auto" }}>
        <Link href="/admin/settings" className={`adm-navlink ${isActive("/admin/settings") ? "active" : ""}`}>
          <Settings size={16} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
