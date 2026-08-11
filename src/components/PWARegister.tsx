"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

// Chrome fires this before showing its own install banner.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "khelamna-install-dismissed";
const SNOOZE_DAYS = 7;

function isSnoozed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const at = Number(raw);
  // Older versions stored "1" — treat anything unparseable as expired.
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < SNOOZE_DAYS * 864e5;
}

export default function PWARegister() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // 1. Register the service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) =>
        console.error("[pwa] service worker failed:", e)
      );
    }

    // Already installed, or dismissed before → stay quiet.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || isSnoozed()) return;

    // 2. Android/desktop: capture the install prompt.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // 3. iOS has no prompt event — Safari needs a manual instruction.
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      // Give people a moment to look around before asking.
      const t = setTimeout(() => { setShowIOS(true); setHidden(false); }, 12000);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onPrompt); };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    // Snooze rather than silence forever — people often want this later.
    setHidden(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  }

  if (hidden || (!deferred && !showIOS)) return null;

  return (
    <div className="pwa-bar">
      <div className="pwa-mark">K</div>
      <div className="pwa-copy">
        <b>Add Khelam Na to your home screen</b>
        {showIOS ? (
          <small>
            Tap <Share size={12} style={{ verticalAlign: -2, color: "#006241" }} /> below,
            then <b style={{ opacity: .9 }}>Add to Home Screen</b>
          </small>
        ) : (
          <small>Faster access to games, courts and your squads.</small>
        )}
      </div>
      {!showIOS && (
        <button className="pwa-go" onClick={install}><Download size={14} /> Install</button>
      )}
      <button className="pwa-x" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button>
      {showIOS && <span className="pwa-point" aria-hidden>▾</span>}

      <style>{`
        .pwa-bar {
          position: fixed; left: 50%; transform: translateX(-50%);
          bottom: calc(18px + env(safe-area-inset-bottom, 0px));
          z-index: 340; width: calc(100% - 32px); max-width: 440px;
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 16px;
          background: #171B22; color: #F2EDE6;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 18px 44px -16px rgba(0,0,0,0.85);
          animation: pwaUp .45s cubic-bezier(.22,1,.36,1) both;
        }
        [data-theme="paper"] .pwa-bar {
          background: #fff; color: #14171E; border-color: rgba(20,23,30,0.12);
          box-shadow: 0 18px 44px -18px rgba(20,23,30,0.35);
        }
        @keyframes pwaUp { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .pwa-mark {
          width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
          background: #006241; color: #ffffff; display: grid; place-items: center;
          font-family: 'Inter', sans-serif; font-size: 21px; font-weight: 800;
        }
        .pwa-copy { flex: 1; min-width: 0; }
        .pwa-copy b { display: block; font-size: 13.5px; font-weight: 700; }
        .pwa-copy small { display: block; font-size: 11.5px; opacity: 0.65; margin-top: 2px; }
        .pwa-go {
          display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
          background: #006241; color: #ffffff; border: none; border-radius: 10px;
          padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer;
          font-family: inherit;
        }
        .pwa-x { background: none; border: none; color: inherit; opacity: .5; cursor: pointer; flex-shrink: 0; }
        /* points down at Safari's own share button */
        .pwa-point {
          position: absolute; left: 50%; bottom: -13px; transform: translateX(-50%);
          color: #006241; font-size: 18px; line-height: 1;
          animation: pwaNudge 1.4s ease-in-out infinite;
        }
        @keyframes pwaNudge { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 5px); } }
        .pwa-x:hover { opacity: 1; }
        @media (max-width: 780px) { .pwa-bar { bottom: calc(108px + env(safe-area-inset-bottom, 0px)); } }
      `}</style>
    </div>
  );
}
