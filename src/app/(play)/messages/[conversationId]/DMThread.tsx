"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { Send, ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendEncryptedMessage, markConversationRead } from "@/lib/dm/actions";
import { isActionError } from "@/lib/actionError";
import { getOrCreateKeyPair } from "@/lib/crypto/keyStore";
import { deriveConversationKey, encryptText, decryptText } from "@/lib/crypto/e2e";
import type { EncryptedMessage } from "@/lib/dm/queries";

type Peer = { id: string; full_name: string | null; username: string | null; avatar_url: string | null };
type DecryptedMessage = { id: string; sender_id: string; body: string; created_at: string; failed?: boolean };

export default function DMThread({
  conversationId, meId, peer, initialMessages,
}: {
  conversationId: string;
  meId: string;
  peer: Peer;
  initialMessages: EncryptedMessage[];
}) {
  const sb = createClient();
  const [keyMissing, setKeyMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const aesKeyRef = useRef<CryptoKey | null>(null);
  const name = peer.full_name ?? peer.username ?? "Player";

  // Derive the shared key once (my private key never leaves this device,
  // their public key is fetched fresh), then decrypt whatever history we
  // already have. The server has only ever seen ciphertext.
  async function setupKey(cancelledRef: { current: boolean }) {
    const { data } = await sb.from("user_keys").select("public_key").eq("user_id", peer.id).maybeSingle();
    if (!data?.public_key) { if (!cancelledRef.current) setKeyMissing(true); return; }
    setKeyMissing(false);

    const { privateKey } = await getOrCreateKeyPair();
    const aesKey = await deriveConversationKey(privateKey, data.public_key);
    if (cancelledRef.current) return;
    aesKeyRef.current = aesKey;

    const decrypted = await Promise.all(initialMessages.map(async (m) => {
      try {
        const body = await decryptText(aesKey, m.ciphertext, m.iv);
        return { id: m.id, sender_id: m.sender_id, body, created_at: m.created_at };
      } catch {
        return { id: m.id, sender_id: m.sender_id, body: "Couldn't decrypt this message.", created_at: m.created_at, failed: true };
      }
    }));
    if (!cancelledRef.current) { setMessages(decrypted); setReady(true); }
  }

  useEffect(() => {
    const cancelledRef = { current: false };
    setupKey(cancelledRef);
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id]);

  useEffect(() => { markConversationRead(conversationId); }, [conversationId]);

  // Realtime — same subscription shape SquadChat uses for squad_messages.
  useEffect(() => {
    const channel = sb
      .channel(`dm_${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const row = payload.new as { id: string; sender_id: string; ciphertext: string; iv: string; created_at: string };
          const key = aesKeyRef.current;
          if (!key) return;
          let body = "Couldn't decrypt this message.";
          let failed = false;
          try { body = await decryptText(key, row.ciphertext, row.iv); }
          catch { failed = true; }
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, { id: row.id, sender_id: row.sender_id, body, created_at: row.created_at, failed }]
          );
          if (row.sender_id !== meId) markConversationRead(conversationId);
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, meId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const body = text.trim();
    const key = aesKeyRef.current;
    if (!body || !key) return;
    setText("");
    setSendError(null);
    startTransition(async () => {
      const { ciphertext, iv } = await encryptText(key, body);
      try {
        const res = await sendEncryptedMessage(conversationId, ciphertext, iv);
        if (isActionError(res)) { setText(body); setSendError(res.message); }
      }
      catch { setText(body); setSendError("Couldn't send — try again."); }
    });
  }

  return (
    <div style={{ border: "1px solid var(--border-line)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", height: "70vh", minHeight: 460 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border-line)" }}>
        <Link href={peer.username ? `/p/${peer.username}` : "#"} style={{ flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, color: "#ffffff" }}>
            {peer.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={peer.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : name.charAt(0).toUpperCase()}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{name}</div>
        <span title="End-to-end encrypted — only you and this person can read these messages" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#22c55e", opacity: 0.85 }}>
          <ShieldCheck size={14} /> Encrypted
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        {keyMissing ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--faint, rgba(255,255,255,.5))", fontSize: 13.5, padding: "0 20px" }}>
            <ShieldAlert size={20} style={{ opacity: 0.6, marginBottom: 8 }} />
            <div>{name} hasn&apos;t opened chat yet, so there&apos;s no encryption key for them.</div>
            <div style={{ marginTop: 4, opacity: 0.7 }}>Once they open the app, you&apos;ll be able to write here.</div>
            <button
              onClick={() => setupKey({ current: false })}
              style={{ marginTop: 12, background: "transparent", color: "#006241", border: "1px solid rgba(0,98,65,.4)", borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              Check again
            </button>
          </div>
        ) : !ready ? (
          <div style={{ margin: "auto", color: "var(--faint, rgba(255,255,255,.5))", fontSize: 13.5 }}>Setting up encryption…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", color: "var(--faint, rgba(255,255,255,.5))", fontSize: 13.5 }}>No messages yet — say hi 👋</div>
        ) : messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row" }}>
              <div style={{
                maxWidth: "72%", display: "inline-block", padding: "8px 12px", borderRadius: 13, fontSize: 13.5, lineHeight: 1.4,
                background: mine ? "#006241" : "var(--ink-3, rgba(255,255,255,0.06))",
                color: mine ? "#0B0D11" : "inherit",
                fontStyle: m.failed ? "italic" : "normal", opacity: m.failed ? 0.6 : 1,
                borderTopRightRadius: mine ? 3 : 13, borderTopLeftRadius: mine ? 13 : 3,
              }}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <div style={{ padding: "0 12px 6px", fontSize: 11.5, color: "#ef4444" }}>{sendError}</div>
      )}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border-line)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={keyMissing ? "Waiting on encryption key…" : "Message…"}
          disabled={keyMissing || !ready}
          style={{ flex: 1, background: "transparent", border: "1px solid rgba(128,128,128,0.28)", borderRadius: 10, padding: "13px 14px", color: "inherit", fontFamily: "inherit", fontSize: 14, outline: "none" }}
        />
        <button onClick={send} disabled={keyMissing || !ready}
          style={{ background: "#006241", color: "#ffffff", border: "none", borderRadius: 10, width: 46, minHeight: 44, flexShrink: 0, cursor: "pointer", display: "grid", placeItems: "center", opacity: (keyMissing || !ready) ? 0.5 : 1 }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
