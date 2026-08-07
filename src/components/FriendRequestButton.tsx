"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Clock, Check, X, MessageCircle, Loader2 } from "lucide-react";
import { sendFriendRequest, respondToRequest, cancelRequest } from "@/lib/friends/actions";
import { startConversation } from "@/lib/dm/actions";
import { getCachedUser } from "@/lib/supabase/authCache";
import type { Relationship } from "@/lib/friends/queries";

export default function FriendRequestButton({
  profileId, initial,
}: { profileId: string; initial: Relationship }) {
  const router = useRouter();
  const [rel, setRel] = useState<Relationship>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Checked client-side, before ever calling the server action — Next.js
  // redacts thrown Server Action error messages down to a bare digest in
  // production, so a previous version of this that tried to string-match
  // "UNAUTHORIZED" on the caught error never actually matched and just
  // failed silently. This is reliable; that wasn't.
  async function requireLoggedIn(): Promise<boolean> {
    const user = await getCachedUser();
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    return true;
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      if (!(await requireLoggedIn())) return;
      try { await action(); }
      catch { setError("Something went wrong. Try again."); }
    });
  }

  function send() {
    run(async () => {
      const id = await sendFriendRequest(profileId);
      setRel({ status: "pending_sent", requestId: id });
    });
  }

  function cancel(requestId: string) {
    run(async () => {
      await cancelRequest(requestId);
      setRel({ status: "none" });
    });
  }

  function respond(requestId: string, decision: "accepted" | "declined") {
    run(async () => {
      await respondToRequest(requestId, decision);
      setRel(decision === "accepted" ? { status: "friends" } : { status: "none" });
    });
  }

  function message() {
    run(async () => {
      const id = await startConversation(profileId);
      router.push(`/messages/${id}`);
    });
  }

  const spin = <Loader2 size={15} className="frb-spin" />;

  const body = (() => {
    if (rel.status === "friends") {
      return (
        <button className="frb-btn" disabled={pending} onClick={message}>
          {pending ? spin : <MessageCircle size={15} />} Message
        </button>
      );
    }
    if (rel.status === "pending_received") {
      return (
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button className="frb-btn" disabled={pending} onClick={() => respond(rel.requestId, "accepted")}>
            {pending ? spin : <Check size={15} />} Accept
          </button>
          <button className="frb-btn ghost" disabled={pending} onClick={() => respond(rel.requestId, "declined")}>
            <X size={15} /> Decline
          </button>
        </span>
      );
    }
    if (rel.status === "pending_sent") {
      return (
        <button className="frb-btn ghost" disabled={pending} onClick={() => cancel(rel.requestId)}>
          {pending ? spin : <Clock size={15} />} Request sent
        </button>
      );
    }
    return (
      <button className="frb-btn" disabled={pending} onClick={send}>
        {pending ? spin : <UserPlus size={15} />} Add friend
      </button>
    );
  })();

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
      {body}
      {error && <span style={{ fontSize: 11.5, color: "#ef4444" }}>{error}</span>}
      <style>{`
        .frb-btn {
          display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
          padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 700;
          font-family: inherit; cursor: pointer; text-decoration: none;
          background: #006241; color: #ffffff; border: 1px solid #006241;
          transition: transform .2s cubic-bezier(.22,1,.36,1), opacity .2s;
        }
        .frb-btn:hover { opacity: 0.88; }
        .frb-btn:active { transform: scale(0.97); }
        .frb-btn:disabled { cursor: default; }
        .frb-btn.ghost {
          background: transparent; color: inherit;
          border-color: var(--line, rgba(255,255,255,.14));
        }
        .frb-btn.ghost:hover { border-color: #006241; opacity: 1; }
        .frb-spin { animation: frbspin 1s linear infinite; }
        @keyframes frbspin { to { transform: rotate(360deg); } }
      `}</style>
    </span>
  );
}
