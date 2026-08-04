import { createClient } from "@/lib/supabase/server";

export type Relationship =
  | { status: "none" }
  | { status: "pending_sent"; requestId: string }
  | { status: "pending_received"; requestId: string }
  | { status: "friends" };

/** Where do I stand with this other player? */
export async function getRelationship(otherUserId: string): Promise<Relationship> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || user.id === otherUserId) return { status: "none" };

  const { data } = await sb
    .from("friend_requests")
    .select("id, requester_id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),` +
      `and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (!data) return { status: "none" };
  if (data.status === "accepted") return { status: "friends" };
  return data.requester_id === user.id
    ? { status: "pending_sent", requestId: data.id }
    : { status: "pending_received", requestId: data.id };
}

export type FriendProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

/** Everyone the current user is friends with. */
export async function listFriends(): Promise<FriendProfile[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  const { data } = await sb
    .from("friend_requests")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const otherIds = (data ?? []).map((r) =>
    r.requester_id === user.id ? r.addressee_id : r.requester_id
  );
  if (otherIds.length === 0) return [];

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", otherIds);

  return (profiles ?? []) as FriendProfile[];
}

export type PendingRequest = {
  id: string;
  created_at: string;
  requester: FriendProfile;
};

/** Incoming requests waiting on the current user's decision. */
export async function listPendingRequests(): Promise<PendingRequest[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  const { data } = await sb
    .from("friend_requests")
    .select("id, created_at, requester:requester_id(id, full_name, username, avatar_url)")
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as { id: string; created_at: string; requester: FriendProfile }[])
    .filter((r) => r.requester);
}
