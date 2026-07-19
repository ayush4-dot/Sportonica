"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/useTheme";

// The Glass/Paper pill, fixed top-right on every page.
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const pathname = usePathname();

  // Auth pages have their own tight layout; skip the pill there.
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  return (
    <>
      <style>{`
        .theme-pill {
          position: fixed; top: 18px; right: 84px; z-index: 350;
          display: inline-flex; padding: 4px; gap: 2px; border-radius: 999px;
          border: 1px solid; backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
        }
        [data-theme="glass"] .theme-pill, html:not([data-theme]) .theme-pill {
          border-color: rgba(242,237,230,0.15); background: rgba(11,13,17,0.5);
        }
        [data-theme="paper"] .theme-pill {
          border-color: rgba(20,23,30,0.15); background: rgba(242,237,230,0.6);
        }
        .theme-pill button {
          font-family: 'Inter', sans-serif; font-size: 12.5px; font-weight: 700;
          padding: 7px 16px; border-radius: 999px; border: none; cursor: pointer;
          background: transparent; opacity: 0.55;
          transition: all 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        [data-theme="glass"] .theme-pill button, html:not([data-theme]) .theme-pill button { color: #F2EDE6; }
        [data-theme="paper"] .theme-pill button { color: #14171E; }
        .theme-pill button.on { opacity: 1; }
        [data-theme="glass"] .theme-pill button.on, html:not([data-theme]) .theme-pill button.on { background: #F2EDE6; color: #0B0D11; }
        [data-theme="paper"] .theme-pill button.on { background: #14171E; color: #F2EDE6; }
        @media (max-width: 780px) {
          .theme-pill { top: 12px; right: 12px; padding: 3px; }
          .theme-pill button { padding: 5px 11px; font-size: 11px; }
        }
      `}</style>
      <div className="theme-pill" role="tablist" aria-label="Theme">
        <button className={theme === "glass" ? "on" : ""} onClick={() => setTheme("glass")}>Glass</button>
        <button className={theme === "paper" ? "on" : ""} onClick={() => setTheme("paper")}>Paper</button>
      </div>
    </>
  );
}
