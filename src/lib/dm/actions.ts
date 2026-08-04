"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

/** Get (or create) the 1:1 conversation with a friend. Only works between friends — see get_or_create_conversation() RLS/checks. */
export async function startConversation(otherUserId: string): Promise<string> {
  const { sb } = await requireUser();
  const { data, error } = await sb.rpc("get_or_create_conversation", { other_id: otherUserId });
  if (error) throw new Error(error.message.includes("NOT_FRIENDS") ? "NOT_FRIENDS" : error.message);
  return data as string;
}

/** Store an already-encrypted message. The server never sees plaintext. */
export async function sendEncryptedMessage(conversationId: string, ciphertext: string, iv: string) {
  const { sb, user } = await requireUser();
  if (!ciphertext || !iv) throw new Error("Empty message.");
  const { error } = await sb.from("direct_messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    ciphertext,
    iv,
  });
  if (error) throw new Error(error.message);
}

/** Mark a conversation as read up to now. */
export async function markConversationRead(conversationId: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("conversation_reads").upsert({
    conversation_id: conversationId,
    user_id: user.id,
    last_read_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/messages");
}
