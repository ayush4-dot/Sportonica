"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Users, UsersRound } from "lucide-react";

const TABS = [
  { key: "messages", label: "Messages", href: "/messages", icon: MessageCircle },
  { key: "players", label: "Players", href: "/players", icon: Users },
  { key: "groups", label: "Groups", href: "/league", icon: UsersRound },
];

export default function ChatTabs() {
  const pathname = usePathname();

  return (
    <div className="chat-tabs">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link key={t.key} href={t.href} className={`chat-tab ${active ? "on" : ""}`}>
            <Icon size={16} /> {t.label}
          </Link>
        );
      })}

      <style>{`
        .chat-tabs {
          display: flex; gap: 4px; margin-bottom: 28px;
          border-bottom: 1px solid var(--line, rgba(255,255,255,.1));
        }
        .chat-tab {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; margin-bottom: -1px;
          font-size: 13.5px; font-weight: 700;
          color: var(--dim, rgba(255,255,255,.62));
          text-decoration: none; border-bottom: 2px solid transparent;
          transition: color .18s, border-color .18s;
        }
        .chat-tab:hover { color: inherit; }
        .chat-tab.on { color: #A78BFA; border-color: #A78BFA; }
      `}</style>
    </div>
  );
}
