import { createClient, getUser } from "@/lib/supabase/server";

export interface EncryptedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: string;
  iv: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  other: { id: string; full_name: string | null; username: string | null; avatar_url: string | null };
  last_message_at: string | null;
  unread: boolean;
}

/** The other participant's ECDH public key (JWK, JSON-encoded string). Null if they haven't opened chat yet. */
export async function getPublicKey(userId: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.from("user_keys").select("public_key").eq("user_id", userId).maybeSingle();
  return data?.public_key ?? null;
}

/** Full message history for a conversation — still ciphertext, decrypted client-side only. */
export async function getConversationMessages(conversationId: string): Promise<EncryptedMessage[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("direct_messages")
    .select("id, conversation_id, sender_id, ciphertext, iv, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  return (data as EncryptedMessage[]) ?? [];
}

/** Who's on the other side of a conversation, and am I actually a participant? */
export async function getConversationPeer(conversationId: string) {
  const sb = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: convo } = await sb
    .from("conversations")
    .select("user_a, user_b")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return null;

  if (convo.user_a !== user.id && convo.user_b !== user.id) return null;
  const peerId = convo.user_a === user.id ? convo.user_b : convo.user_a;

  const { data: profile } = await sb
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", peerId)
    .maybeSingle();

  return { meId: user.id, peer: profile ?? { id: peerId, full_name: null, username: null, avatar_url: null } };
}

/** Every conversation the current user is part of, newest activity first. */
export async function listConversations(): Promise<ConversationSummary[]> {
  const sb = await createClient();
  const user = await getUser();
  if (!user) return [];

  const { data: convos } = await sb
    .from("conversations")
    .select("id, user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  if (!convos || convos.length === 0) return [];

  const ids = convos.map((c) => c.id);
  const otherIds = convos.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));

  const [{ data: profiles }, { data: lastMessages }, { data: reads }] = await Promise.all([
    sb.from("profiles").select("id, full_name, username, avatar_url").in("id", otherIds),
    sb.from("direct_messages").select("conversation_id, created_at").in("conversation_id", ids)
      .order("created_at", { ascending: false }),
    sb.from("conversation_reads").select("conversation_id, last_read_at")
      .eq("user_id", user.id).in("conversation_id", ids),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const readMap = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at as string]));
  const lastMap = new Map<string, string>();
  (lastMessages ?? []).forEach((m) => {
    if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m.created_at);
  });

  const out = convos.map((c) => {
    const otherId = c.user_a === user.id ? c.user_b : c.user_a;
    const lastAt = lastMap.get(c.id) ?? null;
    const readAt = readMap.get(c.id) ?? null;
    return {
      id: c.id,
      other: profileMap.get(otherId) ?? { id: otherId, full_name: null, username: null, avatar_url: null },
      last_message_at: lastAt,
      unread: !!lastAt && (!readAt || new Date(lastAt) > new Date(readAt)),
    };
  });

  out.sort((a, b) => {
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bt - at;
  });
  return out;
}
