import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { listConversations } from "@/lib/dm/queries";
import ChatTabs from "@/components/ChatTabs";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default async function MessagesPage() {
  const conversations = await listConversations();

  return (
    <div className="play">
    <div className="play-wrap">
      <ChatTabs />

      {conversations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", opacity: 0.5 }}>
          <MessageCircle size={26} style={{ opacity: 0.5, marginBottom: 10 }} />
          <div style={{ fontSize: 13.5 }}>No conversations yet. Message a friend from their player card.</div>
        </div>
      ) : (
        conversations.map((c) => {
          const name = c.other.full_name ?? c.other.username ?? "Player";
          return (
            <Link
              key={c.id}
              href={`/messages/${c.id}`}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-line)", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(150deg,#DE3163,#A78BFA)", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 800, color: "#0B0D11" }}>
                  {c.other.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.other.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : name.charAt(0).toUpperCase()}
                </div>
                {c.unread && (
                  <span style={{ position: "absolute", top: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: "#DE3163", border: "2px solid var(--ink, #0B0D11)" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: c.unread ? 800 : 700 }}>{name}</div>
                {c.other.username && <div style={{ fontSize: 12, opacity: 0.55 }}>@{c.other.username}</div>}
              </div>
              {c.last_message_at && (
                <div style={{ fontSize: 11.5, opacity: 0.5, flexShrink: 0 }}>{timeAgo(c.last_message_at)}</div>
              )}
            </Link>
          );
        })
      )}
    </div>
    </div>
  );
}
