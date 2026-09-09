import { createAnonClient } from "@/lib/supabase/anonServer";

export interface RailEvent {
  id: string;
  title: string;
  sport: string;
  venue: string;
  event_date: string;
  fee: number;
  max_players: number;
  slots_remaining: number;
  event_type: string | null;
  // true for a merged-in single_event tournament — links to
  // /tournaments/[id] instead of /game/[id]. Undefined for a real
  // `events`-table row.
  is_tournament?: boolean;
  organizer_name: string | null;
  skill_level: string | null;
  sport_color: string | null;
  host_name: string | null;
  host_avatar: string | null;
  host_trust: number | null;
  banner_url?: string | null;
}

export interface RailVenue {
  id: string;
  name: string;
  venue_type: string;
  address: string | null;
  photos: string[] | null;
  sports: string[] | null;
  lat: number | null;
  lng: number | null;
  from_price: number | null;
}

export interface RailMatch {
  id: string;
  tournamentId: string;
  tournamentName: string;
  sport: string;
  format: string;
  roundLabel: string;
  status: "live" | "scheduled" | "completed";
  startsAt: string | null;
  teamA: { id: string; name: string; logoUrl: string | null };
  teamB: { id: string; name: string; logoUrl: string | null };
  scoreA: number | null;
  scoreB: number | null;
  winnerTeamId: string | null;
}

/**
 * Everything the homepage rails need, in one round trip.
 * Official events = venue_event | platform_event — the organised stuff,
 * which is the highest-value thing to surface first.
 */
