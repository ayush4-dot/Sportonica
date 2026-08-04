import { createClient, getUser } from "@/lib/supabase/server";

export interface Squad {
  id: string;
  creator_id: string;
  name: string;
  sport: string;
  area: string | null;
  schedule: string | null;
  description: string | null;
  color: string | null;
  cap: number | null;
  locked?: boolean | null;
  unlisted?: boolean | null;
  member_count: number;
  created_at: string;
}

export interface SquadMember {
  user_id: string;
  role: string;
  joined_at: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
}

export async function browseSquads(): Promise<Squad[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("squads_with_counts")
    .select("*")
    .order("member_count", { ascending: false });

  const all = (data as Squad[]) ?? [];

  // Unlisted squads are hidden from strangers — but you always see the
  // ones you're a member of, otherwise you'd lose your own squad.
  const user = await getUser();
  if (!user) return all.filter((s) => !s.unlisted);

  const { data: mine } = await sb
    .from("squad_members").select("squad_id").eq("user_id", user.id);
  const myIds = new Set((mine ?? []).map((m) => m.squad_id));

  return all.filter((s) => !s.unlisted || myIds.has(s.id));
}

export async function getSquad(id: string): Promise<Squad | null> {
  const sb = await createClient();
  const { data } = await sb.from("squads_with_counts").select("*").eq("id", id).maybeSingle();
  return (data as Squad) ?? null;
}

export async function getSquadMembers(squadId: string): Promise<SquadMember[]> {
  const sb = await createClient();
  const { data: members } = await sb
    .from("squad_members")
    .select("user_id, role, joined_at")
    .eq("squad_id", squadId)
    .order("joined_at", { ascending: true });

  if (!members?.length) return [];
  const ids = members.map((m) => m.user_id);
  const { data: profiles } = await sb
    .from("profiles").select("id, full_name, name, username, avatar_url").in("id", ids);
  const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return members.map((m) => {
    const p = pMap.get(m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      name: p?.full_name ?? p?.name ?? p?.username ?? "Player",
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });
}

// Which squad ids the current user is already in (for button state).
export async function myMemberships(): Promise<Set<string>> {
  const sb = await createClient();
  const user = await getUser();
  if (!user) return new Set();
  const { data } = await sb.from("squad_members").select("squad_id").eq("user_id", user.id);
  return new Set((data ?? []).map((r) => r.squad_id));
}

export interface ChatMessage {
  id: string;
  squad_id: string;
  user_id: string;
  body: string;
  created_at: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
}

// Initial message history (Realtime streams new ones after this).
export async function getSquadMessages(squadId: string): Promise<ChatMessage[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("squad_messages")
    .select("id, squad_id, user_id, body, created_at")
    .eq("squad_id", squadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!data?.length) return [];

  const ids = [...new Set(data.map((m) => m.user_id))];
  const { data: profiles } = await sb
    .from("profiles").select("id, full_name, name, username, avatar_url").in("id", ids);
  const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((m) => {
    const p = pMap.get(m.user_id);
    return {
      ...m,
      name: p?.full_name ?? p?.name ?? p?.username ?? "Player",
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });
}

// ── Polls ───────────────────────────────────────────────────────
export interface PollOptionRow { option_id: string; label: string; votes: number; position: number }
export interface PollRow {
  id: string;
  squad_id: string;
  creator_id: string;
  question: string;
  closed: boolean;
  multi: boolean;
  created_at: string;
  options: PollOptionRow[];
  myVotes: string[];
  totalVotes: number;
}

export async function getSquadPolls(squadId: string): Promise<PollRow[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const { data: polls } = await sb
    .from("squad_polls")
    .select("id, squad_id, creator_id, question, closed, multi, created_at")
    .eq("squad_id", squadId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!polls?.length) return [];

  const ids = polls.map((p) => p.id);
  const [{ data: results }, { data: myVotes }] = await Promise.all([
    sb.from("squad_poll_results").select("*").in("poll_id", ids),
    user
      ? sb.from("squad_poll_votes").select("poll_id, option_id").eq("user_id", user.id).in("poll_id", ids)
      : Promise.resolve({ data: [] as { poll_id: string; option_id: string }[] }),
  ]);

  return polls.map((p) => {
    const opts = ((results ?? []) as PollOptionRow[] & { poll_id: string }[])
      .filter((r) => (r as unknown as { poll_id: string }).poll_id === p.id)
      .map((r) => ({ option_id: r.option_id, label: r.label, votes: Number(r.votes) || 0, position: r.position }))
      .sort((a, b) => a.position - b.position);
    return {
      ...p,
      options: opts,
      myVotes: (myVotes ?? []).filter((v) => v.poll_id === p.id).map((v) => v.option_id),
      totalVotes: opts.reduce((s, o) => s + o.votes, 0),
    };
  });
}
