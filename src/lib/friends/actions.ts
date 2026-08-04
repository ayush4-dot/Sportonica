"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

/** Send a friend request. The addressee gets a notification. Returns the new request's id. */
export async function sendFriendRequest(addresseeId: string): Promise<string> {
  const { sb, user } = await requireUser();
  if (addresseeId === user.id) throw new Error("Can't friend yourself.");
  const { data, error } = await sb
    .from("friend_requests")
    .insert({ requester_id: user.id, addressee_id: addresseeId })
    .select("id")
    .single();
  if (error) throw new Error(error.message.includes("duplicate") ? "ALREADY_REQUESTED" : error.message);
  revalidatePath("/friends");
  return data.id;
}

/** Addressee accepts or declines. A trigger notifies the requester on accept. */
export async function respondToRequest(requestId: string, decision: "accepted" | "declined") {
  const { sb, user } = await requireUser();

  // A declined row would otherwise sit on the (requester_id, addressee_id)
  // unique constraint forever, permanently blocking a future re-request —
  // deleting it instead just leaves things as if it was never sent.
  if (decision === "declined") {
    const { error } = await sb
      .from("friend_requests")
      .delete()
      .eq("id", requestId)
      .eq("addressee_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/friends");
    return;
  }

  const { error } = await sb
    .from("friend_requests")
    .update({ status: decision })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}

/** Remove an existing friendship (either side can do this). */
export async function removeFriend(otherUserId: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb
    .from("friend_requests")
    .delete()
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),` +
      `and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
    );
  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}

/** Cancel a request you sent that's still pending. */
export async function cancelRequest(requestId: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb
    .from("friend_requests")
    .delete()
    .eq("id", requestId)
    .eq("requester_id", user.id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  revalidatePath("/friends");
}
