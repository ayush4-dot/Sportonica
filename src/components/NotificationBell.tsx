"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, UserPlus, UserMinus, Zap, Calendar, Check } from "lucide-react";
import { useNotifications, type Notification } from "@/lib/hooks/useNotifications";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function iconFor(kind: Notification["kind"]) {
  switch (kind) {
    case "joined": return <UserPlus size={16} />;
    case "left": return <UserMinus size={16} />;
    case "spots_needed": return <Zap size={16} />;
    case "event": return <Calendar size={16} />;
    default: return <Bell size={16} />;
  }
}

export default function NotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { items, unread, loading, markAllRead } = useNotifications();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Auth pages have their own tight layout; skip the bell there.
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

  return (
    <>
      <style>{`
        .notif-wrap { position: fixed; top: 18px; right: 84px; z-index: 350; }
        body:has(.plt) .notif-wrap { top: 76px; right: 20px; }
        .notif-btn {
          position: relative; width: 42px; height: 42px; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; border: 1px solid; backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%); transition: transform .15s;
        }
        .notif-btn:hover { transform: scale(1.05); }
        [data-theme="glass"] .notif-btn, html:not([data-theme]) .notif-btn {
          border-color: rgba(242,237,230,0.15); background: rgba(11,13,17,0.5); color: #F2EDE6;
        }
        [data-theme="paper"] .notif-btn {
          border-color: rgba(20,23,30,0.15); background: rgba(242,237,230,0.6); color: #14171E;
        }
        .notif-badge {
          position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px;
          padding: 0 5px; border-radius: 999px; background: #DE3163; color: #fff;
          font-size: 10.5px; font-weight: 800; display: flex; align-items: center;
          justify-content: center; border: 2px solid var(--ink, #0B0D11);
        }
        .notif-panel {
          position: absolute; top: 52px; right: 0; width: 340px; max-width: 90vw;
          max-height: 440px; overflow-y: auto; border-radius: 18px; padding: 8px;
          border: 1px solid; backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          box-shadow: 0 24px 60px -20px rgba(0,0,0,0.6);
        }
        [data-theme="glass"] .notif-panel, html:not([data-theme]) .notif-panel {
          border-color: rgba(242,237,230,0.12); background: rgba(17,19,23,0.92); color: #F2EDE6;
        }
        [data-theme="paper"] .notif-panel {
          border-color: rgba(20,23,30,0.12); background: rgba(248,245,240,0.96); color: #14171E;
        }
        .notif-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px 8px; font-size: 13px; font-weight: 800; letter-spacing: -0.2px;
        }
        .notif-item {
          display: flex; gap: 11px; align-items: flex-start; padding: 11px 12px;
          border-radius: 12px; cursor: pointer; transition: background .15s;
        }
        [data-theme="glass"] .notif-item:hover, html:not([data-theme]) .notif-item:hover { background: rgba(255,255,255,0.05); }
        [data-theme="paper"] .notif-item:hover { background: rgba(20,23,30,0.04); }
        .notif-ic {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(222,49,99,0.14); color: #DE3163;
        }
        .notif-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; }
        .notif-body { font-size: 12px; opacity: 0.6; margin-top: 2px; line-height: 1.4; }
        .notif-time { font-size: 11px; opacity: 0.45; margin-top: 3px; }
        .notif-dot { width: 7px; height: 7px; border-radius: 999px; background: #DE3163; flex-shrink: 0; margin-top: 6px; }
        .notif-empty { padding: 40px 20px; text-align: center; font-size: 13px; opacity: 0.5; }
        @media (max-width: 780px) {
          .notif-wrap { top: calc(12px + env(safe-area-inset-top,0px)); right: calc(12px + env(safe-area-inset-right,0px)); }
          .notif-btn { width: 38px; height: 38px; }
        }
        @media (display-mode: standalone) and (max-width: 780px) {
          .notif-wrap { top: calc(56px + env(safe-area-inset-top,0px)); }
        }
      `}</style>

      <div className="notif-wrap" ref={ref}>
        <button className="notif-btn" onClick={toggle} aria-label="Notifications">
          <Bell size={19} />
          {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
        </button>

        {open && (
          <div className="notif-panel">
            <div className="notif-head">
              <span>Notifications</span>
              {items.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.55, fontWeight: 600 }}>
                  <Check size={12} /> All read
                </span>
              )}
            </div>

            {loading ? (
              <div className="notif-empty">Loading…</div>
            ) : items.length === 0 ? (
              <div className="notif-empty">
                No notifications yet.<br />When players join your games, you&apos;ll see it here.
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className="notif-item"
                  onClick={() => {
                    if (n.squad_id) router.push(`/league/${n.squad_id}`);
                    else if (n.event_id) router.push(`/game/${n.event_id}`);
                    setOpen(false);
                  }}
                >
                  <div className="notif-ic">{iconFor(n.kind)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-body">{n.body}</div>}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <div className="notif-dot" />}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
