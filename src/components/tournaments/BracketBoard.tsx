"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Trophy } from "lucide-react";
import type { TournamentMatch, TournamentTeam } from "@/lib/tournaments/types";

const DONE_STATUSES = new Set(["completed", "walkover", "cancelled"]);
const KTM = "Asia/Kathmandu";

// A carousel of round columns — one full-width column at a time on
// phones (swipe/tap through Round of 16 -> Quarterfinal -> ...),
// several fixed-width columns side by side with native horizontal
// scroll on desktop. Every column is plain top-to-bottom flow (no
// computed pixel positions, no literal connector-line tree) — that
// structurally rules out the whole class of bugs a coordinate-based
// bracket kept producing (dead space around a 1-match Final column,
// two matches landing on top of each other, a nested scroll fighting
// the page's own). Same card tokens as the rest of the tournament page
// (ev2-card/ev2-srow/ev2-status-pill) so it still reads as part of the
// page rather than a separately-themed panel.
export default function BracketBoard({ matches, team, onMatchClick, emptyLabel = "No knockout matches added yet." }: {
  matches: TournamentMatch[];
  team: (id: string | null) => TournamentTeam | undefined;
  onMatchClick?: (m: TournamentMatch) => void;
  emptyLabel?: string;
}) {
  const knockout = matches.filter((m) => m.stage === "knockout");
  const trackRef = useRef<HTMLDivElement | null>(null);

  const rounds = [...new Set(knockout.map((m) => m.round))].sort((a, b) => a - b);
  const byRound = rounds.map((r) =>
    knockout.filter((m) => m.round === r).sort((a, b) => a.created_at.localeCompare(b.created_at))
  );

  // Same "land one round before the interesting one" idea as before —
  // a completed bracket opens on Semifinal *and* Final together, not
  // Final alone; an in-progress one opens on the round in progress
  // plus whatever fed into it.
  const [round, setRound] = useState(() => {
    const i = byRound.findIndex((ms) => ms.some((m) => !DONE_STATUSES.has(m.status)));
    const landing = i === -1 ? Math.max(0, byRound.length - 1) : i;
    return Math.max(0, landing - 1);
  });
  const safeRound = Math.min(Math.max(round, 0), rounds.length - 1);

  // Every column sits in the same horizontal "row" (that's what makes
  // them scroll together), and any layout mode that puts boxes side by
  // side — flex, inline-block, grid, doesn't matter — sizes that row to
  // its TALLEST member, full stop. A 1-match Final column was rendering
  // inside a row exactly as tall as an off-screen 8-match Round-of-32
  // column, leaving a slab of dead space below its own cards. Rather
  // than fight that (there's no way to opt one sibling out of a shared
  // line box), the wrapper around .brk-track clips down to *only* the
  // active column's own measured height, transitioning smoothly when
  // it changes — every other column is still full height underneath,
  // just cropped out of view along with its unused space.
  // Below 720px, .brk-col is 100% width — exactly one column is ever
  // visible, so only that one should count. At/above 720px it's a
  // fixed 320px and more than one sits side by side (see the media
  // query below), so its immediate neighbors need to be considered
  // too or one of them would end up clipped or under-sized next to
  // whichever column is "active". Matching that same 720px breakpoint
  // here keeps this in sync with the CSS deciding how many columns are
  // actually on screen, rather than guessing.
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);
  function measureViewport(atRound: number) {
    const track = trackRef.current;
    if (!track) return;
    const multiColumn = window.innerWidth >= 720;
    const indices = multiColumn ? [atRound - 1, atRound, atRound + 1] : [atRound];
    const heights = indices
      .map((i) => track.children[i] as HTMLElement | undefined)
      .filter((el): el is HTMLElement => !!el)
      .map((el) => el.getBoundingClientRect().height);
    if (heights.length) setViewportHeight(Math.max(...heights));
  }

  function stepWidth(): number {
    const col = trackRef.current?.children[0] as HTMLElement | undefined;
    if (!col) return 0;
    const marginRight = parseFloat(getComputedStyle(col).marginRight || "0");
    return col.getBoundingClientRect().width + marginRight;
  }

  // Mount-only — sets the initial scroll position to match the landing
  // round. Deliberately not re-run per round change: goToRound() below
  // already drives scrollLeft itself for programmatic navigation, and a
  // manual swipe (onScroll -> setRound) must never have its in-progress
  // scroll position forced back by this, or the gesture would fight it.
  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = safeRound * stepWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-measure whenever the active round changes, however it changed
  // (goToRound, a manual swipe settling via onScroll, or the initial
  // mount) — this is the one that keeps the clip height honest.
  useLayoutEffect(() => {
    measureViewport(safeRound);
    function onResize() { measureViewport(safeRound); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [safeRound]);

  if (knockout.length === 0) return <div className="brk-empty">{emptyLabel}</div>;

  function goToRound(target: number) {
    const clamped = Math.min(Math.max(target, 0), rounds.length - 1);
    setRound(clamped);
    trackRef.current?.scrollTo({ left: clamped * stepWidth(), behavior: "smooth" });
  }

  function onScroll() {
    const track = trackRef.current;
    const step = stepWidth();
    if (!track || !step) return;
    const nearest = Math.round(track.scrollLeft / step);
    setRound((r) => (r === nearest ? r : nearest));
  }

  return (
    <div className="brk">
      <style>{BRACKET_CSS}</style>
      <div className="brk-toolbar">
        <button className="brk-nav prev" aria-label="Previous round" disabled={safeRound === 0} onClick={() => goToRound(safeRound - 1)}>
          <ChevronLeft size={16} />
        </button>
        {rounds.length > 1 && (
          <div className="brk-dots" role="tablist" aria-label="Round">
            {rounds.map((r, ri) => (
              <button
                key={r} className={`brk-dot${ri === safeRound ? " on" : ""}`}
                role="tab" aria-selected={ri === safeRound} aria-label={byRound[ri][0]?.round_label ?? `Round ${r}`}
                onClick={() => goToRound(ri)}
              />
            ))}
          </div>
        )}
        <button className="brk-nav next" aria-label="Next round" disabled={safeRound === rounds.length - 1} onClick={() => goToRound(safeRound + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="brk-viewport" style={viewportHeight != null ? { height: viewportHeight } : undefined}>
        <div className="brk-track" ref={trackRef} onScroll={onScroll}>
          {byRound.map((ms, ri) => (
            <div key={ri} className="brk-col">
              <div className="brk-col-head">{ms[0]?.round_label ?? `Round ${rounds[ri]}`}</div>
              <div className="brk-col-list">
                {ms.map((m, i) => (
                  <MatchCard
                    key={m.id} match={m} team={team}
                    isFinal={ri === rounds.length - 1}
                    delayMs={Math.min(i * 35, 260)}
                    fallbackA={tbdLabel(byRound, ri, m.id, "a")}
                    fallbackB={tbdLabel(byRound, ri, m.id, "b")}
                    onClick={onMatchClick ? () => onMatchClick(m) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A TBD slot is more useful as "Winner of Round of 16" than a bare
// "TBD" when we can actually identify the match it's waiting on —
// found by finding the previous round's match whose next_match_id/
// next_match_slot points at this one.
function tbdLabel(byRound: TournamentMatch[][], ri: number, matchId: string, slot: "a" | "b"): string {
  if (ri === 0) return "TBD";
  const feeder = byRound[ri - 1].find((pm) => pm.next_match_id === matchId && pm.next_match_slot === slot);
  return feeder ? `Winner of ${feeder.round_label}` : "TBD";
}

function cardDate(m: TournamentMatch): string {
  if (!m.starts_at) return "TBD";
  return new Date(m.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: KTM });
}

function statusBadge(m: TournamentMatch): { label: string; cls: string } {
  if (m.status === "live") return { label: "LIVE", cls: "live" };
  if (m.status === "walkover") return { label: "W/O", cls: "ft" };
  if (m.status === "completed") return { label: "FT", cls: "ft" };
  if (m.status === "postponed") return { label: "PP", cls: "pp" };
  if (m.status === "cancelled") return { label: "CANC", cls: "cancel" };
  return { label: "UPCOMING", cls: "upcoming" };
}

function MatchCard({ match: m, team, isFinal, delayMs = 0, fallbackA = "TBD", fallbackB = "TBD", onClick }: {
  match: TournamentMatch;
  team: (id: string | null) => TournamentTeam | undefined;
  isFinal: boolean;
  delayMs?: number;
  fallbackA?: string;
  fallbackB?: string;
  onClick?: () => void;
}) {
  const a = team(m.team_a_id);
  const b = team(m.team_b_id);
  const decided = !!m.winner_team_id;
  const badge = statusBadge(m);
  // A bye (team_b never assigned, match already resolved) is a settled
  // outcome, not a pending slot — takes priority over "Winner of ...".
  const resolvedFallbackB = !m.team_b_id && m.status === "completed" ? "Bye" : fallbackB;

  const cardProps = {
    className: `brk-card${isFinal ? " final" : ""}${onClick ? " clickable" : ""}`,
    style: { animationDelay: `${delayMs}ms` },
    role: onClick ? ("button" as const) : undefined,
    tabIndex: onClick ? 0 : undefined,
    onClick,
    onKeyDown: onClick ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined,
  };

  const rowA = <BracketRow team={a} fallback={fallbackA} score={m.score_a} pens={m.score_a_pens} winner={decided && m.winner_team_id === m.team_a_id} loser={decided && m.winner_team_id !== m.team_a_id && !!m.team_a_id} />;
  const rowB = <BracketRow team={b} fallback={resolvedFallbackB} score={m.score_b} pens={m.score_b_pens} winner={decided && m.winner_team_id === m.team_b_id} loser={decided && m.winner_team_id !== m.team_b_id && !!m.team_b_id} />;

  // The Final gets its own hero treatment — a trophy label up top, "VS"
  // between the two rows instead of stacked plainly, and (once decided)
  // a restrained "Champion" caption under the already-highlighted
  // winner row. No confetti, no fake champion before it's actually won.
  if (isFinal) {
    return (
      <div {...cardProps}>
        <div className="brk-final-head"><Trophy size={15} /><span>Final</span></div>
        <div className="brk-card-head">
          <span className="brk-date">{cardDate(m)}</span>
          <span className={`brk-badge ${badge.cls}`}>{badge.cls === "live" && <i className="brk-live-dot" />}{badge.label}</span>
        </div>
        {rowA}
        <div className="brk-final-vs">VS</div>
        {rowB}
        {decided && (
          <div className="brk-champion"><Trophy size={13} /><span>Champion</span></div>
        )}
      </div>
    );
  }

  return (
    <div {...cardProps}>
      <div className="brk-card-head">
        <span className="brk-date">{cardDate(m)}</span>
        <span className={`brk-badge ${badge.cls}`}>{badge.cls === "live" && <i className="brk-live-dot" />}{badge.label}</span>
      </div>
      {rowA}
      {rowB}
    </div>
  );
}

function BracketRow({ team: t, fallback, score, pens, winner, loser }: {
  team: TournamentTeam | undefined;
  fallback: string;
  score: number | null;
  pens: number | null;
  winner: boolean;
  loser: boolean;
}) {
  const name = t?.name ?? fallback;
  const pending = !t && fallback !== "Bye";
  return (
    <div className={`brk-row${winner ? " win" : ""}${loser ? " lose" : ""}${pending ? " pending" : ""}`}>
      <span className="brk-crest">
        {t?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.logo_url} alt="" />
          : pending ? "?" : name.charAt(0).toUpperCase()}
      </span>
      <span className="brk-team-name">{name}</span>
      {score == null ? (
        <span className="brk-vs">vs</span>
      ) : (
        <span className={`brk-score${winner ? " win" : ""}`}>
          {score}
          {pens != null && <span className="brk-pens">({pens})</span>}
          {winner && <Check size={11} className="brk-win-check" />}
        </span>
      )}
    </div>
  );
}

// Same card/border/dim-text tokens as the rest of the public tournament
// page (event-tabs.css's ev2-card/ev2-srow/ev2-status-pill) so this
// reads as part of the page, not a separately-themed panel dropped on
// top of it — adapts to both the site's default (dark) look and the
// "paper" (cream) theme, same as everything around it.
const BRACKET_CSS = `
.brk { font-family: 'Inter', system-ui, sans-serif; color: inherit; padding: 4px 0; }
.brk-empty { text-align: center; padding: 50px 20px; opacity: 0.55; font-size: 13.5px; }

/* A real toolbar row (prev / round dots / next), not buttons floating
   absolutely over the card list — static flex layout can't drift out
   of alignment with whatever's rendering underneath it, which the
   floating version repeatedly did as the column contents changed. */
.brk-toolbar { display: flex; align-items: center; justify-content: center; gap: 18px; margin-bottom: 20px; }
.brk-nav {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center;
  background: rgba(242,237,230,0.06); border: 1px solid rgba(242,237,230,0.14); color: inherit; cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .15s cubic-bezier(.22,1,.36,1);
}
[data-theme="paper"] .brk-nav { background: #fff; border-color: rgba(20,23,30,0.14); box-shadow: 0 1px 4px rgba(20,23,30,0.06); }
.brk-nav:hover { background: rgba(0,135,90,0.14); border-color: rgba(0,135,90,0.4); transform: scale(1.08); }
.brk-nav:active { transform: scale(0.96); }
.brk-nav:disabled { opacity: 0.3; cursor: default; pointer-events: none; transform: none; }

/* .brk-track's columns sit side by side so they can scroll together —
   but ANY layout mode that puts boxes side by side (flex, inline-block,
   grid, table, doesn't matter which) sizes that shared row to its
   TALLEST member. There's no way to opt one sibling out of that on its
   own, so a 1-match Final column was rendering inside a row exactly as
   tall as an off-screen 8-match Round-of-32 column, leaving a slab of
   dead space below its own cards regardless of which layout mode drew
   it. .brk-viewport (wrapping .brk-track, JS-measured in the component)
   is what actually fixes it: it clips down to just the *active*
   column's own height, transitioning smoothly when that changes, while
   every other column keeps its full height underneath, cropped out of
   view along with its unused space.
   That wrapper uses overflow:hidden, not overflow-y:auto/scroll — a
   real vertically-scrollable nested region was tried here once and
   fights the page's own scroll on mobile (a nested scroll container
   sharing an axis with the track's horizontal scroll-snap is
   unreliable about which one actually captures a touch gesture), so
   "scroll down to see more matches" ended up scrolling the outer page
   straight past the bracket instead. Since the wrapper's height always
   matches whichever column is actually active, there's never anything
   left over to scroll inside it in the first place — a tall active
   round (Round of 32) just gets a tall wrapper, not a scrollbar. */
.brk-viewport { overflow: hidden; transition: height .32s cubic-bezier(.22,1,.36,1); }

.brk-track {
  white-space: nowrap; overflow-x: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: none; scroll-snap-type: x mandatory;
  padding: 4px 24px 4px; scroll-behavior: smooth;
}
.brk-track::-webkit-scrollbar { display: none; }

.brk-col {
  display: inline-block; vertical-align: top; white-space: normal; width: 100%;
  margin-right: 24px; scroll-snap-align: start;
  animation: brkColIn .3s ease both;
}
@media (min-width: 720px) { .brk-col { width: 320px; } }
@keyframes brkColIn { from { opacity: 0; } to { opacity: 1; } }

.brk-col-head {
  font-size: 15px; font-weight: 800; letter-spacing: -0.2px; text-align: center;
  padding-bottom: 14px; margin-bottom: 16px; position: relative;
}
.brk-col-head::after {
  content: ""; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
  width: 28px; height: 3px; border-radius: 999px; background: #00875a; opacity: 0.55;
}
.brk-col-list { display: flex; flex-direction: column; gap: 14px; }

/* Round-progress dots — a compact "3 of 5" without spelling it out,
   doubles as a direct jump-to-round control alongside the arrows. */
.brk-dots { display: flex; align-items: center; justify-content: center; gap: 7px; }
.brk-dot {
  width: 7px; height: 7px; border-radius: 999px; padding: 0; border: none; cursor: pointer;
  background: rgba(128,128,128,0.3); transition: all .2s cubic-bezier(.22,1,.36,1);
}
.brk-dot:hover { background: rgba(0,135,90,0.5); }
.brk-dot.on { width: 20px; background: #00875a; }

@keyframes brkCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.brk-card {
  box-sizing: border-box; padding: 15px 17px 13px; border-radius: 16px;
  background: rgba(242,237,230,0.035); border: 1px solid rgba(242,237,230,0.09);
  box-shadow: 0 1px 2px rgba(0,0,0,0.12);
  display: flex; flex-direction: column; gap: 11px;
  animation: brkCardIn .34s cubic-bezier(.22,1,.36,1) both;
  transition: background .15s ease, border-color .15s ease, transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease;
}
[data-theme="paper"] .brk-card { background: #fff; border-color: rgba(20,23,30,0.07); box-shadow: 0 1px 3px rgba(20,23,30,0.05); }
.brk-card.clickable { cursor: pointer; }
.brk-card.clickable:hover {
  border-color: rgba(0,135,90,0.35); transform: translateY(-2px);
  box-shadow: 0 10px 24px -8px rgba(0,0,0,0.28);
}
[data-theme="paper"] .brk-card.clickable:hover { box-shadow: 0 10px 24px -10px rgba(0,98,65,0.22); }
.brk-card.final {
  border-color: rgba(0,135,90,0.45); box-shadow: 0 0 0 1px rgba(0,135,90,0.14), 0 8px 28px -12px rgba(0,135,90,0.3);
  padding: 20px 20px 17px; gap: 13px;
}
.brk-final-head {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #00875a;
}
.brk-final-vs { text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: 0.4; }
.brk-card.final .brk-row { gap: 12px; }
.brk-card.final .brk-crest { width: 34px; height: 34px; font-size: 14px; }
.brk-card.final .brk-team-name { font-size: 16px; }
.brk-card.final .brk-score { font-size: 17px; }
/* Restrained — a small caption under the already-highlighted winner
   row, not a second oversized banner or any confetti/animation. */
.brk-champion {
  display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 2px;
  font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #00875a;
}

.brk-card-head { display: flex; align-items: center; justify-content: space-between; }
.brk-date { font-size: 11.5px; font-weight: 600; opacity: 0.55; }
.brk-badge {
  font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 3px 9px; border-radius: 999px;
  background: rgba(128,128,128,0.16); opacity: 0.75; display: inline-flex; align-items: center; gap: 5px;
}
.brk-badge.live { background: rgba(229,72,77,0.16); color: #E5484D; opacity: 1; }
.brk-badge.upcoming { background: rgba(0,135,90,0.12); color: #00875a; opacity: 1; }
[data-theme="paper"] .brk-badge.upcoming { color: #006241; }
.brk-badge.pp, .brk-badge.cancel { background: rgba(217,119,6,0.14); color: #d97706; opacity: 1; }
.brk-live-dot { width: 5px; height: 5px; border-radius: 999px; background: #E5484D; animation: brkpulse 1.4s infinite; }
@keyframes brkpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

.brk-row { display: flex; align-items: center; gap: 10px; min-width: 0; opacity: 0.55; transition: opacity .2s ease; }
.brk-crest {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
  display: grid; place-items: center; font-size: 12px; font-weight: 800;
  background: linear-gradient(155deg, rgba(0,135,90,0.22), rgba(0,135,90,0.08));
  border: 1px solid rgba(0,135,90,0.28); color: #00875a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
}
.brk-crest img { width: 100%; height: 100%; object-fit: cover; }
.brk-team-name {
  flex: 1 1 auto; min-width: 0; font-size: 14.5px; font-weight: 600; letter-spacing: -0.1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.brk-vs { flex-shrink: 0; font-size: 12px; font-weight: 700; opacity: 0.4; }
.brk-row.pending .brk-team-name { font-style: italic; opacity: 0.75; }
.brk-row.pending .brk-crest { background: rgba(128,128,128,0.14); border-color: rgba(128,128,128,0.24); color: inherit; opacity: 0.6; }
.brk-score {
  flex-shrink: 0; font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 700;
  display: flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 9px;
  transition: background .2s ease;
}
.brk-score.win { background: linear-gradient(155deg, rgba(0,135,90,0.18), rgba(0,135,90,0.09)); }
.brk-row.win { opacity: 1; }
.brk-row.win .brk-team-name { font-weight: 800; }
.brk-row.win .brk-score { font-weight: 800; color: #00875a; }
.brk-pens { font-size: 10.5px; font-weight: 600; opacity: 0.75; }
.brk-win-check { color: #00875a; }

/* Below the desktop breakpoint a column is the full viewport width
   (see .brk-col above), so any side padding here would leave the next
   card's edge visibly bleeding in, cut off mid-text. */
@media (max-width: 719px) {
  .brk-track { padding: 0; }
  .brk-col { margin-right: 0; }
}
`;
