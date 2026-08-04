"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Clock, Check, X, MessageCircle, Loader2 } from "lucide-react";
import { sendFriendRequest, respondToRequest, cancelRequest } from "@/lib/friends/actions";
import { startConversation } from "@/lib/dm/actions";
import type { Relationship } from "@/lib/friends/queries";

export default function FriendRequestButton({
  profileId, initial,
}: { profileId: string; initial: Relationship }) {
  const router = useRouter();
  const [rel, setRel] = useState<Relationship>(initial);
  const [pending, startTransition] = useTransition();

  // Any action here requires being logged in — bounce to login with a
  // redirect back to this profile rather than failing silently.
  function guardAuth(e: unknown): boolean {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return true;
    }
    return false;
  }

  function send() {
    startTransition(async () => {
      try {
        const id = await sendFriendRequest(profileId);
        setRel({ status: "pending_sent", requestId: id });
      } catch (e) { guardAuth(e); }
    });
  }

  function cancel(requestId: string) {
    startTransition(async () => {
      try { await cancelRequest(requestId); setRel({ status: "none" }); }
      catch (e) { guardAuth(e); }
    });
  }

  function respond(requestId: string, decision: "accepted" | "declined") {
    startTransition(async () => {
      try {
        await respondToRequest(requestId, decision);
        setRel(decision === "accepted" ? { status: "friends" } : { status: "none" });
      } catch (e) { guardAuth(e); }
    });
  }

  function message() {
    startTransition(async () => {
      try {
        const id = await startConversation(profileId);
        router.push(`/messages/${id}`);
      } catch (e) { guardAuth(e); }
    });
  }

  const spin = <Loader2 size={15} className="frb-spin" />;

  const body = (() => {
    if (rel.status === "friends") {
      return (
        <button className="pf-btn" disabled={pending} onClick={message}>
          {pending ? spin : <MessageCircle size={15} />} Message
        </button>
      );
    }
    if (rel.status === "pending_received") {
      return (
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button className="pf-btn" disabled={pending} onClick={() => respond(rel.requestId, "accepted")}>
            {pending ? spin : <Check size={15} />} Accept
          </button>
          <button className="pf-btn ghost" disabled={pending} onClick={() => respond(rel.requestId, "declined")}>
            <X size={15} /> Decline
          </button>
        </span>
      );
    }
    if (rel.status === "pending_sent") {
      return (
        <button className="pf-btn ghost" disabled={pending} onClick={() => cancel(rel.requestId)}>
          {pending ? spin : <Clock size={15} />} Request sent
        </button>
      );
    }
    return (
      <button className="pf-btn" disabled={pending} onClick={send}>
        {pending ? spin : <UserPlus size={15} />} Add friend
      </button>
    );
  })();

  return (
    <>
      {body}
      <style>{`
        .frb-spin { animation: frbspin 1s linear infinite; }
        @keyframes frbspin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
