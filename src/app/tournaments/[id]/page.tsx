import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getTournament, getDisplayVenueName, getMyTeamForTournament, getTournamentMatches, listTournamentTeams,
  getTournamentStandings, getTournamentPlayerStats, getTournamentAwards,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS } from "@/lib/tournaments/types";
import type { TournamentStanding } from "@/lib/tournaments/types";
import { telHref } from "@/lib/playTogether/types";
import TournamentShareBar from "@/components/tournaments/TournamentShareBar";
import EventTabs from "@/components/tournaments/public/EventTabs";
import "@/app/(play)/play.css";
import "@/app/platform/events/events.css";

export const dynamic = "force-dynamic";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
});

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();
  // Draft/pending_approval tournaments are only visible to their vendor
  // or a super_admin (RLS) — getTournament() already enforces that, so
  // reaching this point with a non-published status means the viewer is
  // the owner previewing it before publish.

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const isLiveOrDone = tournament.status === "live" || tournament.status === "completed";
  const [venueName, myTeam, matchesRes, teamsRes, playerStatsRes, awardsRes] = await Promise.all([
    getDisplayVenueName(tournament),
    user ? getMyTeamForTournament(id) : Promise.resolve(null),
    isLiveOrDone ? getTournamentMatches(id) : Promise.resolve([]),
    listTournamentTeams(id),
    isLiveOrDone ? getTournamentPlayerStats(id) : Promise.resolve([]),
    isLiveOrDone ? getTournamentAwards(id) : Promise.resolve({ winner: null, runnerUp: null, semifinalists: [] }),
  ]);
  const matches = isActionError(matchesRes) ? [] : matchesRes;
  const teams = isActionError(teamsRes) ? [] : teamsRes;
  const playerStats = isActionError(playerStatsRes) ? [] : playerStatsRes;
  const awards = isActionError(awardsRes) ? { winner: null, runnerUp: null, semifinalists: [] } : awardsRes;

  const hasStandings = tournament.format === "league" || tournament.format === "group_knockout";
  const groups = tournament.format === "group_knockout"
    ? [...new Set(teams.map((t) => t.group_name).filter((g): g is string => !!g))].sort()
    : [""];
  const standingsByGroup: Record<string, TournamentStanding[]> = {};
  if (hasStandings && matches.length > 0) {
    const entries = await Promise.all(groups.map(async (g) => {
      const res = await getTournamentStandings(id, g || undefined);
      return [g, isActionError(res) ? [] : res] as const;
    }));
    for (const [g, rows] of entries) standingsByGroup[g] = rows;
  }

  const phoneHref = tournament.contact_phone ? telHref(tournament.contact_phone) : null;
  const prizes = [
    tournament.prize_winner && ["Winner", tournament.prize_winner],
    tournament.prize_runner_up && ["Runner-up", tournament.prize_runner_up],
    tournament.prize_mvp && ["MVP", tournament.prize_mvp],
    tournament.prize_other && ["Other", tournament.prize_other],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="play">
      <div className="play-wrap" style={{ maxWidth: 1040 }}>
        <Link href="/tournaments" className="bk-back"><ChevronLeft size={16} /> All tournaments</Link>

        <div className="bk-hero">
          {/* banner_url used to be a freeform text field — an old row can hold
              a bare filename instead of a real URL, which just renders as a
              broken image rather than falling back cleanly. */}
          {tournament.banner_url && /^https?:\/\//i.test(tournament.banner_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.banner_url} alt="" />
          ) : (
            <div className="bk-hero-empty"><Trophy size={40} /></div>
          )}
          <div className="bk-hero-grad" />
          <div className="bk-hero-info">
            <span className="bk-sport-pill">{tournament.sport}</span>
            <h1>{tournament.name}</h1>
            <div className="sub">
              <span>{venueName}</span>
              <span>{FORMAT_LABELS[tournament.format]}</span>
              <span>{when(tournament.starts_at)}</span>
            </div>
          </div>
        </div>

        <TournamentShareBar id={tournament.id} name={tournament.name} />

        <div className="bk-layout">
          <div>
            <EventTabs
              tournament={tournament}
              teams={teams}
              matches={matches}
              standingsByGroup={standingsByGroup}
              playerStats={playerStats}
              awards={awards}
              myTeam={isActionError(myTeam) ? null : myTeam}
              loggedIn={!!user}
            />

            {prizes.length > 0 && (
              <div className="bk-panel">
                <h3>Prizes</h3>
                {prizes.map(([label, value]) => (
                  <div key={label} className="bk-sum-row"><span className="lbl">{label}</span><span className="val">{value}</span></div>
                ))}
              </div>
            )}

            {(tournament.rules_text || tournament.equipment_notes || tournament.venue_rules) && (
              <div className="bk-panel">
                <h3>Rules</h3>
                {tournament.rules_text && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{tournament.rules_text}</p>}
                {tournament.equipment_notes && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Equipment:</b> {tournament.equipment_notes}</p>}
                {tournament.venue_rules && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Venue rules:</b> {tournament.venue_rules}</p>}
              </div>
            )}

            {tournament.refund_policy && (
              <div className="bk-panel">
                <h3>Refund policy</h3>
                <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{tournament.refund_policy}</p>
              </div>
            )}
          </div>

          <div className="bk-summary">
            <div className="bk-panel">
              <h3>Tournament details</h3>
              <div className="bk-sum-row"><span className="lbl">Entry fee</span><span className="val">{tournament.fee > 0 ? money(tournament.fee) : "Free"}</span></div>
              <div className="bk-sum-row"><span className="lbl">Team size</span><span className="val">{tournament.min_players_per_team}–{tournament.max_players_per_team} players</span></div>
              <div className="bk-sum-row"><span className="lbl">Max teams</span><span className="val">{tournament.max_teams}</span></div>
              <div className="bk-sum-row"><span className="lbl">Registration closes</span><span className="val">{when(tournament.registration_closes_at)}</span></div>
              {tournament.skill_category && <div className="bk-sum-row"><span className="lbl">Category</span><span className="val">{tournament.skill_category}</span></div>}
              {tournament.gender_rule && <div className="bk-sum-row"><span className="lbl">Eligibility</span><span className="val">{tournament.gender_rule}</span></div>}
              {tournament.own_venue_map_url && (
                <div className="bk-sum-row">
                  <span className="lbl">Location</span>
                  <a href={tournament.own_venue_map_url} target="_blank" rel="noopener noreferrer" className="val" style={{ color: "#006241", textDecoration: "none" }}>
                    Get directions
                  </a>
                </div>
              )}
              {phoneHref && (
                <div className="bk-sum-row">
                  <span className="lbl">Contact</span>
                  <a href={phoneHref} className="val" style={{ color: "#006241", textDecoration: "none" }}>{tournament.contact_phone}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
