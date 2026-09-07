"use client";

import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Home, Volleyball, CalendarPlus, MessagesSquare, Trophy } from "lucide-react";

type Item = { label: string; href: string; icon: React.ReactNode };

// Crisp, confident line weight — heavier than lucide's default 2, with a
// constant absolute stroke so the icons stay razor-sharp through the
// desktop magnify scale and on any pixel density.
const ICON = { size: 22, strokeWidth: 2.15, absoluteStrokeWidth: true } as const;

const LINKS: Item[] = [
  { label: "Home", href: "/", icon: <Home {...ICON} /> },
  { label: "Play", href: "/discover", icon: <Volleyball {...ICON} /> },
  { label: "Book", href: "/create", icon: <CalendarPlus {...ICON} /> },
  { label: "Events", href: "/tournaments", icon: <Trophy {...ICON} /> },
  { label: "Chat", href: "/messages", icon: <MessagesSquare {...ICON} /> },
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hide dock on admin/organizer/platform consoles, auth pages (they have their own chrome).
  const hidden =
    pathname.startsWith("/admin") || pathname.startsWith("/platform") || pathname.startsWith("/organize")
    || pathname.startsWith("/login") || pathname.startsWith("/signup");
  if (hidden) return null;

  // "Chat" covers all three social tabs (Messages/Players/Groups), not just its own href.
  const CHAT_PREFIXES = ["/messages", "/players", "/league"];
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/messages") return CHAT_PREFIXES.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  };

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
          color: color-mix(in srgb, var(--chalk, #F2EDE6) 72%, transparent);
          background: rgba(255,255,255,0.04);
          border: 1px solid transparent; text-decoration: none;
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1),
                      background 0.25s ease, color 0.25s ease, border-color 0.25s ease,
                      box-shadow 0.25s ease;
          transform-origin: center center;
        }
        .dock-item svg {
          shape-rendering: geometricPrecision;
          transition: filter 0.25s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .dock-item:hover {
          color: var(--chalk, #F2EDE6); background: rgba(255,255,255,0.09);
        }
        .dock-item:hover svg { filter: drop-shadow(0 3px 8px rgba(0,0,0,0.35)); }
        .dock-item.active {
          color: #00a06a;
          background: linear-gradient(140deg, rgba(0,160,106,0.22), rgba(0,98,65,0.12));
          border-color: rgba(0,160,106,0.4);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.14),
                      0 8px 22px -10px rgba(0,120,80,0.7);
        }
        .dock-item.active svg {
          filter: drop-shadow(0 2px 9px rgba(0,160,106,0.55));
        }
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
        /* ── Paper theme ── */
        [data-theme="paper"] .dock {
          background: rgba(255,255,255,0.7);
          border-color: rgba(20,23,30,0.12);
          box-shadow: 0 20px 60px -18px rgba(20,23,30,0.25);
        }
        [data-theme="paper"] .dock-item { background: rgba(20,23,30,0.05); color: rgba(20,23,30,0.7); }
        [data-theme="paper"] .dock-item:hover { background: rgba(20,23,30,0.1); color: #14171E; }
        [data-theme="paper"] .dock-item:hover svg { filter: drop-shadow(0 2px 6px rgba(20,23,30,0.18)); }
        [data-theme="paper"] .dock-item.active {
          color: #006241;
          background: linear-gradient(140deg, rgba(0,98,65,0.2), rgba(0,98,65,0.08));
          border-color: rgba(0,98,65,0.45);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6),
                      0 8px 20px -10px rgba(0,98,65,0.5);
        }
        [data-theme="paper"] .dock-item.active svg { filter: drop-shadow(0 2px 7px rgba(0,98,65,0.4)); }
        [data-theme="paper"] .dock-label { background: #14171E; color: #F2EDE6; border-color: rgba(20,23,30,0.2); }
        [data-theme="paper"] .dock-label::after { border-left-color: #14171E; }

        /* ── Mobile: a real edge-to-edge tab bar, flush with the screen
           bottom — not a floating pill with page peeking around it. Its
           own bottom padding (not an external offset) absorbs the home
           indicator / Safari's toolbar via env(safe-area-inset-bottom). ── */
        @media (max-width: 780px) {
          .dock {
            left: 0; right: 0; bottom: 0; top: auto;
            transform: none; border-radius: 0;
            flex-direction: row; justify-content: space-around;
            gap: 2px; padding: 8px 6px calc(8px + env(safe-area-inset-bottom, 0px));
            max-height: none; max-width: none;
            border-left: none; border-right: none; border-bottom: none;
            border-top: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 -8px 24px -14px rgba(0,0,0,0.4);
          }
          [data-theme="paper"] .dock { border-top-color: rgba(20,23,30,0.12); box-shadow: 0 -8px 24px -14px rgba(20,23,30,0.15); }
          .dock-item {
            flex: 1 1 0%; width: auto !important; height: auto; flex-direction: column;
            gap: 4px; padding: 7px 4px 5px; border-radius: 14px;
            transform: none !important;
            background: none !important; border-color: transparent !important;
            box-shadow: none !important;
          }
          /* Material-style highlight pill that sits behind the icon only. */
          .dock-item::before {
            content: ''; position: absolute; top: 4px; left: 50%;
            width: 46px; height: 30px; border-radius: 999px;
            transform: translateX(-50%) scale(0.55);
            background: linear-gradient(140deg, rgba(0,160,106,0.28), rgba(0,98,65,0.14));
            opacity: 0; pointer-events: none;
            transition: opacity 0.22s ease, transform 0.32s cubic-bezier(0.34,1.6,0.64,1);
          }
          [data-theme="paper"] .dock-item::before {
            background: linear-gradient(140deg, rgba(0,98,65,0.2), rgba(0,98,65,0.08));
          }
          .dock-item.active::before { opacity: 1; transform: translateX(-50%) scale(1); }
          .dock-item.active { color: #00a06a; }
          [data-theme="paper"] .dock-item.active { color: #006241; }
          .dock-item svg { width: 22px; height: 22px; position: relative; z-index: 1; }
          .dock-item.active svg { transform: translateY(-1px); }
          .dock-label, [data-theme="paper"] .dock-label {
            position: relative; inset: auto; z-index: 1; transform: none; opacity: 1;
            background: none; border: none; box-shadow: none; padding: 0;
            font-size: 9.5px; font-weight: 650; color: inherit; letter-spacing: -0.1px;
          }
          .dock-item.active .dock-label { font-weight: 800; }
          .dock-label::after { display: none; }
        }
        @media (max-width: 360px) {
          .dock-label { font-size: 8.5px; }
          .dock-item { padding: 6px 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dock-item { transform: none !important; transition: background 0.2s, color 0.2s; }
          .dock-item svg, .dock-item.active svg { transform: none !important; }
          .dock-item::before { transition: opacity 0.2s ease; }
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
      </div>
    </>
  );
}
