"use client";

import { useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Volleyball, CalendarPlus, MessagesSquare, LogIn, LogOut, LayoutDashboard, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/useProfile";

type Item = { label: string; href: string; icon: React.ReactNode };

const LINKS: Item[] = [
  { label: "Home", href: "/", icon: <Home size={20} /> },
  { label: "Play", href: "/discover", icon: <Volleyball size={20} /> },
  { label: "Book", href: "/create", icon: <CalendarPlus size={20} /> },
  { label: "Chat", href: "/messages", icon: <MessagesSquare size={20} /> },
  { label: "Profile", href: "/profile", icon: <User size={20} /> },
];

// Magnify curve: how much a dock item scales based on distance (in item
// slots) from the hovered one. Nearest grows most, neighbours less.
function magnify(distance: number) {
  const d = Math.abs(distance);
  if (d === 0) return 1.5;
  if (d === 1) return 1.28;
  if (d === 2) return 1.12;
  return 1;
}

export default function MagnetDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Shared with the header/nav instead of each firing its own auth +
  // profile round-trip on mount — noticeable savings on mobile.
  const { user, profile } = useProfile();
  const dbRole = profile?.role ?? null;

  // Hide dock on admin console, auth pages (they have their own chrome).
  const hidden = pathname.startsWith("/admin") || pathname.startsWith("/platform") || pathname.startsWith("/login") || pathname.startsWith("/signup");
  if (hidden) return null;

  const isOwner = dbRole === "venue_owner" || dbRole === "admin";
  const firstName =
    profile?.full_name?.trim().split(" ")[0] ??
    user?.email?.split("@")[0] ?? "Account";

  async function logout() {
    await createClient().auth.signOut();
    setMenuOpen(false);
    window.location.href = "/";
  }

  // "Chat" covers all three social tabs (Messages/Players/Groups), not just its own href.
  const CHAT_PREFIXES = ["/messages", "/players", "/league"];
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/messages") return CHAT_PREFIXES.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  };

  // account item lives at index = LINKS.length for magnify math
  const accountIdx = LINKS.length;

  return (
    <>
      <style>{`
        .dock {
          position: fixed; right: 16px; top: 50%;
          transform: translateY(-50%) translateZ(0);
          -webkit-transform: translateY(-50%) translateZ(0);
          z-index: 300; display: flex; flex-direction: column; gap: 10px;
          padding: 12px 10px; border-radius: 26px;
          background: color-mix(in srgb, var(--ink, #0B0D11) 55%, transparent);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 20px 60px -18px rgba(0,0,0,0.6);
          max-height: calc(100vh - 32px);
          isolation: isolate;
        }
        .dock-item {
          position: relative; width: 46px; height: 46px; border-radius: 15px;
          display: grid; place-items: center; cursor: pointer;
          color: color-mix(in srgb, var(--chalk, #F2EDE6) 70%, transparent);
          background: rgba(255,255,255,0.04);
          border: 1px solid transparent; text-decoration: none;
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1),
                      background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
          transform-origin: center center;
        }
        .dock-item:hover { color: var(--chalk, #F2EDE6); background: rgba(255,255,255,0.09); }
        .dock-item.active {
          color: #006241; background: rgba(0,98,65,0.14);
          border-color: rgba(0,98,65,0.3);
        }
        .dock-item.account { background: rgba(0,98,65,0.16); border-color: rgba(0,98,65,0.3); color: #F2EDE6; }
        /* label that slides in from the right-hand side */
        .dock-label {
          position: absolute; right: calc(100% + 14px); top: 50%;
          transform: translateY(-50%) translateX(8px);
          background: var(--ink, #0B0D11); color: var(--chalk, #F2EDE6);
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
          white-space: nowrap; padding: 7px 13px; border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.12);
          opacity: 0; pointer-events: none;
          transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
          box-shadow: 0 8px 24px -8px rgba(0,0,0,0.5);
        }
        .dock-item:hover .dock-label { opacity: 1; transform: translateY(-50%) translateX(0); }
        .dock-label::after {
          content: ''; position: absolute; left: 100%; top: 50%; transform: translateY(-50%);
          border: 5px solid transparent; border-left-color: var(--ink, #0B0D11);
        }
        .dock-avatar {
          width: 26px; height: 26px; border-radius: 50%; background: #006241;
          display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff;
        }
        .dock-menu {
          position: absolute; right: calc(100% + 14px); bottom: 0;
          background: #14171E; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 13px; padding: 7px; min-width: 190px;
          box-shadow: 0 20px 50px -12px rgba(0,0,0,0.6);
        }
        .dock-menu a, .dock-menu button {
          display: flex; align-items: center; gap: 10px; width: 100%;
          background: none; border: none; cursor: pointer; text-align: left;
          color: color-mix(in srgb, var(--chalk,#F2EDE6) 82%, transparent);
          font-family: 'Inter',sans-serif; font-size: 13.5px; font-weight: 500;
          padding: 10px 11px; border-radius: 8px; text-decoration: none;
          transition: background 0.15s, color 0.15s;
        }
        .dock-menu a:hover, .dock-menu button:hover { background: rgba(255,255,255,0.06); color: var(--chalk,#F2EDE6); }
        .dock-menu .sep { height: 1px; background: rgba(255,255,255,0.08); margin: 5px 0; }

        /* ── Paper theme ── */
        [data-theme="paper"] .dock {
          background: rgba(255,255,255,0.7);
          border-color: rgba(20,23,30,0.12);
          box-shadow: 0 20px 60px -18px rgba(20,23,30,0.25);
        }
        [data-theme="paper"] .dock-item { background: rgba(20,23,30,0.05); color: rgba(20,23,30,0.7); }
        [data-theme="paper"] .dock-item:hover { background: rgba(20,23,30,0.1); color: #14171E; }
        [data-theme="paper"] .dock-item.active { color: #006241; background: rgba(0,98,65,0.16); border-color: rgba(0,98,65,0.4); }
        [data-theme="paper"] .dock-label { background: #14171E; color: #F2EDE6; border-color: rgba(20,23,30,0.2); }
        [data-theme="paper"] .dock-label::after { border-left-color: #14171E; }
        [data-theme="paper"] .dock-menu { background: #FFFFFF; border-color: rgba(20,23,30,0.12); box-shadow: 0 20px 50px -12px rgba(20,23,30,0.25); }
        [data-theme="paper"] .dock-menu a, [data-theme="paper"] .dock-menu button { color: rgba(20,23,30,0.85); }
        [data-theme="paper"] .dock-menu a:hover, [data-theme="paper"] .dock-menu button:hover { background: rgba(20,23,30,0.06); color: #14171E; }
        [data-theme="paper"] .dock-menu .sep { background: rgba(20,23,30,0.1); }

        /* ── Mobile: horizontal bar at the bottom, labels always visible ── */
        @media (max-width: 780px) {
          .dock {
            right: 12px; left: 12px; top: auto;
            /* Safari's own toolbar sits at the bottom on iPhone. Sit well
               clear of it so we never swallow taps meant for Share/tabs. */
            bottom: calc(24px + env(safe-area-inset-bottom, 0px));
            transform: none;
            flex-direction: row; justify-content: space-between;
            gap: 2px; border-radius: 20px; padding: 7px 8px;
            max-height: none; max-width: none;
          }
          /* When the app is installed there's no browser chrome — sit lower. */
          @media (display-mode: standalone) {
            .dock { bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
          }
          .dock > div { width: auto !important; flex: 1; }
          .dock-item {
            width: 100% !important; height: auto; flex-direction: column;
            gap: 3px; padding: 7px 4px; border-radius: 13px;
            transform: none !important;
          }
          .dock-item svg { width: 19px; height: 19px; }
          .dock-avatar { width: 22px; height: 22px; font-size: 11px; }
          .dock-label, [data-theme="paper"] .dock-label {
            position: static; transform: none; opacity: 1; background: none; border: none;
            box-shadow: none; padding: 0; font-size: 9.5px; font-weight: 600;
            color: inherit; letter-spacing: -0.2px;
          }
          .dock-label::after { display: none; }
          .dock-menu { right: 0; left: auto; bottom: calc(100% + 10px); min-width: 180px; }
        }
        @media (max-width: 360px) {
          .dock-label { font-size: 8.5px; }
          .dock-item { padding: 6px 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dock-item { transform: none !important; transition: background 0.2s, color 0.2s; }
        }
      `}</style>

      <div className="dock" ref={rootRef} onMouseLeave={() => setHoverIdx(null)}>
        {LINKS.map((item, i) => {
          const scale = hoverIdx === null ? 1 : magnify(i - hoverIdx);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`dock-item ${isActive(item.href) ? "active" : ""}`}
              style={{ transform: `scale(${scale})` }}
              onMouseEnter={() => setHoverIdx(i)}
            >
              {item.icon}
              <span className="dock-label">{item.label}</span>
            </a>
          );
        })}

        {/* Account item — auth aware */}
        <div style={{ position: "relative", width: 46 }}>
          <button
            className={`dock-item account`}
            style={{ transform: `scale(${hoverIdx === null ? 1 : magnify(accountIdx - hoverIdx)})`, width: 46 }}
            onMouseEnter={() => setHoverIdx(accountIdx)}
            onClick={() => (user ? setMenuOpen((v) => !v) : router.push("/login"))}
          >
            {user ? <div className="dock-avatar">{firstName.charAt(0).toUpperCase()}</div> : <LogIn size={20} />}
            <span className="dock-label">{user ? firstName : "Sign in"}</span>
          </button>

          {menuOpen && user && (
            <div className="dock-menu" onMouseLeave={() => setMenuOpen(false)}>
              {dbRole === "super_admin" && (
                <a href="/platform"><LayoutDashboard size={15} /> Platform console</a>
              )}
              <a href={isOwner ? "/admin" : "/profile"}>
                {isOwner ? <LayoutDashboard size={15} /> : <User size={15} />}
                {isOwner ? "Venue console" : "My profile"}
              </a>
              <div className="sep" />
              <button onClick={logout}><LogOut size={15} /> Log out</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
