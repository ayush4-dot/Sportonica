"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { Send, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendSquadMessage } from "@/lib/squads/actions";
import { isActionError } from "@/lib/actionError";
import ReportButton from "@/components/ReportButton";
import type { ChatMessage } from "@/lib/squads/queries";

export default function SquadChat({
  squadId, initialMessages, isMember, meId,
}: {
  squadId: string;
  initialMessages: ChatMessage[];
  isMember: boolean;
  meId: string | null;
}) {
  const sb = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  // cache of user profiles so realtime messages can show a name/avatar
  const profileCache = useRef<Map<string, { name: string; username: string | null; avatar_url: string | null }>>(
    new Map(initialMessages.map((m) => [m.user_id, { name: m.name, username: m.username, avatar_url: m.avatar_url }]))
  );

  useEffect(() => {
    if (!isMember) return;

    // Subscribe to new messages for this squad only.
    const channel = sb
      .channel(`squad_${squadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "squad_messages", filter: `squad_id=eq.${squadId}` },
        async (payload) => {
          const row = payload.new as { id: string; squad_id: string; user_id: string; body: string; created_at: string };
          // resolve sender profile (from cache, or fetch once)
          let prof = profileCache.current.get(row.user_id);
          if (!prof) {
            const { data } = await sb.from("profiles")
              .select("full_name, name, username, avatar_url").eq("id", row.user_id).maybeSingle();
            prof = {
              name: data?.full_name ?? data?.name ?? data?.username ?? "Player",
              username: data?.username ?? null,
              avatar_url: data?.avatar_url ?? null,
            };
            profileCache.current.set(row.user_id, prof);
          }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, ...prof! }]
          );
        }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [sb, squadId, isMember]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    startTransition(async () => {
      try {
        const res = await sendSquadMessage(squadId, body);
        if (isActionError(res)) {
          if (res.message === "UNAUTHORIZED") {
            window.location.href = `/login?redirect=/league/${squadId}`;
            return;
          }
          setText(body); // restore on other failures
        }
      }
      catch {
        setText(body); // restore on other failures
      }
    });
  }

  if (!isMember) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", border: "1px solid var(--line)", borderRadius: 16, color: "var(--dim)" }}>
        <Lock size={22} style={{ opacity: 0.5, marginBottom: 10 }} />
        <div style={{ fontSize: 14 }}>Join the squad to see and join the chat.</div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", height: 460 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 ? (
          <div style={{ margin: "auto", color: "var(--faint)", fontSize: 13.5 }}>No messages yet — say hi 👋</div>
        ) : messages.map((m) => {
          const mine = m.user_id === meId;
          return (
            <div key={m.id} style={{ display: "flex", gap: 9, flexDirection: mine ? "row-reverse" : "row" }}>
              <Link href={m.username ? `/p/${m.username}` : "#"} style={{ flexShrink: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, color: "#ffffff" }}>
                  {m.avatar_url && /\.(jpe?g|png|gif|webp)$/i.test(m.avatar_url)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : m.name.charAt(0).toUpperCase()}
                </div>
              </Link>
              <div style={{ maxWidth: "72%", textAlign: mine ? "right" : "left" }}>
                {!mine && <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 2 }}>{m.name}</div>}
                <div className="msg-row" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexDirection: mine ? "row-reverse" : "row" }}>
                  <div style={{
                    display: "inline-block", padding: "8px 12px", borderRadius: 13, fontSize: 13.5, lineHeight: 1.4,
                    background: mine ? "#006241" : "var(--ink-3, rgba(255,255,255,0.06))",
                    color: mine ? "#0B0D11" : "inherit",
                    borderTopRightRadius: mine ? 3 : 13, borderTopLeftRadius: mine ? 13 : 3,
                  }}>
                    {m.body}
                  </div>
                  {/* Report appears on hover, like Discord/Slack message actions */}
                  {!mine && (
                    <span className="msg-actions">
                      <ReportButton targetType="message" targetId={m.id} label="" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <style>{`
        .msg-actions { opacity: 0; transition: opacity 0.15s ease; }
        .msg-row:hover .msg-actions { opacity: 1; }
        @media (hover: none) { .msg-actions { opacity: 0.45; } }
      `}</style>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message your squad…"
          style={{ flex: 1, background: "transparent", border: "1px solid rgba(128,128,128,0.28)", borderRadius: 10, padding: "10px 13px", color: "inherit", fontFamily: "inherit", fontSize: 14, outline: "none" }}
        />
        <button onClick={send} style={{ background: "#006241", color: "#ffffff", border: "none", borderRadius: 10, padding: "0 16px", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
