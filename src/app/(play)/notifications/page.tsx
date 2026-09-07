"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, BellOff } from "lucide-react";
import { useNotifications, type Notification } from "@/lib/hooks/useNotifications";
import { NotificationIcon, notificationTimeAgo } from "@/components/notifications/NotificationIcon";
import {
  notificationHref, notificationCategory, CATEGORY_LABEL, type NotificationCategory,
} from "@/lib/notifications/routing";

type Tab = "all" | NotificationCategory;
const TABS: { k: Tab; label: string }[] = [
  { k: "all", label: "All" },
  { k: "games", label: CATEGORY_LABEL.games },
  { k: "payments", label: CATEGORY_LABEL.payments },
  { k: "tournaments", label: CATEGORY_LABEL.tournaments },
  { k: "social", label: CATEGORY_LABEL.social },
];

function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export default function NotificationsPage() {
  const router = useRouter();
  const { items, loading, unread, markAllRead, markOneRead, dismiss } = useNotifications(100);
  const [tab, setTab] = useState<Tab>("all");

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((n) => notificationCategory(n.kind) === tab)),
    [items, tab],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of filtered) {
      const b = dayBucket(n.created_at);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(n);
    }
    return [...map.entries()];
  }, [filtered]);

  const countFor = (t: Tab) =>
    t === "all" ? items.length : items.filter((n) => notificationCategory(n.kind) === t).length;

  function open(n: Notification) {
    if (!n.read) markOneRead(n.id);
    router.push(notificationHref(n));
  }

  return (
    <div className="play">
      <div className="play-wrap">
        <div className="nt-head">
          <h1 className="nt-h1">Notifications{unread > 0 && <span className="nt-unread">{unread}</span>}</h1>
          {unread > 0 && (
            <button className="nt-mark" onClick={markAllRead}><Check size={14} /> Mark all read</button>
          )}
        </div>

        <div className="nt-tabs">
          {TABS.map(({ k, label }) => (
            <button key={k} className={`nt-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}{countFor(k) > 0 && <span className="nt-tab-n">{countFor(k)}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="nt-empty">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="nt-empty">
            <BellOff size={26} strokeWidth={1.6} />
            <p>{tab === "all" ? "No notifications yet." : `Nothing in ${CATEGORY_LABEL[tab as NotificationCategory]}.`}</p>
            <span>When players join your games or a payment clears, it shows up here.</span>
          </div>
        ) : (
          groups.map(([bucket, list]) => (
            <section key={bucket} className="nt-group">
              <h2 className="nt-group-h">{bucket}</h2>
              {list.map((n) => (
                <div key={n.id} className={`nt-row ${n.read ? "" : "unread"}`} onClick={() => open(n)}>
                  <span className="nt-ic"><NotificationIcon kind={n.kind} /></span>
                  <div className="nt-txt">
                    <div className="nt-title">{n.title}</div>
                    {n.body && <div className="nt-body">{n.body}</div>}
                    <div className="nt-time">{notificationTimeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <span className="nt-dot" />}
                  <button
                    className="nt-x"
                    aria-label="Dismiss"
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      <style>{`
        .nt-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
        .nt-h1 { font-family: 'Inter', sans-serif; font-size: clamp(26px, 4vw, 38px); font-weight: 800; letter-spacing: -0.03em; margin: 0; display: inline-flex; align-items: center; gap: 10px; }
        .nt-unread { font-size: 13px; font-weight: 800; color: #fff; background: #006241; border-radius: 999px; padding: 2px 9px; }
        .nt-mark { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #006241; background: rgba(0,98,65,.1); border: 1px solid rgba(0,98,65,.24); border-radius: 999px; padding: 7px 13px; }
        .nt-mark:hover { background: rgba(0,98,65,.16); }

        .nt-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 18px; }
        .nt-tab { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-family: inherit; padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 700; border: 1px solid rgba(20,23,30,.14); background: transparent; color: inherit; }
        :root:not([data-theme="paper"]) .nt-tab { border-color: rgba(242,237,230,.14); }
        .nt-tab.on { background: #006241; border-color: #006241; color: #fff; }
        .nt-tab-n { font-size: 11px; opacity: .7; }

        .nt-group { margin-bottom: 24px; }
        .nt-group-h { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; opacity: .45; margin: 0 0 8px; }

        .nt-row { display: flex; align-items: flex-start; gap: 13px; padding: 13px 12px; border-radius: 13px; cursor: pointer; transition: background .15s; position: relative; }
        .nt-row:hover { background: rgba(0,98,65,.07); }
        .nt-row.unread { background: rgba(0,98,65,.06); }
        .nt-row.unread:hover { background: rgba(0,98,65,.11); }
        .nt-ic { width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center; background: rgba(0,98,65,.13); color: #006241; margin-top: 1px; }
        .nt-txt { flex: 1; min-width: 0; }
        .nt-title { font-size: 14px; font-weight: 600; line-height: 1.35; }
        .nt-body { font-size: 12.5px; opacity: .6; margin-top: 2px; line-height: 1.4; }
        .nt-time { font-size: 11px; opacity: .42; margin-top: 4px; }
        .nt-dot { width: 7px; height: 7px; border-radius: 999px; background: #006241; flex-shrink: 0; margin-top: 7px; }
        .nt-x { border: none; background: transparent; color: inherit; opacity: .3; cursor: pointer; padding: 4px; border-radius: 8px; flex-shrink: 0; transition: opacity .15s, background .15s; }
        .nt-x:hover { opacity: 1; background: rgba(20,23,30,.08); }
        :root:not([data-theme="paper"]) .nt-x:hover { background: rgba(242,237,230,.1); }

        .nt-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 60px 20px; text-align: center; opacity: .55; }
        .nt-empty p { font-size: 15px; font-weight: 600; margin: 4px 0 0; }
        .nt-empty span { font-size: 13px; opacity: .8; max-width: 280px; }
      `}</style>
    </div>
  );
}
