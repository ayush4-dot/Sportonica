"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { startConversation } from "@/lib/dm/actions";
import type { FriendProfile } from "@/lib/friends/queries";

export default function FriendRow({ friend }: { friend: FriendProfile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const name = friend.full_name ?? friend.username ?? "Player";

  function message() {
    startTransition(async () => {
      const id = await startConversation(friend.id);
      router.push(`/messages/${id}`);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-line)" }}>
      <Link href={friend.username ? `/p/${friend.username}` : "#"} style={{ flexShrink: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%", overflow: "hidden",
          background: "linear-gradient(150deg,#DE3163,#A78BFA)", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 800, color: "#0B0D11",
        }}>
          {friend.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={friend.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : name.charAt(0).toUpperCase()}
        </div>
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
        {friend.username && <div style={{ fontSize: 12, opacity: 0.55 }}>@{friend.username}</div>}
      </div>
      <button disabled={pending} onClick={message}
        style={{ background: "rgba(167,139,250,0.14)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 9, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
        <MessageCircle size={14} /> Message
      </button>
    </div>
  );
}
