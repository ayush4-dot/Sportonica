"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";

// A labelled pill, top-right, immediately left of the notification bell.
// Text stays visible so there's nothing to guess at.
export default function MyGamesButton() {
  const pathname = usePathname();
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  const active = pathname.startsWith("/my-games");

  return (
    <>
      <style>{`
        .mgb-wrap { position: fixed; top: 18px; right: 136px; z-index: 350; }
        body:has(.plt) .mgb-wrap { top: 76px; right: 72px; }
        .mgb {
          display: inline-flex; align-items: center; gap: 7px;
          height: 42px; padding: 0 16px; border-radius: 999px;
          font-size: 13px; font-weight: 700; font-family: 'Inter', sans-serif;
          letter-spacing: -0.01em; text-decoration: none; white-space: nowrap;
          cursor: pointer; border: 1px solid;
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          transition: transform .15s, border-color .2s, color .2s, background .2s;
        }
        .mgb:hover { transform: scale(1.04); }
        [data-theme="glass"] .mgb, html:not([data-theme]) .mgb {
          border-color: rgba(242,237,230,0.15); background: rgba(11,13,17,0.5); color: #F2EDE6;
        }
        [data-theme="paper"] .mgb {
          border-color: rgba(20,23,30,0.15); background: rgba(242,237,230,0.6); color: #14171E;
        }
        .mgb.on {
          border-color: rgba(222,49,99,0.55); background: rgba(222,49,99,0.16); color: #DE3163;
        }

        /* Narrow screens: keep the label — just tighten it up. */
        @media (max-width: 780px) {
          .mgb-wrap {
            top: calc(12px + env(safe-area-inset-top,0px));
            right: calc(58px + env(safe-area-inset-right,0px));
          }
          .mgb { height: 38px; padding: 0 12px; font-size: 12px; gap: 5px; }
        }
        /* Very small phones: icon only, or it crowds the bell. */
        @media (max-width: 420px) {
          .mgb { padding: 0; width: 38px; justify-content: center; }
          .mgb span { display: none; }
        }
        @media (display-mode: standalone) and (max-width: 780px) {
          .mgb-wrap { top: calc(56px + env(safe-area-inset-top,0px)); }
        }
      `}</style>

      <div className="mgb-wrap">
        <Link href="/my-games" className={`mgb ${active ? "on" : ""}`}>
          <ClipboardList size={17} />
          <span>My games</span>
        </Link>
      </div>
    </>
  );
}
