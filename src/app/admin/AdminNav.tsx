"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV } from "./nav";

const mainGroups = NAV.filter((g) => g.label !== "Account");
const accountItem = NAV.find((g) => g.label === "Account")?.items[0];

export default function AdminNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // The sidebar becomes a drawer below 900px — close it whenever the route
  // changes, so it never sits open over the page you just picked. Adjusted
  // during render (not an effect) per React's rules on resetting state
  // when a prop/derived value changes.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }

  const isActive = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  const brand = (
    <Link href="/admin" className="adm-brand" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="adm-brand-mark">S</div>
      <div>
        <div className="adm-brand-name">Sportonica</div>
        <div className="adm-brand-sub">Venue Console</div>
      </div>
    </Link>
  );

  return (
    <>
      {/* Mobile-only app bar — the sidebar collapses into a drawer below
          900px, so this is the only way in to open it there. */}
      <div className="adm-mobilebar">
        <button className="adm-mobilebar-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="adm-mobilebar-brand">
          <div className="adm-brand-mark">S</div>
          <span>Sportonica</span>
        </div>
      </div>

      {open && <div className="adm-scrim" onClick={() => setOpen(false)} />}

      <aside className={`adm-side ${open ? "open" : ""}`}>
        <div className="adm-side-head">
          {brand}
          <button className="adm-side-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        {mainGroups.map((group) => (
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

        {accountItem && (
          <div style={{ marginTop: "auto" }}>
            <Link href={accountItem.href} className={`adm-navlink ${isActive(accountItem.href) ? "active" : ""}`}>
              {accountItem.icon}
              <span>{accountItem.label}</span>
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
