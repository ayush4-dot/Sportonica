"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import {
  setTeamSeed, generateKnockoutBracket, generateLeagueFixtures, generateGroupFixtures,
  generateKnockoutFromGroups, recordMatchResult, unscheduleMatch,
  getTeamRoster, getMatchPlayerStats, recordMatchPlayerStats,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { Tournament, TournamentTeam, TournamentMatch, TournamentMatchPlayerStat } from "@/lib/tournaments/types";
import ScheduleMatchModal from "./ScheduleMatchModal";

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

type CourtOption = { id: string; name: string };
const DONE = new Set(["completed", "walkover", "cancelled"]);

export default function FixturesTab({
  tournament, teams, matches, courts,
}: {
  tournament: Tournament;
  teams: TournamentTeam[]; // confirmed teams only
  matches: TournamentMatch[];
  courts: CourtOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<TournamentMatch | null>(null);
  const [recordingStats, setRecordingStats] = useState<TournamentMatch | null>(null);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);

  const teamsById = new Map(teams.map((t) => [t.id, t.name]));
  const teamName = (id: string | null) => (id ? teamsById.get(id) ?? "Unknown" : "TBD");

  function run(action: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      const res = await action();
      if (isActionError(res)) { setErr(res.message); return; }
      router.refresh();
    });
  }

  const generated = matches.length > 0;
  const groupMatches = matches.filter((m) => m.stage === "group");
  const groupStageComplete = groupMatches.length > 0 && groupMatches.every((m) => DONE.has(m.status));
  const hasKnockout = matches.some((m) => m.stage === "knockout");

  if (!generated) {
    if (tournament.status !== "registration_closed") {
      return <div className="tc-empty">Close registration to seed teams and generate fixtures.</div>;
    }
    if (teams.length < 2) {
      return <div className="tc-empty">Need at least 2 confirmed teams to generate fixtures.</div>;
    }

    const sorted = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name));

    function move(idx: number, dir: -1 | 1) {
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const reordered = [...sorted];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      run(async () => {
        for (let i = 0; i < reordered.length; i++) {
          const res = await setTeamSeed(reordered[i].id, i + 1, reordered[i].group_name ?? undefined);
          if (isActionError(res)) return res;
        }
      });
    }

    return (
      <div className="tc-card">
        <div className="tc-card-t">Seed teams</div>
        <div className="tc-card-sub">
          {tournament.format === "group_knockout"
            ? "Set each team's group, then generate group fixtures."
            : "Order determines bracket/schedule position — reorder before generating."}
        </div>
        <table className="tc-table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>#</th><th>Team</th>{tournament.format === "group_knockout" && <th>Group</th>}<th></th></tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.id}>
                <td className="tc-num">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                {tournament.format === "group_knockout" && (
                  <td>
                    <input
                      defaultValue={t.group_name ?? ""}
                      placeholder="e.g. A"
                      style={{ ...inputStyle, width: 56 }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== (t.group_name ?? "")) run(() => setTeamSeed(t.id, t.seed ?? i + 1, v));
                      }}
                    />
                  </td>
                )}
                <td>
                  <button className="tc-btn" disabled={pending || i === 0} onClick={() => move(i, -1)} style={{ padding: "6px 10px", marginRight: 6 }}>
                    <ArrowUp size={13} />
                  </button>
                  <button className="tc-btn" disabled={pending || i === sorted.length - 1} onClick={() => move(i, 1)} style={{ padding: "6px 10px" }}>
                    <ArrowDown size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {err && <div className="tc-err" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ marginTop: 16 }}>
          {tournament.format === "knockout" && (
            <button className="tc-btn primary" disabled={pending} onClick={() => run(() => generateKnockoutBracket(tournament.id))}>Generate bracket</button>
          )}
          {tournament.format === "league" && (
            <button className="tc-btn primary" disabled={pending} onClick={() => run(() => generateLeagueFixtures(tournament.id))}>Generate fixtures</button>
          )}
          {tournament.format === "group_knockout" && (
            <button className="tc-btn primary" disabled={pending} onClick={() => run(() => generateGroupFixtures(tournament.id))}>Generate group fixtures</button>
          )}
        </div>
      </div>
    );
  }

  const rounds = new Map<string, TournamentMatch[]>();
  for (const m of matches) {
    if (!rounds.has(m.round_label)) rounds.set(m.round_label, []);
    rounds.get(m.round_label)!.push(m);
  }

  return (
    <div className="tc-card">
      <div className="tc-card-t">Fixtures</div>
      {err && <div className="tc-err">{err}</div>}

      {tournament.format === "group_knockout" && groupStageComplete && !hasKnockout && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0 20px", padding: 14, background: "rgba(0,98,65,0.08)", borderRadius: 12 }}>
          <span style={{ fontSize: 13 }}>Group stage complete — advance</span>
          <input
            type="number" min={1} value={advancePerGroup} onChange={(e) => setAdvancePerGroup(Math.max(1, Number(e.target.value)))}
            style={{ ...inputStyle, width: 50 }}
          />
          <span style={{ fontSize: 13 }}>team(s) per group.</span>
          <button className="tc-btn primary" disabled={pending} onClick={() => run(() => generateKnockoutFromGroups(tournament.id, advancePerGroup))}>
            Generate knockout stage
          </button>
        </div>
      )}

      {[...rounds.entries()].map(([label, ms]) => (
        <div key={label} style={{ marginBottom: 22 }}>
          <div className="tc-card-sub" style={{ fontWeight: 700, opacity: 0.8, marginBottom: 8 }}>{label}</div>
          <table className="tc-table">
            <thead><tr><th>Match</th><th>When / Where</th><th>Score</th><th></th></tr></thead>
            <tbody>
              {ms.map((m) => (
                <MatchRow
                  key={m.id} match={m} teamName={teamName} courts={courts} pending={pending}
                  onSchedule={() => setScheduling(m)}
                  onUnschedule={() => run(() => unscheduleMatch(m.id))}
                  onResult={(a, b, winnerId) => run(() => recordMatchResult(m.id, a, b, winnerId))}
                  onRecordStats={() => setRecordingStats(m)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {scheduling && (
        <ScheduleMatchModal
          match={scheduling}
          courts={courts}
          durationMins={tournament.match_duration_mins ?? 60}
          onClose={() => setScheduling(null)}
          onScheduled={() => { setScheduling(null); router.refresh(); }}
        />
      )}

      {recordingStats && (
        <MatchPlayerStatsModal
          match={recordingStats}
          teamName={teamName}
          onClose={() => setRecordingStats(null)}
          onSaved={() => { setRecordingStats(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function MatchRow({ match, teamName, courts, onSchedule, onUnschedule, onResult, onRecordStats, pending }: {
  match: TournamentMatch;
  teamName: (id: string | null) => string;
  courts: CourtOption[];
  onSchedule: () => void;
  onUnschedule: () => void;
  onResult: (a: number | null, b: number | null, winnerId?: string) => void;
  onRecordStats: () => void;
  pending: boolean;
}) {
  const [scoreA, setScoreA] = useState(match.score_a?.toString() ?? "");
  const [scoreB, setScoreB] = useState(match.score_b?.toString() ?? "");
  const bothSet = !!match.team_a_id && !!match.team_b_id;
  const done = DONE.has(match.status);
  const courtName = courts.find((c) => c.id === match.court_id)?.name;

  const when = match.starts_at
    ? new Date(match.starts_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" })
    : null;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{teamName(match.team_a_id)} <span className="tc-dim">vs</span> {teamName(match.team_b_id)}</div>
        {match.status === "walkover" && <span className="tc-badge warn">Walkover — {teamName(match.winner_team_id)}</span>}
        {match.status === "completed" && match.team_b_id === null && <span className="tc-badge ok">Bye</span>}
      </td>
      <td className="tc-dim" style={{ fontSize: 12.5 }}>
        {when ? <>{when}{courtName ? ` · ${courtName}` : ""}</> : bothSet && !done ? "Not scheduled" : "—"}
      </td>
      <td className="tc-num">{match.status === "completed" ? `${match.score_a} – ${match.score_b}` : "—"}</td>
      <td>
        {match.status === "completed" && (
          <button className="tc-btn" disabled={pending} onClick={onRecordStats} style={{ padding: "6px 10px" }}>Player stats</button>
        )}
        {done || match.team_b_id === null ? null : !bothSet ? (
          <span className="tc-dim" style={{ fontSize: 12 }}>Waiting for teams</span>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {match.status === "unscheduled" && (
              <button className="tc-btn" disabled={pending} onClick={onSchedule} style={{ padding: "6px 10px" }}>Schedule</button>
            )}
            {match.status === "scheduled" && (
              <button className="tc-btn" disabled={pending} onClick={onUnschedule} style={{ padding: "6px 10px" }}>Unschedule</button>
            )}
            <input
              type="number" placeholder="A" value={scoreA} onChange={(e) => setScoreA(e.target.value)}
              style={{ ...inputStyle, width: 44 }} aria-label={`${teamName(match.team_a_id)} score`}
            />
            <input
              type="number" placeholder="B" value={scoreB} onChange={(e) => setScoreB(e.target.value)}
              style={{ ...inputStyle, width: 44 }} aria-label={`${teamName(match.team_b_id)} score`}
            />
            <button
              className="tc-btn primary" disabled={pending || scoreA === "" || scoreB === ""} style={{ padding: "6px 10px" }}
              onClick={() => onResult(Number(scoreA), Number(scoreB))}
            >
              Save
            </button>
            {match.team_a_id && match.team_b_id && (
              <>
                <button
                  className="tc-btn" disabled={pending} style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    if (!window.confirm(`Record a walkover win for ${teamName(match.team_a_id)}? No score is recorded and this can't be undone.`)) return;
                    onResult(null, null, match.team_a_id!);
                  }}
                >
                  Walkover A
                </button>
                <button
                  className="tc-btn" disabled={pending} style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    if (!window.confirm(`Record a walkover win for ${teamName(match.team_b_id)}? No score is recorded and this can't be undone.`)) return;
                    onResult(null, null, match.team_b_id!);
                  }}
                >
                  Walkover B
                </button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

type RosterPlayer = { id: string; user_id: string | null; guest_name: string | null; name: string };

function MatchPlayerStatsModal({
  match, teamName, onClose, onSaved,
}: {
  match: TournamentMatch;
  teamName: (id: string | null) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [mom, setMom] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      match.team_a_id ? getTeamRoster(match.team_a_id) : Promise.resolve([]),
      match.team_b_id ? getTeamRoster(match.team_b_id) : Promise.resolve([]),
      getMatchPlayerStats(match.id),
    ]).then(([a, b, stats]) => {
      if (cancelled) return;
      const rosterA = isActionError(a) ? [] : a;
      const rosterB = isActionError(b) ? [] : b;
      setRoster([...rosterA, ...rosterB]);
      if (!isActionError(stats)) {
        const g: Record<string, string> = {};
        let m: string | null = null;
        for (const s of stats as TournamentMatchPlayerStat[]) {
          g[s.team_player_id] = String(s.goals);
          if (s.is_mom) m = s.team_player_id;
        }
        setGoals(g);
        setMom(m);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [match.id, match.team_a_id, match.team_b_id]);

  function submit() {
    setErr(null);
    startTransition(async () => {
      const stats = roster.map((p) => ({
        team_player_id: p.id,
        goals: Number(goals[p.id]) || 0,
        is_mom: p.id === mom,
      }));
      const res = await recordMatchPlayerStats(match.id, stats);
      if (isActionError(res)) { setErr(res.message); return; }
      onSaved();
    });
  }

  return (
    <div className="tc-scrim" onClick={onClose}>
      <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800 }}>Player stats</h3>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>
        <div className="tc-dim" style={{ fontSize: 12.5, marginBottom: 16 }}>
          {teamName(match.team_a_id)} {match.score_a}–{match.score_b} {teamName(match.team_b_id)}
        </div>

        {loading ? (
          <div className="tc-empty">Loading roster…</div>
        ) : roster.length === 0 ? (
          <div className="tc-empty">Neither team has a roster to record stats for.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px", gap: 8, fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              <div>Player</div><div>Goals</div><div>MOM</div>
            </div>
            {roster.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px", gap: 8, alignItems: "center", padding: "6px 0" }}>
                <div style={{ fontSize: 13.5 }}>{p.name}</div>
                <input
                  type="number" min={0} value={goals[p.id] ?? ""}
                  onChange={(e) => setGoals((g) => ({ ...g, [p.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 60 }}
                />
                <input
                  type="radio" name="mom" checked={mom === p.id} onChange={() => setMom(p.id)}
                  style={{ justifySelf: "start", width: 18, height: 18 }} aria-label={`${p.name} is man of the match`}
                />
              </div>
            ))}
          </>
        )}

        {err && <div className="tc-err" style={{ marginTop: 14 }}>{err}</div>}
        <button className="tc-btn primary" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} disabled={pending || loading} onClick={submit}>
          {pending ? "Saving…" : "Save stats"}
        </button>
      </div>
    </div>
  );
}
