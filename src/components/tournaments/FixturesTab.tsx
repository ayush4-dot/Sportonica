"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, History, Pencil } from "lucide-react";
import {
  recordMatchResult, setMatchTime, createMatch, deleteMatch, updateMatchTeams, getMatchAudit,
  getTeamRoster, getMatchPlayerStats, recordMatchPlayerStats,
  generateKnockoutBracket, setTeamSeed, setMatchStatus,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { Tournament, TournamentTeam, TournamentMatch, TournamentMatchPlayerStat, MatchAuditEntry } from "@/lib/tournaments/types";

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

const KTM_TZ = "Asia/Kathmandu";
// Fixed +05:45 offset (no DST) — same convention as BookingFlow.tsx.
function ktmIso(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}:00+05:45`;
}
function toLocalDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: KTM_TZ }) : "";
}
function toLocalTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: KTM_TZ }) : "";
}

const DONE = new Set(["completed", "walkover", "cancelled"]);

// "Winner of X" quick-pick — reads matches already on the page, no
// bracket tree or auto-wiring involved. Lets an admin building round 2
// grab round 1's winner by name instead of having to remember/re-find
// it in the confirmed-teams list.
function winnerOptions(matches: TournamentMatch[], teamName: (id: string | null) => string) {
  const out: { id: string; label: string }[] = [];
  for (const m of matches) {
    if (!m.winner_team_id) continue;
    out.push({ id: m.winner_team_id, label: `${teamName(m.winner_team_id)} — won ${m.round_label}` });
  }
  return out;
}

function TeamSelect({ value, onChange, teams, winners, excludeId, placeholder, style }: {
  value: string;
  onChange: (id: string) => void;
  teams: TournamentTeam[];
  winners: { id: string; label: string }[];
  excludeId?: string;
  placeholder: string;
  style?: React.CSSProperties;
}) {
  const winnerOpts = winners.filter((w) => w.id !== excludeId);
  const teamOpts = teams.filter((t) => t.id !== excludeId);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      <option value="">{placeholder}</option>
      {winnerOpts.length > 0 && (
        <optgroup label="Winners">
          {winnerOpts.map((w) => <option key={`w-${w.id}`} value={w.id}>{w.label}</option>)}
        </optgroup>
      )}
      <optgroup label="All confirmed teams">
        {teamOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </optgroup>
    </select>
  );
}

export default function FixturesTab({
  tournament, teams, matches,
}: {
  tournament: Tournament;
  teams: TournamentTeam[]; // confirmed teams only
  matches: TournamentMatch[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [recordingStats, setRecordingStats] = useState<TournamentMatch | null>(null);
  const [mode, setMode] = useState<"choose" | "manual" | "auto">("choose");
  const errRef = useRef<HTMLDivElement | null>(null);

  // The error banner sits at the top of a card that can scroll for a
  // while (many rounds/matches) — an action taken far down the list
  // otherwise fails silently as far as the admin can see, since the
  // message renders somewhere they've already scrolled past.
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [err]);

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

  const registrationClosed = tournament.status === "registration_closed" || tournament.status === "live";
  const canAddMatches = registrationClosed && teams.length >= 1;
  const canGenerateBracket =
    tournament.format === "knockout" && tournament.status === "registration_closed" && matches.length === 0 && teams.length >= 2;

  if (!canAddMatches && matches.length === 0) {
    return (
      <div className="tc-empty">
        {!registrationClosed
          ? "Close registration to start adding matches."
          : "Registration is closed, but no team is confirmed yet — approve at least one team's payment (or add a walk-in team) before fixtures can be added."}
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
      <div className="tc-card-sub">
        {canGenerateBracket && mode === "choose"
          ? "Choose how you'd like to build the bracket."
          : "Add each match by hand — pick both teams, a round, and (optionally) a group. Set the date/time per match once it's added."}
      </div>
      {err && <div ref={errRef} className="tc-err">{err}</div>}

      {canGenerateBracket && mode === "choose" ? (
        <FixtureModeChooser onChoose={setMode} />
      ) : (
        <>
          {canGenerateBracket && mode === "auto" && (
            <>
              <GenerateBracketPanel
                teams={teams} pending={pending}
                onSeed={(teamId, seed) => run(() => setTeamSeed(teamId, seed))}
                onGenerate={() => {
                  if (!window.confirm(`Auto-generate the bracket for ${teams.length} teams? Byes are assigned automatically for any round that doesn't divide evenly. You can still edit any match by hand afterwards.`)) return;
                  run(() => generateKnockoutBracket(tournament.id));
                }}
              />
              <button className="tc-btn" disabled={pending} style={{ padding: "6px 10px", fontSize: 12, marginTop: -4, marginBottom: 16 }} onClick={() => setMode("choose")}>
                ‹ Choose a different way to build this
              </button>
            </>
          )}

          {canAddMatches && (!canGenerateBracket || mode === "manual") && (
            <>
              <AddMatchForm
                tournament={tournament} teams={teams} matches={matches} teamName={teamName} pending={pending}
                onAdd={(input) => run(() => createMatch(input))}
              />
              {canGenerateBracket && (
                <button className="tc-btn" disabled={pending} style={{ padding: "6px 10px", fontSize: 12, marginTop: -8, marginBottom: 16 }} onClick={() => setMode("choose")}>
                  ‹ Choose a different way to build this
                </button>
              )}
            </>
          )}
        </>
      )}

      {matches.length === 0 ? (
        <div className="tc-empty">No matches added yet.</div>
      ) : (
        [...rounds.entries()].map(([label, ms]) => (
          <div key={label} style={{ marginBottom: 26 }}>
            <div className="tc-card-sub" style={{ fontWeight: 700, opacity: 0.8, marginBottom: 8 }}>{label}</div>
            {canAddMatches && (
              <RoundAddMatch
                tournament={tournament} teams={teams} matches={matches} teamName={teamName} pending={pending}
                stage={ms[0].stage} round={ms[0].round} roundLabel={label} groupName={ms[0].group_name}
                onAdd={(input) => run(() => createMatch(input))}
              />
            )}
            <table className="tc-table">
              <thead><tr><th>Match</th><th>When</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {ms.map((m) => (
                  <MatchRow
                    key={m.id} match={m} teams={teams} matches={matches} teamName={teamName} pending={pending}
                    onResult={(a, b, winnerId, et, pens, confirmCascade) => run(() => recordMatchResult(m.id, a, b, winnerId, et, pens, confirmCascade))}
                    onRecordStats={() => setRecordingStats(m)}
                    onSetTime={(startsAt, endsAt, courtLabel, notes) => run(() => setMatchTime(m.id, startsAt, endsAt, courtLabel, notes))}
                    onSetStatus={(status) => run(() => setMatchStatus(m.id, status))}
                    onUpdateTeams={(teamAId, teamBId) => run(() => updateMatchTeams(m.id, teamAId, teamBId))}
                    onDelete={() => {
                      const note = m.winner_team_id && m.next_match_id
                        ? ` ${teamName(m.winner_team_id)} already advanced from this match — that will be reset too.`
                        : "";
                      if (!window.confirm(`Delete ${teamName(m.team_a_id)} vs ${teamName(m.team_b_id)}? This can't be undone.${note}`)) return;
                      run(() => deleteMatch(m.id));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {recordingStats && (
        <MatchPlayerStatsModal
          match={recordingStats}
          teamName={teamName}
          yellowCardFine={tournament.yellow_card_fine}
          redCardFine={tournament.red_card_fine}
          onClose={() => setRecordingStats(null)}
          onSaved={() => { setRecordingStats(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// The very first decision on an empty knockout bracket: build it by
// hand, or let the server auto-pair seeded teams into a full tree.
// Shown only while nothing exists yet — once a single match is added
// either way, this never comes back for this tournament.
function FixtureModeChooser({ onChoose }: { onChoose: (mode: "manual" | "auto") => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, marginBottom: 20 }}>
      <button
        onClick={() => onChoose("manual")}
        style={{
          textAlign: "left", cursor: "pointer", border: "1px solid rgba(242,237,230,0.14)", borderRadius: 14,
          padding: 18, background: "rgba(242,237,230,0.04)", color: "inherit", font: "inherit",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Build it manually</div>
        <div className="tc-dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          You pick every matchup, round by round. Full control over pairings, byes, and seeding order.
        </div>
      </button>
      <button
        onClick={() => onChoose("auto")}
        style={{
          textAlign: "left", cursor: "pointer", border: "1px solid rgba(0,98,65,0.35)", borderRadius: 14,
          padding: 18, background: "rgba(0,98,65,0.08)", color: "inherit", font: "inherit",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Auto-generate the bracket</div>
        <div className="tc-dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Set seeds (optional), then the full knockout tree is built for you — byes assigned automatically. You can still edit any match by hand afterwards.
        </div>
      </button>
    </div>
  );
}

const STAGE_LABELS: Record<"group" | "league" | "knockout", string> = {
  group: "Group stage", league: "League", knockout: "Knockout",
};

function AddMatchForm({ tournament, teams, matches, teamName, pending, onAdd }: {
  tournament: Tournament;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  teamName: (id: string | null) => string;
  pending: boolean;
  onAdd: (input: {
    tournamentId: string; stage: "group" | "league" | "knockout"; round: number;
    roundLabel: string; teamAId: string; teamBId?: string; groupName?: string;
  }) => void;
}) {
  const fixedStage: "group" | "league" | "knockout" | null =
    tournament.format === "league" ? "league" : tournament.format === "knockout" ? "knockout" : null;
  const [stage, setStage] = useState<"group" | "league" | "knockout">(fixedStage ?? "group");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [round, setRound] = useState(() => (matches.length ? Math.max(...matches.map((m) => m.round)) : 1));
  const [roundLabel, setRoundLabel] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  // Every confirmed team is always selectable — an admin fixing up a
  // generated bracket (swapping a bye, correcting a seed placement)
  // needs to freely re-pick any team, not just ones unused elsewhere.
  const winners = winnerOptions(matches, teamName);

  function submit() {
    if (!teamAId) { setLocalErr("Pick team A."); return; }
    if (teamBId && teamBId === teamAId) { setLocalErr("Pick two different teams."); return; }
    if (!roundLabel.trim()) { setLocalErr("Name this round (e.g. Quarterfinal, Matchday 3)."); return; }
    if (stage === "group" && !groupName.trim()) { setLocalErr("Enter a group name."); return; }
    setLocalErr(null);
    onAdd({
      tournamentId: tournament.id, stage, round, roundLabel: roundLabel.trim(),
      teamAId, teamBId: teamBId || undefined, groupName: stage === "group" ? groupName.trim() : undefined,
    });
    setTeamAId(""); setTeamBId("");
  }

  return (
    <div style={{ background: "rgba(0,98,65,0.06)", borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {!fixedStage && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="tc-dim" style={{ fontSize: 11 }}>Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} style={{ ...inputStyle, width: 130 }}>
              <option value="group">{STAGE_LABELS.group}</option>
              <option value="knockout">{STAGE_LABELS.knockout}</option>
            </select>
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Team A</span>
          <TeamSelect
            value={teamAId} onChange={setTeamAId} teams={teams} winners={winners}
            excludeId={teamBId || undefined} placeholder="Select…" style={{ ...inputStyle, width: 190 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Team B</span>
          <TeamSelect
            value={teamBId} onChange={setTeamBId} teams={teams} winners={winners}
            excludeId={teamAId || undefined} placeholder="TBD / bye" style={{ ...inputStyle, width: 190 }}
          />
        </label>
        {stage === "group" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="tc-dim" style={{ fontSize: 11 }}>Group</span>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="A" style={{ ...inputStyle, width: 60 }} />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Round #</span>
          <input type="number" min={1} value={round} onChange={(e) => setRound(Math.max(1, Number(e.target.value)))} style={{ ...inputStyle, width: 60 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Round label</span>
          <input value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} placeholder="Quarterfinal" style={{ ...inputStyle, width: 140 }} />
        </label>
        <button className="tc-btn primary" disabled={pending} style={{ padding: "9px 14px" }} onClick={submit}>
          <Plus size={14} /> Add match
        </button>
      </div>
      {localErr && <div className="tc-err" style={{ marginTop: 10, marginBottom: 0 }}>{localErr}</div>}
    </div>
  );
}

// Quick "+" to drop one more match straight into a round section
// that already exists, without re-entering its stage/round/label —
// the alternative to AddMatchForm (which is for starting a brand new
// round) for the common case of just adding another game to one
// that's already on the page.
function RoundAddMatch({ tournament, teams, matches, teamName, pending, stage, round, roundLabel, groupName, onAdd }: {
  tournament: Tournament;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  teamName: (id: string | null) => string;
  pending: boolean;
  stage: "group" | "league" | "knockout";
  round: number;
  roundLabel: string;
  groupName: string | null;
  onAdd: (input: {
    tournamentId: string; stage: "group" | "league" | "knockout"; round: number;
    roundLabel: string; teamAId: string; teamBId?: string; groupName?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const winners = winnerOptions(matches, teamName);

  if (!open) {
    return (
      <button className="tc-btn" disabled={pending} style={{ padding: "6px 10px", fontSize: 12, marginBottom: 10 }} onClick={() => setOpen(true)}>
        <Plus size={13} /> Add match to {roundLabel}
      </button>
    );
  }

  function submit() {
    if (!teamAId) { setLocalErr("Pick team A."); return; }
    if (teamBId && teamBId === teamAId) { setLocalErr("Pick two different teams."); return; }
    setLocalErr(null);
    onAdd({ tournamentId: tournament.id, stage, round, roundLabel, teamAId, teamBId: teamBId || undefined, groupName: groupName ?? undefined });
    setTeamAId(""); setTeamBId(""); setOpen(false);
  }

  return (
    <div style={{ background: "rgba(0,98,65,0.06)", borderRadius: 12, padding: 12, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <TeamSelect value={teamAId} onChange={setTeamAId} teams={teams} winners={winners} excludeId={teamBId || undefined} placeholder="Team A" style={{ ...inputStyle, width: 170 }} />
      <span className="tc-dim">vs</span>
      <TeamSelect value={teamBId} onChange={setTeamBId} teams={teams} winners={winners} excludeId={teamAId || undefined} placeholder="TBD / bye" style={{ ...inputStyle, width: 170 }} />
      <button className="tc-btn primary" disabled={pending || !teamAId} style={{ padding: "6px 10px", fontSize: 12 }} onClick={submit}>Add</button>
      <button className="tc-btn" disabled={pending} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setOpen(false); setLocalErr(null); }}>Cancel</button>
      {localErr && <div className="tc-err" style={{ width: "100%", marginTop: 4, marginBottom: 0 }}>{localErr}</div>}
    </div>
  );
}

// Seed list + one-click auto-build — the alternative to hand-building
// fixtures via AddMatchForm. Byes/pairing/round wiring are all handled
// server-side (generate_knockout_bracket / build_knockout_bracket); this
// panel only collects seeds and fires the RPC.
function GenerateBracketPanel({ teams, pending, onSeed, onGenerate }: {
  teams: TournamentTeam[];
  pending: boolean;
  onSeed: (teamId: string, seed: number) => void;
  onGenerate: () => void;
}) {
  const sorted = [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name));
  return (
    <div style={{ background: "rgba(0,98,65,0.06)", borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 12, border: "1px solid rgba(0,98,65,0.15)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Generate bracket</div>
      <div className="tc-dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Optionally set seeds below (unseeded teams are ordered by signup date), then auto-build the full knockout tree — byes are assigned automatically. Or skip this and add matches by hand below instead.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxWidth: 340 }}>
        {sorted.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number" min={1} defaultValue={t.seed ?? undefined} placeholder={String(i + 1)}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0) onSeed(t.id, v); }}
              style={{ ...inputStyle, width: 50 }} aria-label={`${t.name} seed`}
            />
            <span style={{ fontSize: 13.5 }}>{t.name}</span>
          </div>
        ))}
      </div>
      <button className="tc-btn primary" disabled={pending || teams.length < 2} style={{ padding: "9px 14px" }} onClick={onGenerate}>
        Generate bracket ({teams.length} teams)
      </button>
    </div>
  );
}

type SettableStatus = "unscheduled" | "scheduled" | "live" | "postponed" | "cancelled";
const STATUS_OPTIONS: SettableStatus[] = ["unscheduled", "scheduled", "live", "postponed", "cancelled"];
const STATUS_LABEL: Record<SettableStatus, string> = {
  unscheduled: "Unscheduled", scheduled: "Scheduled", live: "Live", postponed: "Postponed", cancelled: "Cancelled",
};

function MatchRow({ match, teams, matches, teamName, onResult, onRecordStats, onSetTime, onSetStatus, onUpdateTeams, onDelete, pending }: {
  match: TournamentMatch;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  teamName: (id: string | null) => string;
  onResult: (
    a: number | null, b: number | null, winnerId?: string,
    extraTime?: { scoreA: number; scoreB: number }, penalties?: { scoreA: number; scoreB: number },
    confirmCascade?: boolean
  ) => void;
  onRecordStats: () => void;
  onSetTime: (startsAt: string | null, endsAt: string | null, courtLabel?: string, notes?: string) => void;
  onSetStatus: (status: SettableStatus) => void;
  onUpdateTeams: (teamAId: string, teamBId?: string) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [editingTeams, setEditingTeams] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [teamAId, setTeamAId] = useState(match.team_a_id ?? "");
  const [teamBId, setTeamBId] = useState(match.team_b_id ?? "");
  const [dateStr, setDateStr] = useState(toLocalDate(match.starts_at));
  const [timeStr, setTimeStr] = useState(toLocalTime(match.starts_at) || "17:00");
  const [courtLabel, setCourtLabel] = useState(match.court_label ?? "");
  const [notes, setNotes] = useState(match.notes ?? "");
  const [scoreA, setScoreA] = useState(match.score_a?.toString() ?? "");
  const [scoreB, setScoreB] = useState(match.score_b?.toString() ?? "");
  const [scoreAEt, setScoreAEt] = useState(match.score_a_et?.toString() ?? "");
  const [scoreBEt, setScoreBEt] = useState(match.score_b_et?.toString() ?? "");
  const [scoreAPens, setScoreAPens] = useState(match.score_a_pens?.toString() ?? "");
  const [scoreBPens, setScoreBPens] = useState(match.score_b_pens?.toString() ?? "");
  const bothSet = !!match.team_a_id && !!match.team_b_id;
  const done = DONE.has(match.status);

  // Every confirmed team stays selectable here too — see AddMatchForm.
  const winners = winnerOptions(matches, teamName).filter((w) => w.id !== match.winner_team_id);

  // A knockout match can't end level — group/league draws are a valid
  // result on their own. When regulation is tied, reveal extra time;
  // if that's also tied, reveal penalties — same fallback order the
  // server enforces in record_match_result().
  const needsDecisiveWinner = match.stage === "knockout";
  const regTied = scoreA !== "" && scoreB !== "" && Number(scoreA) === Number(scoreB);
  const etTied = scoreAEt !== "" && scoreBEt !== "" && Number(scoreAEt) === Number(scoreBEt);
  const showEt = needsDecisiveWinner && regTied;
  const showPens = showEt && (etTied || (scoreAEt === "" && scoreBEt === ""));
  const decisive =
    !regTied
    || (scoreAEt !== "" && scoreBEt !== "" && !etTied)
    || (scoreAPens !== "" && scoreBPens !== "" && Number(scoreAPens) !== Number(scoreBPens));
  const canSave = scoreA !== "" && scoreB !== "" && (!needsDecisiveWinner || decisive);

  // The bracket only has a fixed next-match slot to overwrite when this
  // match was created via Generate Bracket (or manually opted in) — most
  // hand-built fixtures have no next_match_id, so this is a no-op for them.
  function computeWinner(): string | null {
    if (scoreA === "" || scoreB === "") return null;
    const a = Number(scoreA), b = Number(scoreB);
    if (a !== b) return a > b ? match.team_a_id : match.team_b_id;
    if (scoreAEt !== "" && scoreBEt !== "") {
      const ae = Number(scoreAEt), be = Number(scoreBEt);
      if (ae !== be) return ae > be ? match.team_a_id : match.team_b_id;
    }
    if (scoreAPens !== "" && scoreBPens !== "") {
      const ap = Number(scoreAPens), bp = Number(scoreBPens);
      if (ap !== bp) return ap > bp ? match.team_a_id : match.team_b_id;
    }
    return null;
  }

  function cascadeConflict(winnerId: string | null): TournamentMatch | null {
    if (!winnerId || !match.next_match_id) return null;
    const next = matches.find((m) => m.id === match.next_match_id);
    if (!next) return null;
    const currentSlotTeam = match.next_match_slot === "a" ? next.team_a_id : next.team_b_id;
    return currentSlotTeam && currentSlotTeam !== winnerId ? next : null;
  }

  function confirmCascadeIfNeeded(winnerId: string | null): boolean {
    const conflict = cascadeConflict(winnerId);
    if (!conflict) return true;
    const conflictTeam = match.next_match_slot === "a" ? conflict.team_a_id : conflict.team_b_id;
    return window.confirm(
      `${teamName(conflictTeam)} already advanced to ${conflict.round_label} based on the previous result. Changing this will reset that match (and anything it already fed into). Continue?`
    );
  }

  function save() {
    const et = scoreAEt !== "" && scoreBEt !== "" ? { scoreA: Number(scoreAEt), scoreB: Number(scoreBEt) } : undefined;
    const pens = scoreAPens !== "" && scoreBPens !== "" ? { scoreA: Number(scoreAPens), scoreB: Number(scoreBPens) } : undefined;
    const winner = computeWinner();
    if (!confirmCascadeIfNeeded(winner)) return;
    onResult(Number(scoreA), Number(scoreB), undefined, et, pens, true);
  }

  return (
    <tr>
      <td>
        {editingTeams ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <TeamSelect
              value={teamAId} onChange={setTeamAId} teams={teams} winners={winners}
              excludeId={teamBId || undefined} placeholder="Team A" style={{ ...inputStyle, width: 160 }}
            />
            <span className="tc-dim">vs</span>
            <TeamSelect
              value={teamBId} onChange={setTeamBId} teams={teams} winners={winners}
              excludeId={teamAId || undefined} placeholder="TBD / bye" style={{ ...inputStyle, width: 160 }}
            />
            <button
              className="tc-btn primary" disabled={pending || !teamAId} style={{ padding: "5px 8px", fontSize: 11.5 }}
              onClick={() => {
                if (done && !window.confirm(`This match is already decided — changing the teams will undo the result${match.next_match_id ? " and reset anything it already fed into" : ""}. Continue?`)) return;
                onUpdateTeams(teamAId, teamBId || undefined);
                setEditingTeams(false);
              }}
            >
              Save
            </button>
            <button className="tc-btn" disabled={pending} style={{ padding: "5px 8px", fontSize: 11.5 }} onClick={() => setEditingTeams(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>{teamName(match.team_a_id)} <span className="tc-dim">vs</span> {teamName(match.team_b_id)}</div>
            <button
              aria-label="Edit teams" disabled={pending}
              onClick={() => { setTeamAId(match.team_a_id ?? ""); setTeamBId(match.team_b_id ?? ""); setEditingTeams(true); }}
              style={{ background: "none", border: "none", color: "inherit", opacity: 0.5, cursor: "pointer", padding: 2, display: "flex" }}
            >
              <Pencil size={12} />
            </button>
          </div>
        )}
        {match.status === "walkover" && <span className="tc-badge warn">Walkover — {teamName(match.winner_team_id)}</span>}
        {match.status === "completed" && match.team_b_id === null && <span className="tc-badge ok">Bye</span>}
        {match.status === "completed" && match.team_b_id !== null && (
          match.winner_team_id
            ? <span className="tc-badge ok">Won — {teamName(match.winner_team_id)}</span>
            : <span className="tc-badge neutral">Draw</span>
        )}
      </td>
      <td className="tc-dim" style={{ fontSize: 12.5 }}>
        {editingTime ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", maxWidth: 300 }}>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={{ ...inputStyle, width: 130 }} />
            <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} style={{ ...inputStyle, width: 90 }} />
            <input
              value={courtLabel} onChange={(e) => setCourtLabel(e.target.value)} placeholder="Court / ground"
              style={{ ...inputStyle, width: 130 }} aria-label="Court or ground"
            />
            <input
              value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes"
              style={{ ...inputStyle, width: 130 }} aria-label="Match notes"
            />
            <button
              className="tc-btn primary" disabled={pending || !dateStr} style={{ padding: "5px 8px", fontSize: 11.5 }}
              onClick={() => { onSetTime(ktmIso(dateStr, timeStr), null, courtLabel.trim() || undefined, notes.trim() || undefined); setEditingTime(false); }}
            >
              Save
            </button>
            {match.starts_at && (
              <button
                className="tc-btn" disabled={pending} style={{ padding: "5px 8px", fontSize: 11.5 }}
                onClick={() => { onSetTime(null, null, courtLabel.trim() || undefined, notes.trim() || undefined); setEditingTime(false); }}
              >
                Clear time
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setEditingTime(true)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}
          >
            {match.starts_at
              ? new Date(match.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ })
              : <span style={{ textDecoration: "underline dotted" }}>Set date &amp; time</span>}
            {match.court_label && <span className="tc-dim"> · {match.court_label}</span>}
          </button>
        )}
      </td>
      <td className="tc-num">
        {match.status === "completed" && match.score_a !== null && match.score_b !== null ? (
          <>
            {match.score_a} – {match.score_b}
            {match.score_a_pens !== null && match.score_b_pens !== null && (
              <div className="tc-dim" style={{ fontSize: 11, fontWeight: 400 }}>pens {match.score_a_pens}–{match.score_b_pens}</div>
            )}
            {match.score_a_pens === null && match.score_a_et !== null && match.score_b_et !== null && (
              <div className="tc-dim" style={{ fontSize: 11, fontWeight: 400 }}>aet {match.score_a_et}–{match.score_b_et}</div>
            )}
          </>
        ) : "—"}
      </td>
      <td>
        {match.status === "completed" && match.team_a_id && match.team_b_id && match.score_a !== null && match.score_b !== null && (
          <button className="tc-btn" disabled={pending} onClick={onRecordStats} style={{ padding: "6px 10px", marginRight: 6 }}>Player stats</button>
        )}
        <button
          aria-label="Match history" onClick={() => setShowHistory((v) => !v)}
          style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", padding: 6 }}
        >
          <History size={14} />
        </button>
        <button aria-label="Delete match" disabled={pending} onClick={onDelete} style={{ background: "none", border: "none", color: "#ef4444", opacity: 0.7, cursor: "pointer", padding: 6 }}>
          <Trash2 size={14} />
        </button>
        {!done && (
          <select
            value={match.status} disabled={pending} aria-label="Match status"
            onChange={(e) => onSetStatus(e.target.value as SettableStatus)}
            style={{ ...inputStyle, padding: "5px 6px", fontSize: 11.5, marginLeft: 4 }}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
        {showHistory && <MatchHistoryPanel matchId={match.id} />}
        {match.status === "cancelled" || match.team_b_id === null ? null : !bothSet ? (
          <span className="tc-dim" style={{ fontSize: 12 }}>Waiting for teams</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_a_id)}</span>
                <input
                  type="number" placeholder="0" value={scoreA} onChange={(e) => setScoreA(e.target.value)}
                  style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_a_id)} score`}
                />
              </label>
              <span className="tc-dim" style={{ alignSelf: "flex-end", marginBottom: 8 }}>–</span>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_b_id)}</span>
                <input
                  type="number" placeholder="0" value={scoreB} onChange={(e) => setScoreB(e.target.value)}
                  style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_b_id)} score`}
                />
              </label>
              {!showEt && (
                <button
                  className="tc-btn primary" disabled={pending || !canSave} style={{ padding: "6px 10px", alignSelf: "flex-end" }}
                  onClick={save}
                >
                  {done ? "Update score" : "Save score"}
                </button>
              )}
            </div>

            {showEt && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tc-dim" style={{ fontSize: 11, width: "100%" }}>Level after regulation — extra time score:</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_a_id)} (ET)</span>
                  <input
                    type="number" placeholder="0" value={scoreAEt} onChange={(e) => setScoreAEt(e.target.value)}
                    style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_a_id)} extra time score`}
                  />
                </label>
                <span className="tc-dim" style={{ alignSelf: "flex-end", marginBottom: 8 }}>–</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_b_id)} (ET)</span>
                  <input
                    type="number" placeholder="0" value={scoreBEt} onChange={(e) => setScoreBEt(e.target.value)}
                    style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_b_id)} extra time score`}
                  />
                </label>
                {!showPens && (
                  <button className="tc-btn primary" disabled={pending || !canSave} style={{ padding: "6px 10px", alignSelf: "flex-end" }} onClick={save}>
                    {done ? "Update score" : "Save score"}
                  </button>
                )}
              </div>
            )}

            {showPens && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tc-dim" style={{ fontSize: 11, width: "100%" }}>Still level — penalty shootout score:</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_a_id)} (pens)</span>
                  <input
                    type="number" placeholder="0" value={scoreAPens} onChange={(e) => setScoreAPens(e.target.value)}
                    style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_a_id)} penalty score`}
                  />
                </label>
                <span className="tc-dim" style={{ alignSelf: "flex-end", marginBottom: 8 }}>–</span>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tc-dim" style={{ fontSize: 10.5 }}>{teamName(match.team_b_id)} (pens)</span>
                  <input
                    type="number" placeholder="0" value={scoreBPens} onChange={(e) => setScoreBPens(e.target.value)}
                    style={{ ...inputStyle, width: 50 }} aria-label={`${teamName(match.team_b_id)} penalty score`}
                  />
                </label>
                <button className="tc-btn primary" disabled={pending || !canSave} style={{ padding: "6px 10px", alignSelf: "flex-end" }} onClick={save}>
                  {done ? "Update score" : "Save score"}
                </button>
              </div>
            )}

            {match.team_a_id && match.team_b_id && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tc-dim" style={{ fontSize: 11 }}>Or record a walkover:</span>
                <button
                  className="tc-btn" disabled={pending} style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    if (!window.confirm(`Record a walkover win for ${teamName(match.team_a_id)}? No score is recorded and this can't be undone.`)) return;
                    if (!confirmCascadeIfNeeded(match.team_a_id)) return;
                    onResult(null, null, match.team_a_id!, undefined, undefined, true);
                  }}
                >
                  {teamName(match.team_a_id)} wins
                </button>
                <button
                  className="tc-btn" disabled={pending} style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    if (!window.confirm(`Record a walkover win for ${teamName(match.team_b_id)}? No score is recorded and this can't be undone.`)) return;
                    if (!confirmCascadeIfNeeded(match.team_b_id)) return;
                    onResult(null, null, match.team_b_id!, undefined, undefined, true);
                  }}
                >
                  {teamName(match.team_b_id)} wins
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

type RosterPlayer = { id: string; user_id: string | null; guest_name: string | null; name: string; team: "a" | "b" };

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");

function MatchPlayerStatsModal({
  match, teamName, yellowCardFine, redCardFine, onClose, onSaved,
}: {
  match: TournamentMatch;
  teamName: (id: string | null) => string;
  yellowCardFine: number;
  redCardFine: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [teamTab, setTeamTab] = useState<"a" | "b">("a");
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [assists, setAssists] = useState<Record<string, string>>({});
  const [yellows, setYellows] = useState<Record<string, string>>({});
  const [reds, setReds] = useState<Record<string, boolean>>({});
  const [mom, setMom] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trackingFines = yellowCardFine > 0 || redCardFine > 0;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      match.team_a_id ? getTeamRoster(match.team_a_id) : Promise.resolve([]),
      match.team_b_id ? getTeamRoster(match.team_b_id) : Promise.resolve([]),
      getMatchPlayerStats(match.id),
    ]).then(([a, b, stats]) => {
      if (cancelled) return;
      const rosterA = (isActionError(a) ? [] : a).map((p) => ({ ...p, team: "a" as const }));
      const rosterB = (isActionError(b) ? [] : b).map((p) => ({ ...p, team: "b" as const }));
      setRoster([...rosterA, ...rosterB]);
      if (!isActionError(stats)) {
        const g: Record<string, string> = {};
        const asst: Record<string, string> = {};
        const y: Record<string, string> = {};
        const r: Record<string, boolean> = {};
        let m: string | null = null;
        for (const s of stats as TournamentMatchPlayerStat[]) {
          g[s.team_player_id] = String(s.goals);
          asst[s.team_player_id] = String(s.assists);
          y[s.team_player_id] = String(s.yellow_cards);
          r[s.team_player_id] = s.red_card;
          if (s.is_mom) m = s.team_player_id;
        }
        setGoals(g);
        setAssists(asst);
        setYellows(y);
        setReds(r);
        setMom(m);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [match.id, match.team_a_id, match.team_b_id]);

  function fineFor(p: RosterPlayer) {
    const y = Math.min(Number(yellows[p.id]) || 0, 2);
    return y * yellowCardFine + (reds[p.id] ? redCardFine : 0);
  }
  const totalFine = roster.reduce((sum, p) => sum + fineFor(p), 0);

  function submit() {
    setErr(null);
    startTransition(async () => {
      const stats = roster.map((p) => ({
        team_player_id: p.id,
        goals: Number(goals[p.id]) || 0,
        assists: Number(assists[p.id]) || 0,
        is_mom: p.id === mom,
        yellow_cards: Math.min(Number(yellows[p.id]) || 0, 2),
        red_card: !!reds[p.id],
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
          <div style={{ overflowX: "auto" }}>
            {match.team_a_id && match.team_b_id && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button
                  className={`tc-btn ${teamTab === "a" ? "primary" : ""}`} style={{ padding: "7px 12px", fontSize: 12.5 }}
                  onClick={() => setTeamTab("a")}
                >
                  {teamName(match.team_a_id)} <span style={{ opacity: 0.7, marginLeft: 4 }}>{roster.filter((p) => p.team === "a").length}</span>
                </button>
                <button
                  className={`tc-btn ${teamTab === "b" ? "primary" : ""}`} style={{ padding: "7px 12px", fontSize: 12.5 }}
                  onClick={() => setTeamTab("b")}
                >
                  {teamName(match.team_b_id)} <span style={{ opacity: 0.7, marginLeft: 4 }}>{roster.filter((p) => p.team === "b").length}</span>
                </button>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: `1.4fr 55px 55px 55px 45px 45px${trackingFines ? " 70px" : ""}`, gap: 8, fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6, minWidth: 470 }}>
              <div>Player</div><div>Goals</div><div>Assists</div><div>Yellow</div><div>Red</div><div>MOM</div>{trackingFines && <div>Fine</div>}
            </div>
            {roster.filter((p) => !match.team_b_id || p.team === teamTab).map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: `1.4fr 55px 55px 55px 45px 45px${trackingFines ? " 70px" : ""}`, gap: 8, alignItems: "center", padding: "6px 0", minWidth: 470 }}>
                <div style={{ fontSize: 13.5 }}>{p.name}</div>
                <input
                  type="number" min={0} value={goals[p.id] ?? ""}
                  onChange={(e) => setGoals((g) => ({ ...g, [p.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 50 }} aria-label={`${p.name} goals`}
                />
                <input
                  type="number" min={0} value={assists[p.id] ?? ""}
                  onChange={(e) => setAssists((a) => ({ ...a, [p.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 50 }} aria-label={`${p.name} assists`}
                />
                <input
                  type="number" min={0} max={2} value={yellows[p.id] ?? ""}
                  onChange={(e) => setYellows((y) => ({ ...y, [p.id]: e.target.value }))}
                  style={{ ...inputStyle, width: 45 }} aria-label={`${p.name} yellow cards`}
                />
                <input
                  type="checkbox" checked={!!reds[p.id]} onChange={(e) => setReds((r) => ({ ...r, [p.id]: e.target.checked }))}
                  style={{ justifySelf: "start", width: 18, height: 18 }} aria-label={`${p.name} red card`}
                />
                <input
                  type="radio" name="mom" checked={mom === p.id} onChange={() => setMom(p.id)}
                  style={{ justifySelf: "start", width: 18, height: 18 }} aria-label={`${p.name} is man of the match`}
                />
                {trackingFines && <div className="tc-num" style={{ fontSize: 12.5 }}>{fineFor(p) > 0 ? money(fineFor(p)) : "—"}</div>}
              </div>
            ))}
            {trackingFines && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, fontSize: 13, fontWeight: 700 }}>
                Total fines: {money(totalFine)}
              </div>
            )}
          </div>
        )}

        {err && <div className="tc-err" style={{ marginTop: 14 }}>{err}</div>}
        <button className="tc-btn primary" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} disabled={pending || loading} onClick={submit}>
          {pending ? "Saving…" : "Save stats"}
        </button>
      </div>
    </div>
  );
}

function summarizeAudit(e: MatchAuditEntry): string {
  const nv = e.new_value as Record<string, unknown> | null;
  if (e.change_type === "created") return "Match created";
  if (e.change_type === "schedule") {
    const startsAt = nv?.starts_at as string | null | undefined;
    return startsAt
      ? `Scheduled for ${new Date(startsAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ })}`
      : "Schedule cleared";
  }
  if (e.change_type === "result") {
    if (nv?.status === "walkover") return "Walkover recorded";
    return `Score set to ${nv?.score_a}–${nv?.score_b}`;
  }
  if (e.change_type === "teams") return "Teams changed";
  return e.change_type;
}

function MatchHistoryPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<(MatchAuditEntry & { changed_by_name: string })[]>([]);

  useEffect(() => {
    let cancelled = false;
    getMatchAudit(matchId).then((res) => {
      if (cancelled) return;
      if (!isActionError(res)) setEntries(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [matchId]);

  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: "rgba(128,128,128,0.08)", fontSize: 12 }}>
      {loading ? (
        <span className="tc-dim">Loading history…</span>
      ) : entries.length === 0 ? (
        <span className="tc-dim">No changes recorded yet.</span>
      ) : (
        entries.map((e) => (
          <div key={e.id} style={{ padding: "4px 0" }}>
            <span className="tc-dim">
              {new Date(e.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ })}
            </span>
            {" — "}{summarizeAudit(e)}{" "}
            <span className="tc-dim">by {e.changed_by_name}</span>
          </div>
        ))
      )}
    </div>
  );
}
