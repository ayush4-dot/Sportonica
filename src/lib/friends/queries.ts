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

export type PlayerListItem = FriendProfile & { relationship: Relationship };

/**
 * Browse/search players to friend. With no search term, shows the most
 * recently joined players (a simple "suggested" default); with one,
 * matches name/username. Relationship status for every result is fetched
 * in one batched query rather than one-per-row.
 */
export async function listAllPlayers(search?: string): Promise<PlayerListItem[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const term = search?.trim() ?? "";
  let query = sb.from("profiles").select("id, full_name, username, avatar_url").limit(30);
  query = term.length >= 2
    ? query.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
    : query.order("created_at", { ascending: false });

  const { data: profiles } = await query;
  const list = ((profiles ?? []) as FriendProfile[]).filter((p) => p.id !== user?.id);
  if (!user || list.length === 0) {
    return list.map((p) => ({ ...p, relationship: { status: "none" } as Relationship }));
  }

  const ids = list.map((p) => p.id);
  const { data: rels } = await sb
    .from("friend_requests")
    .select("id, requester_id, addressee_id, status")
    .or(ids.map((id) =>
      `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
    ).join(","));

  const relMap = new Map<string, Relationship>();
  (rels ?? []).forEach((r) => {
    const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
    if (r.status === "accepted") relMap.set(otherId, { status: "friends" });
    else if (r.status === "pending") {
      relMap.set(otherId, r.requester_id === user.id
        ? { status: "pending_sent", requestId: r.id }
        : { status: "pending_received", requestId: r.id });
    }
  });

  return list.map((p) => ({ ...p, relationship: relMap.get(p.id) ?? { status: "none" } }));
}
