"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Table2, GitBranch, CalendarDays, BarChart3, Users, X, Star, ChevronRight, LogIn, Phone, ClipboardList,
} from "lucide-react";
import { getTeamRosterPublic } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  FORMAT_LABELS,
  type Tournament, type TournamentTeam, type TournamentMatch,
  type TournamentStanding, type TournamentPlayerStatRow, type TournamentAwards,
} from "@/lib/tournaments/types";
import TournamentRegisterTab from "./TournamentRegisterTab";
import DayFixturesShareButton from "./DayFixturesShareButton";
import "./event-tabs.css";

const KTM = "Asia/Kathmandu";
const NOT_FOR_SINGLE_EVENT = new Set(["Table", "Knockout", "Fixtures", "Player Stats"]);
const TABS = ["Overview", "Register", "Table", "Knockout", "Fixtures", "Player Stats", "Teams"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, ComponentType<{ size?: number }>> = {
  Overview: LayoutGrid, Register: ClipboardList, Table: Table2, Knockout: GitBranch, Fixtures: CalendarDays,
  "Player Stats": BarChart3, Teams: Users,
};

const tabSlug = (t: Tab) => t.toLowerCase().replace(/\s+/g, "-");
// Accepts "register", "player-stats", "playerstats", "Teams", … from a
// shared/QR link and maps it to a real tab (case- and separator-insensitive).
function tabFromParam(raw: string | null | undefined): Tab | null {
  if (!raw) return null;
  const norm = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return TABS.find((t) => t.toLowerCase().replace(/[\s_-]+/g, "") === norm) ?? null;
}

function statusInfo(status: Tournament["status"]): { label: string; cls: string } {
  if (status === "live") return { label: "Ongoing", cls: "ongoing" };
  if (status === "completed") return { label: "Completed", cls: "completed" };
  if (status === "cancelled") return { label: "Cancelled", cls: "cancelled" };
  return { label: "Upcoming", cls: "upcoming" };
}

export default function EventTabs({
  tournament, teams, matches, standingsByGroup, playerStats, awards, myTeam, loggedIn, initialTab,
}: {
  tournament: Tournament;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  standingsByGroup: Record<string, TournamentStanding[]>;
  playerStats: TournamentPlayerStatRow[];
  awards: TournamentAwards;
  myTeam: TournamentTeam | null;
  loggedIn: boolean;
  // ?tab= from the URL (e.g. a "register straight away" QR / share link),
  // resolved server-side and passed down so the first paint is right.
  initialTab?: string;
}) {
  const confirmedTeams = teams.filter((t) => t.status === "confirmed");
  const hasKnockout = matches.some((m) => m.stage === "knockout");
  const hasStandings = tournament.format === "league" || tournament.format === "group_knockout";
  const isSingleEvent = tournament.format === "single_event";
  // Hide the Register tab once the tournament is well underway with no
  // team of your own to manage — nothing to do there.
  const showRegister =
    !!myTeam ||
    ["published", "registration_open", "registration_closed"].includes(tournament.status);

  const visibleTabs = TABS.filter((t) => {
    if (isSingleEvent && NOT_FOR_SINGLE_EVENT.has(t)) return false;
    if (t === "Table" && !hasStandings) return false;
    if (t === "Knockout" && !hasKnockout) return false;
    if (t === "Register" && !showRegister) return false;
    return true;
  });
  // Always hydrate starting on Overview, then flip to the deep-linked tab
  // (?tab=register from a QR/share link) in an effect once the client is
  // interactive, instead of starting there directly. Next's streaming SSR
  // resolves this page's dynamic content through a Suspense boundary and
  // swaps it into the DOM via an inline script before the hydration
  // bundle is guaranteed to have run — a real, timing-dependent race. For
  // Overview that swap is harmless (nothing but static markup depends on
  // it), but a non-Overview initial tab occasionally lost that race and
  // never became interactive: no click handlers, no effects, permanently
  // stuck on the SSR fallback text. Overview has never reproduced that;
  // this trades one tab-switch's worth of flash for reliably ending up
  // interactive.
  const [tab, setTab] = useState<Tab>("Overview");
  useEffect(() => {
    const t = tabFromParam(initialTab);
    if (t) setTab(t);
    // Only ever apply the URL's tab once, right after mount — not on every
    // initialTab identity change (selectTab() below already owns the tab
    // after that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeTab = visibleTabs.includes(tab) ? tab : "Overview";

  // Keep the URL in sync so the current tab is shareable — plain
  // history.replaceState, no server round-trip for a client-only switch.
  const selectTab = (t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (t === "Overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tabSlug(t));
      window.history.replaceState(window.history.state, "", url);
    }
  };
  const { user, loading: authLoading } = useProfile();
  const pathname = usePathname();

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
                className={`ev2-tab ${activeTab === t ? "on" : ""}`} onClick={() => selectTab(t)}
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
      {activeTab === "Register" && (
        <TournamentRegisterTab
          tournament={tournament}
          initialTeam={myTeam}
          loggedIn={loggedIn}
          confirmedCount={confirmedTeams.length}
        />
      )}
      {activeTab === "Table" && <TableTab tournament={tournament} standingsByGroup={standingsByGroup} teams={teams} />}
      {activeTab === "Knockout" && <KnockoutTab matches={matches} teams={teams} />}
      {activeTab === "Fixtures" && (
        <FixturesPublicTab tournamentId={tournament.id} matches={matches} teams={teams} />
      )}
      {activeTab === "Player Stats" && (
        authLoading ? null : user ? <PlayerStatsTab rows={playerStats} teams={teams} /> : <SignInGate what="the player stats" pathname={pathname} />
      )}
      {activeTab === "Teams" && (
        authLoading ? null : user ? <TeamsTab teams={confirmedTeams} playerStats={playerStats} /> : <SignInGate what="the teams and squads" pathname={pathname} />
      )}

      {/* Rules only matter while you're deciding whether to register or
          getting oriented — once you're checking the table, fixtures, or
          your bracket match, they're just noise below the fold. */}
      {(activeTab === "Overview" || activeTab === "Register") && <RulesPanel tournament={tournament} />}
    </div>
  );
}

function RulesPanel({ tournament }: { tournament: Tournament }) {
  if (!tournament.rules_text && !tournament.equipment_notes && !tournament.venue_rules) return null;
  return (
    <div className="bk-panel">
      <h3>Rules</h3>
      {tournament.rules_text && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{tournament.rules_text}</p>}
      {tournament.equipment_notes && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Equipment:</b> {tournament.equipment_notes}</p>}
      {tournament.venue_rules && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Venue rules:</b> {tournament.venue_rules}</p>}
    </div>
  );
}

// ── Sign-in wall for Player Stats / Teams — everything else on this
// page stays public. ──────────────────────────────────────────────
function SignInGate({ what, pathname }: { what: string; pathname: string }) {
  return (
    <div className="ev2-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px" }}>
      <LogIn size={22} style={{ opacity: 0.5 }} />
      <div>Sign in to view {what} for this tournament.</div>
      <Link
        href={`/login?redirect=${encodeURIComponent(pathname)}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: "#00875a", textDecoration: "none" }}
      >
        <LogIn size={14} /> Sign in
      </Link>
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
            {/* Glossy 3D medal/trophy renders (Microsoft Fluent Emoji, MIT
                licensed — github.com/microsoft/fluentui-emoji) instead of
                flat line icons here: genuinely distinct per tier (trophy
                vs. an actual silver vs. an actual bronze medal, not the
                same glyph recoloured) and a deliberate one-section accent,
                not a site-wide style change. */}
            {awards.winner && (
              <div className="ev2-award gold">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ev2-award-badge" src="/awards/trophy.png" alt="" />
                <div className="ev2-award-l">Winner</div>
                <div className="ev2-award-v">{awards.winner}</div>
              </div>
            )}
            {awards.runnerUp && (
              <div className="ev2-award silver">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ev2-award-badge" src="/awards/runner-up.png" alt="" />
                <div className="ev2-award-l">Runner-up</div>
                <div className="ev2-award-v">{awards.runnerUp}</div>
              </div>
            )}
            {awards.semifinalists.map((name) => (
              <div className="ev2-award bronze" key={name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ev2-award-badge" src="/awards/semifinalist.png" alt="" />
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
// Rank, crest, name, then the four stats a casual viewer actually scans
// for (Points, Won, Lost, Drawn) as their own chips — Played/GF/GA/GD
// are still in the data (TournamentStanding), just not worth the row
// width for a glance-and-go standings list. One rounded card per team
// instead of a dense spreadsheet table.
function TableTab({
  tournament, standingsByGroup, teams,
}: {
  tournament: Tournament;
  standingsByGroup: Record<string, TournamentStanding[]>;
  teams: TournamentTeam[];
}) {
  const groups = Object.keys(standingsByGroup).sort();
  if (groups.length === 0 || groups.every((g) => standingsByGroup[g].length === 0)) {
    return <div className="ev2-empty">No results yet.</div>;
  }
  const teamLogo = (id: string) => teams.find((t) => t.id === id)?.logo_url ?? null;
  return (
    <div>
      {groups.map((g) => {
        const rows = standingsByGroup[g];
        if (rows.length === 0) return null;
        return (
          <div key={g} className="ev2-standings">
            {tournament.format === "group_knockout" && <div className="ev2-card-t">Group {g}</div>}
            {rows.map((r, i) => {
              const logo = teamLogo(r.team_id);
              return (
                <div key={r.team_id} className={`ev2-srow${i < 2 ? " top3" : ""}`}>
                  <span className="ev2-srow-rank">{i + 1}</span>
                  <span className="ev2-srow-badge">
                    {logo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={logo} alt="" />
                      : r.team_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="ev2-srow-name">{r.team_name}</span>
                  <div className="ev2-srow-stats">
                    <div className="ev2-schip"><span className="l">Points</span><span className="v">{r.points}</span></div>
                    <div className="ev2-schip"><span className="l">Won</span><span className="v">{r.won}</span></div>
                    <div className="ev2-schip"><span className="l">Lost</span><span className="v">{r.lost}</span></div>
                    <div className="ev2-schip"><span className="l">Drawn</span><span className="v">{r.drawn}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Knockout — round switcher + match list ─────────────────────────
const MATCH_H = 108;

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

// Which statuses count as "decided" — used to pick the round a viewer
// lands on by default (see KnockoutTab).
const KO_DONE = new Set(["completed", "walkover", "cancelled"]);

function matchCode(ms: TournamentMatch[], i: number): string {
  return ms.length > 1 ? `${roundShortCode(ms[i].round_label)}${i + 1}` : roundShortCode(ms[i].round_label);
}

function KnockoutTab({ matches, teams }: { matches: TournamentMatch[]; teams: TournamentTeam[] }) {
  const [selected, setSelected] = useState<TournamentMatch | null>(null);
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const knockout = [...matches].filter((m) => m.stage === "knockout").sort((a, b) => a.created_at.localeCompare(b.created_at));

  const rounds = [...new Set(knockout.map((m) => m.round))].sort((a, b) => a - b);
  const byRound = rounds.map((r) => knockout.filter((m) => m.round === r));

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
      {/* One round switcher + a single vertical list, on every screen
          size — no full multi-column bracket tree to discover by
          scrolling sideways; every match in the picked round is just
          there. Matches are added by hand (no auto-generated pairing
          tree), so there's no guaranteed relationship between a
          round's matches and the round before it anyway — a tree of
          connector lines would be claiming a precision the data can't
          back up. */}
      <div className="ev2-bracket-rounds">
        <div className="ev2-bracket-round-chips">
          {byRound.map((ms, r) => (
            <button key={r} className={`ev2-bracket-chip ${r === safeActiveRound ? "on" : ""}`} onClick={() => setActiveRound(r)}>
              {ms[0]?.round_label}
            </button>
          ))}
        </div>
        <div className="ev2-bracket-list">
          {byRound[safeActiveRound].map((m, i) => (
            <BracketMatchCard key={m.id} match={m} team={team} code={matchCode(byRound[safeActiveRound], i)} onClick={() => setSelected(m)} />
          ))}
        </div>
      </div>

      {selected && <MatchDetailModal match={selected} team={team} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BracketMatchCard({ match: m, code, team, onClick }: {
  match: TournamentMatch; code: string; team: (id: string | null) => TournamentTeam | undefined; onClick: () => void;
}) {
  const pill = matchStatusPill(m);
  const decided = m.winner_team_id != null;
  return (
    <button type="button" className={`ev2-bracket-match ${m.round_label === "Final" ? "final" : ""}`} style={{ minHeight: MATCH_H }} onClick={onClick}>
      <div className="ev2-bracket-match-head">
        <span className="ev2-bracket-code">{code}</span>
        {pill && <span className={`ev2-bracket-pill ${pill.cls}`}>{pill.live && <i className="ev2-live-dot" />}{pill.label}</span>}
        {m.status === "walkover" && <span className="ev2-bracket-pill walkover">Walkover</span>}
      </div>
      <BracketSlot team={team(m.team_a_id)} fallback="TBD"
        winner={decided && m.winner_team_id === m.team_a_id} decided={decided} score={m.score_a} />
      <BracketSlot team={team(m.team_b_id)} fallback={m.team_b_id ? "TBD" : m.status === "completed" ? "Bye" : "TBD"}
        winner={decided && m.winner_team_id === m.team_b_id} decided={decided} score={m.score_b} />
      <div className="ev2-bracket-meta">{matchWhen(m)}</div>
    </button>
  );
}

// Same glassy crest badge as the standings/teams/fixtures cards — a
// bracket used to be the one place still using a plain flat-colour
// initial avatar and no real team logo. Once a match is decided, the
// loser dims instead of just the winner going bold — a clearer "this
// one's out" signal than weight alone.
function BracketSlot({ team, fallback, winner, decided, score }: {
  team: TournamentTeam | undefined; fallback: string; winner: boolean; decided: boolean; score: number | null;
}) {
  const name = team?.name ?? fallback;
  const tbd = name === "TBD" || name === "Bye";
  const loser = decided && !winner && !tbd;
  return (
    <div className={`ev2-bracket-slot ${winner ? "winner" : ""} ${loser ? "loser" : ""} ${tbd ? "tbd" : ""}`}>
      <span className="ev2-bracket-team">
        <TeamCrest name={tbd ? "?" : name} logoUrl={team?.logo_url} size="sm" />
        <span className="ev2-bracket-name">{name}</span>
      </span>
      {score != null && <span className="ev2-bracket-score">{score}</span>}
    </div>
  );
}

function MatchDetailModal({ match: m, team, onClose }: {
  match: TournamentMatch; team: (id: string | null) => TournamentTeam | undefined; onClose: () => void;
}) {
  const pill = matchStatusPill(m);
  const decided = m.winner_team_id != null;
  return (
    <div className="ev2-scrim" onClick={onClose}>
      <div className="ev2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ev2-modal-head" style={{ alignItems: "center" }}>
          <div>
            <div className="ev2-bracket-round-label" style={{ marginBottom: 4, textAlign: "left" }}>{m.round_label}</div>
            {pill && <span className={`ev2-bracket-pill ${pill.cls}`}>{pill.live && <i className="ev2-live-dot" />}{pill.label}</span>}
          </div>
          <button aria-label="Close" className="ev2-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ border: "1px solid rgba(242,237,230,0.1)", borderRadius: 12, overflow: "hidden" }}>
          <BracketSlot team={team(m.team_a_id)} fallback="TBD"
            winner={decided && m.winner_team_id === m.team_a_id} decided={decided} score={m.score_a} />
          <BracketSlot team={team(m.team_b_id)} fallback={m.team_b_id ? "TBD" : m.status === "completed" ? "Bye" : "TBD"}
            winner={decided && m.winner_team_id === m.team_b_id} decided={decided} score={m.score_b} />
        </div>

        {m.status === "walkover" && (
          <div className="ev2-empty" style={{ padding: "10px 0 0", textAlign: "left" }}>Walkover — {team(m.winner_team_id)?.name ?? "Unknown"}</div>
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
function TeamCrest({ name, logoUrl, size = "md" }: { name: string; logoUrl?: string | null; size?: "sm" | "md" }) {
  return (
    <span className={`ev2-crest${size === "sm" ? " sm" : ""}`}>
      {logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl} alt="" />
        : name.charAt(0).toUpperCase()}
    </span>
  );
}

function FixturesPublicTab({ tournamentId, matches, teams }: {
  tournamentId: string; matches: TournamentMatch[]; teams: TournamentTeam[];
}) {
  if (matches.length === 0) return <div className="ev2-empty">Fixtures haven&apos;t been generated yet.</div>;
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const teamName = (id: string | null) => team(id)?.name ?? "Unknown";

  const sorted = [...matches].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return a.created_at.localeCompare(b.created_at);
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return a.starts_at.localeCompare(b.starts_at);
  });

  // Grouped by the ISO calendar date (KTM) so each group's "Share this
  // day" button can ask the card route for exactly that date — the
  // display label above is just for the header, not what's queried on.
  const groups = new Map<string, { label: string; matches: TournamentMatch[] }>();
  for (const m of sorted) {
    const key = m.starts_at ? new Date(m.starts_at).toLocaleDateString("en-CA", { timeZone: KTM }) : "tbd";
    const label = m.starts_at
      ? new Date(m.starts_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM })
      : "Date to be announced";
    if (!groups.has(key)) groups.set(key, { label, matches: [] });
    groups.get(key)!.matches.push(m);
  }

  return (
    <div className="ev2-card">
      {[...groups.entries()].map(([key, { label, matches: ms }]) => (
        <div key={key}>
          <div className="ev2-fixture-date">
            <span>{label}</span>
            {key !== "tbd" && <DayFixturesShareButton tournamentId={tournamentId} date={key} dateLabel={label} />}
          </div>
          {ms.map((m) => {
            const teamAName = m.team_a_id ? teamName(m.team_a_id) : "TBD";
            const teamBName = m.team_b_id ? teamName(m.team_b_id) : m.status === "completed" ? "Bye" : "TBD";
            const live = m.status === "live";
            return (
              <div key={m.id} className="ev2-fixture">
                <div className="ev2-fixture-time">
                  {m.starts_at ? new Date(m.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM }) : "TBD"}
                </div>
                <div className="ev2-fixture-teams">
                  <span className="ev2-fixture-side">
                    <TeamCrest name={teamAName} logoUrl={team(m.team_a_id)?.logo_url} size="sm" />
                    <span className="ev2-fixture-name">{teamAName}</span>
                  </span>
                  <span className="ev2-fixture-mid">
                    {m.status === "walkover" ? (
                      <span className="score wo">W/O</span>
                    ) : m.status === "completed" && m.score_a !== null && m.score_b !== null ? (
                      <span className="score">{m.score_a} – {m.score_b}</span>
                    ) : live ? (
                      <span className="live"><i className="ev2-live-dot" />Live</span>
                    ) : <span className="vs">vs</span>}
                  </span>
                  <span className="ev2-fixture-side reverse">
                    <span className="ev2-fixture-name">{teamBName}</span>
                    <TeamCrest name={teamBName} logoUrl={team(m.team_b_id)?.logo_url} size="sm" />
                  </span>
                </div>
                <div className="ev2-fixture-round">{m.round_label}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Player stats leaderboard ────────────────────────────────────
// Same rank/crest/chip identity as the standings and teams cards —
// Goals and Yellow cards are the two stats worth a full chip; red
// cards and MOM are secondary, small inline badges next to the name,
// only showing up when actually non-zero rather than padding every
// row with dashes. (Yellow used to be one of those small badges too,
// alongside an Assists chip — promoted to its own chip and Assists
// dropped, so it isn't shown twice.)
function PlayerStatsTab({ rows, teams }: { rows: TournamentPlayerStatRow[]; teams: TournamentTeam[] }) {
  if (rows.length === 0) return <div className="ev2-empty">No player stats recorded yet.</div>;
  return (
    <div className="ev2-standings">
      {rows.map((r, i) => {
        const logo = teams.find((t) => t.id === r.team_id)?.logo_url;
        return (
          <div key={r.team_player_id} className={`ev2-srow${i < 2 ? " top3" : ""}`}>
            <span className="ev2-srow-rank">{i + 1}</span>
            <TeamCrest name={r.player_name} logoUrl={logo} />
            <div className="ev2-prow-id">
              <span className="ev2-srow-name">{r.player_name}</span>
              <span className="ev2-prow-team">{r.team_name}</span>
            </div>
            {(r.red_cards > 0 || r.mom_count > 0) && (
              <div className="ev2-prow-badges">
                {r.red_cards > 0 && <span className="ev2-prow-badge red">{r.red_cards}</span>}
                {r.mom_count > 0 && <span className="ev2-prow-badge mom"><Star size={9} fill="currentColor" />{r.mom_count}</span>}
              </div>
            )}
            <div className="ev2-srow-stats">
              <div className="ev2-schip"><span className="l">Goals</span><span className="v">{r.goals}</span></div>
              <div className="ev2-schip"><span className="l">Yellow</span><span className="v">{r.yellow_cards}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Teams + squad viewer ────────────────────────────────────────
type RosterPlayer = { id: string; role: string; name: string; is_linked: boolean };

function TeamsTab({ teams, playerStats }: { teams: TournamentTeam[]; playerStats: TournamentPlayerStatRow[] }) {
  const [open, setOpen] = useState<TournamentTeam | null>(null);
  if (teams.length === 0) return <div className="ev2-empty">No confirmed teams yet.</div>;

  // Total yellow cards across the whole team, not per player — a quick
  // "this team's picked up a lot of cards" signal right on the crest,
  // same spot the Player Stats tab shows an individual's card count.
  const teamYellows = new Map<string, number>();
  for (const r of playerStats) teamYellows.set(r.team_id, (teamYellows.get(r.team_id) ?? 0) + r.yellow_cards);

  return (
    <div>
      <div className="ev2-team-grid">
        {teams.map((t, i) => {
          const yellows = teamYellows.get(t.id) ?? 0;
          return (
          <button key={t.id} className="ev2-team-card" onClick={() => setOpen(t)}>
            <div className="ev2-team-card-head">
              <span className="ev2-team-card-rank">{i + 1}</span>
              <span className="ev2-team-card-badge-wrap">
                <span className="ev2-team-card-badge">
                  {t.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={t.logo_url} alt="" />
                    : t.name.charAt(0).toUpperCase()}
                </span>
                {yellows > 0 && <span className="ev2-team-card-yellow" title={`${yellows} yellow card${yellows === 1 ? "" : "s"}`}>{yellows}</span>}
              </span>
              <div className="ev2-team-card-name">{t.name}</div>
            </div>
            {t.manager_name && (
              <div className="ev2-team-card-sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={11} /> {t.manager_name}{t.manager_phone ? ` · ${t.manager_phone}` : ""}
              </div>
            )}
            {t.coach_name && (
              <div className="ev2-team-card-sub" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={11} /> Coach: {t.coach_name}{t.coach_phone ? ` · ${t.coach_phone}` : ""}
              </div>
            )}
            <div className="ev2-team-card-sub">Tap to view squad</div>
          </button>
          );
        })}
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
        <div className="ev2-modal-head">
          <div className="ev2-modal-id">
            <span className="ev2-team-card-badge">
              {team.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={team.logo_url} alt="" />
                : team.name.charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 17, fontWeight: 800 }}>{team.name}</h3>
              {team.manager_name && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, opacity: 0.65, marginTop: 4 }}>
                  <Phone size={12} /> {team.manager_name}{team.manager_phone ? ` · ${team.manager_phone}` : ""}
                </div>
              )}
              {team.coach_name && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, opacity: 0.65, marginTop: 2 }}>
                  <Phone size={12} /> Coach: {team.coach_name}{team.coach_phone ? ` · ${team.coach_phone}` : ""}
                </div>
              )}
            </div>
          </div>
          <button aria-label="Close" className="ev2-modal-close" onClick={onClose}><X size={16} /></button>
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
                {p.role === "captain" && <Star size={13} className="ev2-squad-star" fill="currentColor" />}
                {p.role === "substitute" && <span className="ev2-squad-sub">Sub</span>}
                {!p.is_linked && !user && (
                  <span className="ev2-squad-unlinked">Not linked</span>
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