export async function getHomeRails() {
  // Cookie-free client so the homepage can be edge-cached (see page.tsx's
  // `revalidate`) instead of re-rendered against Sydney on every request.
  const sb = createAnonClient();
  const nowIso = new Date().toISOString();

  // The venues query used to come back with just the 8 rows, then a
  // second query looked up courts for those specific venue IDs to find
  // the cheapest one — a genuine data dependency (needs the IDs first),
  // so it couldn't join the Promise.all above and always cost a full
  // extra sequential DB round trip on every homepage load. Embedding
  // courts directly in this select gets everything in one round trip
  // instead, at the cost of over-fetching a little more court data than
  // needed (fine at this scale — 8 venues' worth of courts).
  // "Play socially" used to only pull events_full's event_type='pickup'
  // rows — Play Together games (src/lib/playTogether/, its own `games`
  // table, not events_full) never showed up there even though /discover
  // already merges the two into one grid (see usePlayTogetherEvents.ts,
  // whose mapping this mirrors). host is embedded via the games.host_id
  // FK (games_host_id_fkey, Postgres's default constraint name for an
  // inline `references` with no explicit name) for one round trip.
  // Match columns shared by the live/upcoming/completed queries below —
  // a single string keeps the three selects (and any future one) from
  // drifting out of sync with each other.
  const MATCH_COLS = "id,tournament_id,round_label,status,starts_at,team_a_id,team_b_id,score_a,score_b,winner_team_id";

  const [officialRes, gamesRes, venuesRes, playTogetherRes, singleEventRes, liveMatchRes, upcomingMatchRes, completedMatchRes] = await Promise.all([
    sb.from("events_full")
      .select("*")
      .in("event_type", ["venue_event", "platform_event"])
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(8),
    sb.from("events_full")
      .select("*")
      .eq("event_type", "pickup")
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(8),
    sb.from("venues")
      .select("id, name, venue_type, address, photos, sports, lat, lng, courts(base_price, status)")
      .eq("verification_status", "verified")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(8),
    sb.from("games")
      .select(`
        id, sport, game_format, starts_at, contribution_amount, max_players, skill_level,
        venues (name),
        host:profiles!games_host_id_fkey (full_name, avatar_url, trust_score)
      `)
      .eq("status", "published")
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(8),
    sb.from("tournaments")
      .select(`
        id, owner_id, organizer_type, organizer_name, name, sport, starts_at, max_teams,
        skill_category, fee, venue_id, venues(name)
      `)
      .eq("format", "single_event")
      .in("status", ["registration_open", "live"])
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(8),
    // Live scores rail — three disjoint status buckets fetched separately
    // (rather than one query ordered by status) so the rail can always
    // show live matches first, then the soonest upcoming ones, then the
    // most recently finished ones, instead of an arbitrary status sort.
    sb.from("tournament_matches")
      .select(MATCH_COLS)
      .eq("status", "live")
      .not("team_a_id", "is", null).not("team_b_id", "is", null)
      .order("starts_at", { ascending: true })
      .limit(6),
    sb.from("tournament_matches")
      .select(MATCH_COLS)
      .eq("status", "scheduled")
      .not("team_a_id", "is", null).not("team_b_id", "is", null)
      .not("starts_at", "is", null)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(6),
    sb.from("tournament_matches")
      .select(MATCH_COLS)
      .eq("status", "completed")
      .not("team_a_id", "is", null).not("team_b_id", "is", null)
      .not("score_a", "is", null).not("score_b", "is", null)
      .order("starts_at", { ascending: false })
      .limit(6),
  ]);

  // Confirmed-player count per game — needs the IDs from the query above,
  // so it can't join the Promise.all, but it's bounded to at most 8 rows
  // (the homepage teaser limit), not the whole table.
  type RawPTGame = {
    id: string; sport: string; game_format: string | null; starts_at: string;
    contribution_amount: number; max_players: number; skill_level: string | null;
    venues: { name: string } | null;
    host: { full_name: string | null; avatar_url: string | null; trust_score: number | null } | null;
  };
  const ptGames = (playTogetherRes.data ?? []) as unknown as RawPTGame[];
  const ptIds = ptGames.map((g) => g.id);
  const { data: ptPlayers } = ptIds.length
    ? await sb.from("game_players").select("game_id").eq("status", "joined").in("game_id", ptIds)
    : { data: [] as { game_id: string }[] };
  const ptJoined = new Map<string, number>();
  (ptPlayers ?? []).forEach((p) => ptJoined.set(p.game_id, (ptJoined.get(p.game_id) ?? 0) + 1));

  const playTogetherGames: RailEvent[] = ptGames.map((g) => ({
    id: g.id,
    title: g.game_format ? `${g.sport} · ${g.game_format}` : g.sport,
    sport: g.sport,
    venue: g.venues?.name ?? "Venue",
    event_date: g.starts_at,
    fee: Number(g.contribution_amount) || 0,
    max_players: g.max_players,
    // The host occupies one of max_players without a game_players row —
    // same accounting as usePlayTogetherEvents.ts / availablePlayerSpots.
    slots_remaining: Math.max(g.max_players - 1 - (ptJoined.get(g.id) ?? 0), 0),
    event_type: "play_together",
    organizer_name: null,
    skill_level: g.skill_level,
    sport_color: null,
    host_name: g.host?.full_name ?? null,
    host_avatar: g.host?.avatar_url ?? null,
    host_trust: g.host?.trust_score ?? null,
  }));

  const games = [...(gamesRes.data ?? []) as RailEvent[], ...playTogetherGames]
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 8);

  // single_event tournaments — what replaced the old vendor-created
  // venue_event/platform_event rows — folded into the same "Official
  // events" rail, same event_type tags (badge styling already handles
  // venue vs platform) plus is_tournament so the card links to
  // /tournaments/[id] instead of /game/[id].
  type RawSingleEventTournament = {
    id: string; owner_id: string | null; organizer_type: "venue" | "platform"; organizer_name: string | null;
    name: string; sport: string; starts_at: string; max_teams: number; skill_category: string | null;
    fee: number; venue_id: string; venues: { name: string } | null;
  };
  const singleEventTournaments = (singleEventRes.data ?? []) as unknown as RawSingleEventTournament[];
  const tIds = singleEventTournaments.map((t) => t.id);
  const { data: tTeams } = tIds.length
    ? await sb.from("tournament_teams").select("tournament_id").eq("status", "confirmed").in("tournament_id", tIds)
    : { data: [] as { tournament_id: string }[] };
  const tConfirmed = new Map<string, number>();
  (tTeams ?? []).forEach((t) => tConfirmed.set(t.tournament_id, (tConfirmed.get(t.tournament_id) ?? 0) + 1));

  const officialTournaments: RailEvent[] = singleEventTournaments.map((t) => {
    const count = tConfirmed.get(t.id) ?? 0;
    return {
      id: t.id,
      title: t.name,
      sport: t.sport,
      venue: t.venues?.name ?? "Venue",
      event_date: t.starts_at,
      fee: Number(t.fee) || 0,
      max_players: t.max_teams,
      slots_remaining: Math.max(t.max_teams - count, 0),
      event_type: t.organizer_type === "platform" ? "platform_event" : "venue_event",
      is_tournament: true,
      organizer_name: t.organizer_name,
      skill_level: t.skill_category,
      sport_color: null,
      host_name: null,
      host_avatar: null,
      host_trust: null,
    };
  });

  const official = [...(officialRes.data ?? []) as RailEvent[], ...officialTournaments]
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 8);

  // Live scores rail — live matches first, then soonest upcoming, then
  // most recently finished, capped to a homepage-sized teaser. Needs
  // team names/logos and the parent tournament's name/sport/format,
  // neither of which the match row carries — batched in by id (like
  // tConfirmed above) rather than embedded, since tournament_matches has
  // two FKs into tournament_teams (team_a_id/team_b_id) and PostgREST
  // embedding needs the constraint name to disambiguate which is which.
  type RawMatch = {
    id: string; tournament_id: string; round_label: string; status: string; starts_at: string | null;
    team_a_id: string; team_b_id: string; score_a: number | null; score_b: number | null; winner_team_id: string | null;
  };
  const rawMatches = [
    ...(liveMatchRes.data ?? []) as RawMatch[],
    ...(upcomingMatchRes.data ?? []) as RawMatch[],
    ...(completedMatchRes.data ?? []) as RawMatch[],
  ].slice(0, 8);

  const matchTournamentIds = [...new Set(rawMatches.map((m) => m.tournament_id))];
  const matchTeamIds = [...new Set(rawMatches.flatMap((m) => [m.team_a_id, m.team_b_id]))];
  const [{ data: matchTournaments }, { data: matchTeams }] = await Promise.all([
    matchTournamentIds.length
      ? sb.from("tournaments").select("id,name,sport,format,status")
          .in("id", matchTournamentIds)
          .in("status", ["registration_open", "registration_closed", "live", "completed"])
      : Promise.resolve({ data: [] as { id: string; name: string; sport: string; format: string; status: string }[] }),
    matchTeamIds.length
      ? sb.from("tournament_teams").select("id,name,logo_url").in("id", matchTeamIds)
      : Promise.resolve({ data: [] as { id: string; name: string; logo_url: string | null }[] }),
  ]);
  const tournamentById = new Map((matchTournaments ?? []).map((t) => [t.id, t]));
  const teamById = new Map((matchTeams ?? []).map((t) => [t.id, t]));

  const matches: RailMatch[] = rawMatches.flatMap((m) => {
    const t = tournamentById.get(m.tournament_id);
    const a = teamById.get(m.team_a_id);
    const b = teamById.get(m.team_b_id);
    // A tournament missing here means it failed the public-status filter
    // above (e.g. was pulled back to draft) — drop the match rather than
    // show a scorecard for something no longer publicly listed.
    if (!t || !a || !b) return [];
    return [{
      id: m.id,
      tournamentId: m.tournament_id,
      tournamentName: t.name,
      sport: t.sport,
      format: t.format,
      roundLabel: m.round_label,
      status: m.status as RailMatch["status"],
      startsAt: m.starts_at,
      teamA: { id: a.id, name: a.name, logoUrl: a.logo_url },
      teamB: { id: b.id, name: b.name, logoUrl: b.logo_url },
      scoreA: m.score_a,
      scoreB: m.score_b,
      winnerTeamId: m.winner_team_id,
    }];
  });

  return {
    official,
    games,
    matches,
    venues: (venuesRes.data ?? []).map((v) => {
      const { courts, ...venue } = v as typeof v & {
        courts: { base_price: number; status: string }[] | null;
      };
      const prices = (courts ?? [])
        .filter((c) => c.status === "active")
        .map((c) => Number(c.base_price) || 0)
        .filter((p) => p > 0);
      return { ...venue, from_price: prices.length ? Math.min(...prices) : null };
    }) as RailVenue[],
  };
}
