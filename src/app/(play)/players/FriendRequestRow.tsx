"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { respondToRequest } from "@/lib/friends/actions";
import type { PendingRequest } from "@/lib/friends/queries";

export default function FriendRequestRow({ request }: { request: PendingRequest }) {
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { requester } = request;
  const name = requester.full_name ?? requester.username ?? "Player";

  function decide(decision: "accepted" | "declined") {
    setError(null);
    startTransition(async () => {
      try {
        await respondToRequest(request.id, decision);
        setGone(true);
      } catch { setError("Couldn't update — try again."); }
    });
  }

  if (gone) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-line)" }}>
      <Link href={requester.username ? `/p/${requester.username}` : "#"} style={{ flexShrink: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%", overflow: "hidden",
          background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 800, color: "#0B0D11",
        }}>
          {requester.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={requester.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : name.charAt(0).toUpperCase()}
        </div>
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
        {requester.username && <div style={{ fontSize: 12, opacity: 0.55 }}>@{requester.username}</div>}
      </div>
      <button disabled={pending} onClick={() => decide("accepted")}
        style={{ background: "#006241", color: "#0B0D11", border: "none", borderRadius: 9, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer" }}
        aria-label="Accept">
        <Check size={15} />
      </button>
      <button disabled={pending} onClick={() => decide("declined")}
        style={{ background: "transparent", color: "inherit", border: "1px solid var(--border-line)", borderRadius: 9, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer" }}
        aria-label="Decline">
        <X size={15} />
      </button>
      {error && <span style={{ fontSize: 11, color: "#ef4444", flexBasis: "100%" }}>{error}</span>}
    </div>
  );
}
