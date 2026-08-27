"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Table2, GitBranch, CalendarDays, BarChart3, Users, X, Star, Trophy, Medal, ChevronRight, LogIn, Phone,
} from "lucide-react";
import { getTeamRosterPublic } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  FORMAT_LABELS,
  type Tournament, type TournamentTeam, type TournamentMatch,
  type TournamentStanding, type TournamentPlayerStatRow, type TournamentAwards,
} from "@/lib/tournaments/types";
import "./event-tabs.css";

const KTM = "Asia/Kathmandu";
const NOT_FOR_SINGLE_EVENT = new Set(["Table", "Knockout", "Fixtures", "Player Stats"]);
const TABS = ["Overview", "Table", "Knockout", "Fixtures", "Player Stats", "Teams"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, ComponentType<{ size?: number }>> = {
  Overview: LayoutGrid, Table: Table2, Knockout: GitBranch, Fixtures: CalendarDays,
  "Player Stats": BarChart3, Teams: Users,
};

function statusInfo(status: Tournament["status"]): { label: string; cls: string } {
  if (status === "live") return { label: "Ongoing", cls: "ongoing" };
  if (status === "completed") return { label: "Completed", cls: "completed" };
  if (status === "cancelled") return { label: "Cancelled", cls: "cancelled" };
  return { label: "Upcoming", cls: "upcoming" };
}

export default function EventTabs({
  tournament, teams, matches, standingsByGroup, playerStats, awards,
}: {
  tournament: Tournament;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  standingsByGroup: Record<string, TournamentStanding[]>;
  playerStats: TournamentPlayerStatRow[];
  awards: TournamentAwards;
}) {
  const confirmedTeams = teams.filter((t) => t.status === "confirmed");
  const hasKnockout = matches.some((m) => m.stage === "knockout");
  const hasStandings = tournament.format === "league" || tournament.format === "group_knockout";
  const isSingleEvent = tournament.format === "single_event";

  const visibleTabs = TABS.filter((t) => {
    if (isSingleEvent && NOT_FOR_SINGLE_EVENT.has(t)) return false;
    if (t === "Table" && !hasStandings) return false;
    if (t === "Knockout" && !hasKnockout) return false;
    return true;
  });
  const [tab, setTab] = useState<Tab>("Overview");
  const activeTab = visibleTabs.includes(tab) ? tab : "Overview";

  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});
  const barRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, visibleTabs.length]);

  // A quick nudge-and-settle on first load — the clearest possible
  // signal that this row scrolls, so "only 3 tabs" is never the
  // takeaway when there are really 5 or 6.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const overflowing = bar.scrollWidth - bar.clientWidth > 4;
    setHasOverflow(overflowing);
    if (!overflowing) return;
    bar.scrollTo({ left: 36, behavior: "smooth" });
    const t = setTimeout(() => bar.scrollTo({ left: 0, behavior: "smooth" }), 480);
    return () => clearTimeout(t);
  }, [visibleTabs.length]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const onScroll = () => setHasOverflow(bar.scrollWidth - bar.scrollLeft - bar.clientWidth > 4);
    const onResize = () => {
      onScroll();
      const el = tabRefs.current[activeTab];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    bar.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      bar.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [activeTab]);

  return (
    <div>
      <div className="ev2-tabbar-wrap">
        <div className="ev2-tabbar" ref={barRef}>
          {indicator && <div className="ev2-tab-indicator" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />}
          {visibleTabs.map((t) => {
            const Icon = TAB_ICON[t];
            return (
              <button
                key={t} ref={(el) => { if (el) tabRefs.current[t] = el; }}
                className={`ev2-tab ${activeTab === t ? "on" : ""}`} onClick={() => setTab(t)}
              >
                <Icon size={15} /> {t}
              </button>
            );
          })}
        </div>
        {hasOverflow && (
          <div className="ev2-tabbar-fade" aria-hidden="true">
            <ChevronRight size={14} className="ev2-tabbar-more-icon" />
          </div>
        )}
      </div>

      {activeTab === "Overview" && (
        <OverviewTab tournament={tournament} teams={teams} matches={matches} awards={awards} />
      )}
      {activeTab === "Table" && <TableTab tournament={tournament} standingsByGroup={standingsByGroup} />}
      {activeTab === "Knockout" && <KnockoutTab matches={matches} teamName={(id) => teams.find((t) => t.id === id)?.name ?? "Unknown"} />}
      {activeTab === "Fixtures" && <FixturesPublicTab matches={matches} teamName={(id) => teams.find((t) => t.id === id)?.name ?? "Unknown"} />}
      {activeTab === "Player Stats" && <PlayerStatsTab rows={playerStats} />}
      {activeTab === "Teams" && <TeamsTab teams={confirmedTeams} />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────
function OverviewTab({ tournament, teams, matches, awards }: {
  tournament: Tournament; teams: TournamentTeam[]; matches: TournamentMatch[]; awards: TournamentAwards;
}) {
  const confirmed = teams.filter((t) => t.status === "confirmed");
  const groups = [...new Set(teams.map((t) => t.group_name).filter((g): g is string => !!g))].sort();
  const st = statusInfo(tournament.status);
  const hasAwards = awards.winner || awards.runnerUp || awards.semifinalists.length > 0;

  return (
    <div>
      <div className="ev2-stats">
        <div className="ev2-stat"><div className="ev2-stat-v">{confirmed.length}</div><div className="ev2-stat-l">Teams</div></div>
        <div className="ev2-stat"><div className="ev2-stat-v">{matches.length}</div><div className="ev2-stat-l">Matches</div></div>
        {groups.length > 0 && <div className="ev2-stat"><div className="ev2-stat-v">{groups.length}</div><div className="ev2-stat-l">Groups</div></div>}
        <div className="ev2-stat"><div className="ev2-stat-v" style={{ fontSize: 15 }}>{FORMAT_LABELS[tournament.format]}</div><div className="ev2-stat-l">Format</div></div>
      </div>

      <div className="ev2-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tournament.description ? 14 : 0 }}>
          <div className="ev2-card-t" style={{ marginBottom: 0 }}>Tournament</div>
          <span className={`ev2-status-pill ${st.cls}`}>{st.label}</span>
        </div>
        {tournament.description && <p style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.65, margin: 0 }}>{tournament.description}</p>}
        {tournament.organizer_name && (
          <div style={{ marginTop: 14, fontSize: 12.5, opacity: 0.6 }}>Organised by <b style={{ opacity: 1 }}>{tournament.organizer_name}</b></div>
        )}
      </div>

      {hasAwards && (
        <div className="ev2-card">
          <div className="ev2-card-t">Awards</div>
          <div className="ev2-awards">
            {awards.winner && (
              <div className="ev2-award">
                <Trophy size={20} color="#ffc107" style={{ marginBottom: 8 }} />
                <div className="ev2-award-l">Winner</div>
                <div className="ev2-award-v">{awards.winner}</div>
              </div>
            )}
            {awards.runnerUp && (
              <div className="ev2-award silver">
                <Medal size={20} color="#b0b0b0" style={{ marginBottom: 8 }} />
                <div className="ev2-award-l">Runner-up</div>
                <div className="ev2-award-v">{awards.runnerUp}</div>
              </div>
            )}
            {awards.semifinalists.map((name) => (
              <div className="ev2-award bronze" key={name}>
                <Medal size={20} color="#b47846" style={{ marginBottom: 8 }} />
                <div className="ev2-award-l">Semi-finalist</div>
                <div className="ev2-award-v">{name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────
function TableTab({ tournament, standingsByGroup }: { tournament: Tournament; standingsByGroup: Record<string, TournamentStanding[]> }) {
  const groups = Object.keys(standingsByGroup).sort();
  if (groups.length === 0 || groups.every((g) => standingsByGroup[g].length === 0)) {
    return <div className="ev2-empty">No results yet.</div>;
  }
  return (
    <div>
      {groups.map((g) => {
        const rows = standingsByGroup[g];
        if (rows.length === 0) return null;
        return (
          <div key={g} className="ev2-card">
            {tournament.format === "group_knockout" && <div className="ev2-card-t">Group {g}</div>}
            <div style={{ overflowX: "auto" }}>
              <table className="ev2-table">
                <thead>
                  <tr>
                    <th>#</th><th>Team</th><th className="num">P</th><th className="num">W</th><th className="num">D</th>
                    <th className="num">L</th><th className="num">GF</th><th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.team_id} className={i < 2 ? "top3" : ""}>
                      <td className="num"><span className="ev2-rank">{i + 1}</span></td>
                      <td style={{ fontWeight: 700 }}>{r.team_name}</td>
                      <td className="num">{r.played}</td>
                      <td className="num">{r.won}</td>
                      <td className="num">{r.drawn}</td>
                      <td className="num">{r.lost}</td>
                      <td className="num">{r.goals_for}</td>
                      <td className="num">{r.goals_against}</td>
                      <td className="num">{r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}</td>
                      <td className="num" style={{ fontWeight: 800 }}>{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Knockout — geometry-precise connector-line bracket ────────────
const MATCH_H = 108;
const SLOT_GAP = 22;

// "Quarterfinal" -> "QF", "Round of 16" -> "R16", anything unrecognised
// falls back to initials — a per-card label distinguishing matches
// within the same round, on top of the round's own column header.
function roundShortCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("final") && !l.includes("semi") && !l.includes("quarter")) return "F";
  if (l.includes("semi")) return "SF";
  if (l.includes("quarter")) return "QF";
  const roundOf = l.match(/round of\s*(\d+)/);
  if (roundOf) return `R${roundOf[1]}`;
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

function matchStatusPill(m: TournamentMatch): { label: string; cls: string; live?: boolean } | null {
  if (m.status === "live") return { label: "Live", cls: "live", live: true };
  if (m.status === "scheduled") return { label: "Scheduled", cls: "scheduled" };
  if (m.status === "postponed") return { label: "Postponed", cls: "postponed" };
  if (m.status === "cancelled") return { label: "Cancelled", cls: "cancelled" };
  return null;
}

function matchWhen(m: TournamentMatch): string {
  const when = m.starts_at
    ? new Date(m.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM })
    : "Date TBD";
  return m.court_label ? `${when} · ${m.court_label}` : when;
}

// Matches are now added by hand (no auto-generated pairing tree), so
// there's no guaranteed relationship between a round's matches and
// specific matches in the round before it — round 2 might not even
// have exactly half of round 1's count. Rather than draw connector
// lines that assume a strict binary tree (and misalign the moment
// that assumption doesn't hold), each round is its own independently
// centered column; a plain chevron between columns shows the flow
// left-to-right without claiming a precision the data can't back up.
const KO_DONE = new Set(["completed", "walkover", "cancelled"]);

function matchCode(ms: TournamentMatch[], i: number): string {
  return ms.length > 1 ? `${roundShortCode(ms[i].round_label)}${i + 1}` : roundShortCode(ms[i].round_label);
}

function KnockoutTab({ matches, teamName }: { matches: TournamentMatch[]; teamName: (id: string | null) => string }) {
  const [selected, setSelected] = useState<TournamentMatch | null>(null);
  const knockout = [...matches].filter((m) => m.stage === "knockout").sort((a, b) => a.created_at.localeCompare(b.created_at));

  const rounds = [...new Set(knockout.map((m) => m.round))].sort((a, b) => a - b);
  const byRound = rounds.map((r) => knockout.filter((m) => m.round === r));
  const maxCount = byRound.length ? Math.max(...byRound.map((ms) => ms.length)) : 0;
  const columnHeight = maxCount * MATCH_H + (maxCount - 1) * SLOT_GAP;

  // Land on whichever round still has something undecided (the round
  // you'd actually want to check), not always round 1 — falls back to
  // the last round once everything's finished.
  const [activeRound, setActiveRound] = useState(() => {
    const i = byRound.findIndex((ms) => ms.some((m) => !KO_DONE.has(m.status)));
    return i === -1 ? byRound.length - 1 : i;
  });

  if (knockout.length === 0) return <div className="ev2-empty">No knockout matches added yet.</div>;
  const safeActiveRound = Math.min(Math.max(activeRound, 0), byRound.length - 1);

  return (
    <div>
      {/* Phone: tap between rounds instead of having to discover them
          by swiping sideways. */}
      <div className="ev2-bracket-mobile">
        <div className="ev2-bracket-round-chips">
          {byRound.map((ms, r) => (
            <button key={r} className={`ev2-bracket-chip ${r === safeActiveRound ? "on" : ""}`} onClick={() => setActiveRound(r)}>
              {ms[0]?.round_label}
            </button>
          ))}
        </div>
        <div className="ev2-bracket-mobile-list">
          {byRound[safeActiveRound].map((m, i) => (
            <BracketMatchCard key={m.id} match={m} teamName={teamName} code={matchCode(byRound[safeActiveRound], i)} onClick={() => setSelected(m)} />
          ))}
        </div>
      </div>

      {/* Desktop / wide screens: the full bracket, all rounds at once. */}
      <div className="ev2-bracket-wrap ev2-bracket-desktop">
        <div className="ev2-bracket">
          {byRound.map((ms, r) => (
            <div key={r} style={{ display: "flex", alignItems: "center" }}>
              {r > 0 && <ChevronRight className="ev2-bracket-arrow" size={18} />}
              <div className="ev2-bracket-round">
                <div className="ev2-bracket-round-label">{ms[0]?.round_label}</div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: SLOT_GAP, minHeight: columnHeight }}>
                  {ms.map((m, i) => (
                    <BracketMatchCard key={m.id} match={m} teamName={teamName} code={matchCode(ms, i)} onClick={() => setSelected(m)} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && <MatchDetailModal match={selected} teamName={teamName} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BracketMatchCard({ match: m, code, teamName, onClick }: {
  match: TournamentMatch; code: string; teamName: (id: string | null) => string; onClick: () => void;
}) {
  const pill = matchStatusPill(m);
  return (
    <button type="button" className={`ev2-bracket-match ${m.round_label === "Final" ? "final" : ""}`} style={{ minHeight: MATCH_H }} onClick={onClick}>
      <div className="ev2-bracket-match-head">
        <span className="ev2-bracket-code">{code}</span>
        {pill && <span className={`ev2-bracket-pill ${pill.cls}`}>{pill.live && <i className="ev2-live-dot" />}{pill.label}</span>}
        {m.status === "walkover" && <span className="ev2-bracket-pill walkover">Walkover</span>}
      </div>
      <BracketSlot name={m.team_a_id ? teamName(m.team_a_id) : "TBD"} winner={m.winner_team_id != null && m.winner_team_id === m.team_a_id} score={m.score_a} />
      <BracketSlot name={m.team_b_id ? teamName(m.team_b_id) : m.status === "completed" ? "Bye" : "TBD"} winner={m.winner_team_id != null && m.winner_team_id === m.team_b_id} score={m.score_b} />
      <div className="ev2-bracket-meta">{matchWhen(m)}</div>
    </button>
  );
}

// No team crest/logo upload exists yet — an initial-letter avatar
// (same visual language used for players/hosts elsewhere) stands in
// for one, rather than leaving the bracket as bare text rows.
function BracketSlot({ name, winner, score }: { name: string; winner: boolean; score: number | null }) {
  const tbd = name === "TBD" || name === "Bye";
  return (
    <div className={`ev2-bracket-slot ${winner ? "winner" : ""} ${tbd ? "tbd" : ""}`}>
      <span className="ev2-bracket-team">
        <span className="ev2-bracket-av">{tbd ? "?" : name.charAt(0).toUpperCase()}</span>
        <span className="ev2-bracket-name">{name}</span>
      </span>
      {score != null && <span className="ev2-bracket-score">{score}</span>}
    </div>
  );
}

function MatchDetailModal({ match: m, teamName, onClose }: {
  match: TournamentMatch; teamName: (id: string | null) => string; onClose: () => void;
}) {
  const pill = matchStatusPill(m);
  return (
    <div className="ev2-scrim" onClick={onClose}>
      <div className="ev2-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div className="ev2-bracket-round-label" style={{ marginBottom: 4, textAlign: "left" }}>{m.round_label}</div>
            {pill && <span className={`ev2-bracket-pill ${pill.cls}`}>{pill.live && <i className="ev2-live-dot" />}{pill.label}</span>}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>

        <div style={{ marginTop: 12, border: "1px solid rgba(242,237,230,0.1)", borderRadius: 12, overflow: "hidden" }}>
          <BracketSlot name={m.team_a_id ? teamName(m.team_a_id) : "TBD"} winner={m.winner_team_id != null && m.winner_team_id === m.team_a_id} score={m.score_a} />
          <BracketSlot name={m.team_b_id ? teamName(m.team_b_id) : m.status === "completed" ? "Bye" : "TBD"} winner={m.winner_team_id != null && m.winner_team_id === m.team_b_id} score={m.score_b} />
        </div>

        {m.status === "walkover" && (
          <div className="ev2-empty" style={{ padding: "10px 0 0", textAlign: "left" }}>Walkover — {teamName(m.winner_team_id)}</div>
        )}
        {(m.score_a_et != null && m.score_b_et != null) && (
          <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 8 }}>Extra time: {m.score_a_et} – {m.score_b_et}</div>
        )}
        {(m.score_a_pens != null && m.score_b_pens != null) && (
          <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 4 }}>Penalties: {m.score_a_pens} – {m.score_b_pens}</div>
        )}

        <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 14 }}>{matchWhen(m)}</div>
        {m.notes && <div style={{ opacity: 0.65, fontSize: 12.5, marginTop: 6 }}>{m.notes}</div>}
      </div>
    </div>
  );
}

// ── Fixtures (public, read-only, by date) ──────────────────────────
function FixturesPublicTab({ matches, teamName }: { matches: TournamentMatch[]; teamName: (id: string | null) => string }) {
  if (matches.length === 0) return <div className="ev2-empty">Fixtures haven&apos;t been generated yet.</div>;

  const sorted = [...matches].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return a.created_at.localeCompare(b.created_at);
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return a.starts_at.localeCompare(b.starts_at);
  });

  const groups = new Map<string, TournamentMatch[]>();
  for (const m of sorted) {
    const key = m.starts_at
      ? new Date(m.starts_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM })
      : "Date to be announced";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return (
    <div className="ev2-card">
      {[...groups.entries()].map(([date, ms]) => (
        <div key={date}>
          <div className="ev2-fixture-date">{date}</div>
          {ms.map((m) => (
            <div key={m.id} className="ev2-fixture">
              <div className="ev2-fixture-time">
                {m.starts_at ? new Date(m.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM }) : "TBD"}
              </div>
              <div className="ev2-fixture-teams">
                <span>{m.team_a_id ? teamName(m.team_a_id) : "TBD"}</span>
                {m.status === "walkover" ? (
                  <span className="score">w/o</span>
                ) : m.status === "completed" && m.score_a !== null && m.score_b !== null ? (
                  <span className="score">{m.score_a} – {m.score_b}</span>
                ) : <span style={{ opacity: 0.4 }}>vs</span>}
                <span>{m.team_b_id ? teamName(m.team_b_id) : m.status === "completed" ? "Bye" : "TBD"}</span>
              </div>
              <div className="ev2-fixture-round">{m.round_label}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Player stats leaderboard ────────────────────────────────────
function PlayerStatsTab({ rows }: { rows: TournamentPlayerStatRow[] }) {
  if (rows.length === 0) return <div className="ev2-empty">No player stats recorded yet.</div>;
  return (
    <div className="ev2-card">
      <div style={{ overflowX: "auto" }}>
        <table className="ev2-table">
          <thead>
            <tr>
              <th>#</th><th>Player</th><th>Team</th>
              <th className="num">G</th><th className="num">A</th><th className="num">Y</th><th className="num">R</th><th className="num">MOM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team_player_id}>
                <td className="num"><span className="ev2-rank">{i + 1}</span></td>
                <td style={{ fontWeight: 700 }}>{r.player_name}</td>
                <td style={{ opacity: 0.65 }}>{r.team_name}</td>
                <td className="num" style={{ fontWeight: 800 }}>{r.goals}</td>
                <td className="num">{r.assists}</td>
                <td className="num">{r.yellow_cards > 0 ? <span style={{ color: "#d97706" }}>{r.yellow_cards}</span> : "—"}</td>
                <td className="num">{r.red_cards > 0 ? <span style={{ color: "#ef4444" }}>{r.red_cards}</span> : "—"}</td>
                <td className="num">{r.mom_count > 0 ? <span className="ev2-mom-star">{"★".repeat(Math.min(r.mom_count, 3))}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Teams + squad viewer ────────────────────────────────────────
type RosterPlayer = { id: string; role: string; name: string; is_linked: boolean };

function TeamsTab({ teams }: { teams: TournamentTeam[] }) {
  const [open, setOpen] = useState<TournamentTeam | null>(null);
  if (teams.length === 0) return <div className="ev2-empty">No confirmed teams yet.</div>;

  return (
    <div>
      <div className="ev2-team-grid">
        {teams.map((t) => (
          <button key={t.id} className="ev2-team-card" onClick={() => setOpen(t)}>
            <div className="ev2-team-card-name">{t.name}</div>
            {t.manager_name && (
              <div className="ev2-team-card-sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={11} /> {t.manager_name}{t.manager_phone ? ` · ${t.manager_phone}` : ""}
              </div>
            )}
            <div className="ev2-team-card-sub">Tap to view squad</div>
          </button>
        ))}
      </div>
      {open && <SquadModal team={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SquadModal({ team, onClose }: { team: TournamentTeam; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const { user } = useProfile();
  const pathname = usePathname();
  const hasUnlinked = roster.some((p) => !p.is_linked);

  useEffect(() => {
    let cancelled = false;
    getTeamRosterPublic(team.id).then((res) => {
      if (cancelled) return;
      if (!isActionError(res)) setRoster(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [team.id]);

  return (
    <div className="ev2-scrim" onClick={onClose}>
      <div className="ev2-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800 }}>{team.name}</h3>
            {team.manager_name && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, opacity: 0.65, marginTop: 4 }}>
                <Phone size={12} /> {team.manager_name}{team.manager_phone ? ` · ${team.manager_phone}` : ""}
              </div>
            )}
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0 }}><X size={18} /></button>
        </div>
        {loading ? (
          <div className="ev2-empty">Loading squad…</div>
        ) : roster.length === 0 ? (
          <div className="ev2-empty">No roster on file yet.</div>
        ) : (
          <>
            {roster.map((p) => (
              <div key={p.id} className="ev2-squad-row">
                <span className="ev2-squad-av">{p.name.charAt(0).toUpperCase()}</span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{p.name}</span>
                {p.role === "captain" && <Star size={13} style={{ opacity: 0.6 }} />}
                {p.role === "substitute" && <span style={{ fontSize: 11, opacity: 0.5 }}>Sub</span>}
                {!p.is_linked && !user && (
                  <span style={{ fontSize: 10.5, opacity: 0.5, fontStyle: "italic" }}>Not linked</span>
                )}
              </div>
            ))}
            {hasUnlinked && !user && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(242,237,230,0.1)" }}>
                <p style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
                  Played on this team but registered without an account? Sign in with the same email or phone you
                  registered with — Sportonica links your stats to your player card automatically.
                </p>
                <Link
                  href={`/login?redirect=${encodeURIComponent(pathname)}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#00875a", textDecoration: "none" }}
                >
                  <LogIn size={14} /> Sign in to claim your stats
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
