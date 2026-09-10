"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { TournamentMatch, TournamentTeam } from "@/lib/tournaments/types";

const DONE_STATUSES = new Set(["completed", "walkover", "cancelled"]);
const KTM = "Asia/Kathmandu";

// A carousel of round columns — one full-width column at a time on
// phones (swipe/tap through Round of 16 -> Quarterfinal -> ...),
// several fixed-width columns side by side with native horizontal
// scroll on desktop. Every column is plain top-to-bottom flow (no
// computed pixel positions), and shorter columns are centered against
// the tallest one purely with `align-items: center` on the row — a
// deliberate step back from a literal connector-line bracket tree,
// which needed exact per-match coordinates to draw correctly and kept
// producing edge cases (huge dead space around a 1-match Final column,
// two matches landing on top of each other) that a plain vertical list
// structurally can't. Same card tokens as the rest of the tournament
// page (ev2-card/ev2-srow/ev2-status-pill) so it still reads as part
// of the page rather than a separately-themed panel.
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

  function stepWidth(): number {
    const track = trackRef.current;
    const col = track?.children[0] as HTMLElement | undefined;
    if (!track || !col) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    return col.getBoundingClientRect().width + gap;
  }

  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = round * stepWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (knockout.length === 0) return <div className="brk-empty">{emptyLabel}</div>;
  const safeRound = Math.min(Math.max(round, 0), rounds.length - 1);

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
      <button className="brk-nav prev" aria-label="Previous round" disabled={safeRound === 0} onClick={() => goToRound(safeRound - 1)}>
        <ChevronLeft size={16} />
      </button>
      <button className="brk-nav next" aria-label="Next round" disabled={safeRound === rounds.length - 1} onClick={() => goToRound(safeRound + 1)}>
        <ChevronRight size={16} />
      </button>
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

  return (
    <div
      className={`brk-card${isFinal ? " final" : ""}${onClick ? " clickable" : ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="brk-card-head">
        <span className="brk-date">{cardDate(m)}</span>
        <span className={`brk-badge ${badge.cls}`}>{badge.cls === "live" && <i className="brk-live-dot" />}{badge.label}</span>
      </div>
      <BracketRow team={a} fallback={fallbackA} score={m.score_a} pens={m.score_a_pens} winner={decided && m.winner_team_id === m.team_a_id} loser={decided && m.winner_team_id !== m.team_a_id && !!m.team_a_id} />
      <BracketRow team={b} fallback={resolvedFallbackB} score={m.score_b} pens={m.score_b_pens} winner={decided && m.winner_team_id === m.team_b_id} loser={decided && m.winner_team_id !== m.team_b_id && !!m.team_b_id} />
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
.brk { position: relative; font-family: 'Inter', system-ui, sans-serif; color: inherit; padding: 4px 0; }
.brk-empty { text-align: center; padding: 50px 20px; opacity: 0.55; font-size: 13.5px; }

/* Pinned level with the round header, not vertically centered on the
   whole card list — centering put them wherever the middle of however
   many cards happened to be, which could land squarely on top of a
   card's score. */
.brk-nav {
  position: absolute; top: 4px; z-index: 5;
  width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center;
  background: rgba(242,237,230,0.06); border: 1px solid rgba(242,237,230,0.14); color: inherit; cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
[data-theme="paper"] .brk-nav { background: #fff; border-color: rgba(20,23,30,0.14); box-shadow: 0 1px 4px rgba(20,23,30,0.06); }
.brk-nav:hover { background: rgba(0,135,90,0.14); border-color: rgba(0,135,90,0.4); }
.brk-nav:disabled { opacity: 0.3; cursor: default; pointer-events: none; }
.brk-nav.prev { left: -4px; }
.brk-nav.next { right: -4px; }

/* align-items: flex-start (not center) is load-bearing — centering
   would vertically align every column against the row's shared cross-
   axis size, which is set by the TALLEST column even when that round
   isn't the one currently scrolled into view. A short Semifinal column
   centered against an off-screen, much taller Round-of-16 column reads
   as "huge empty gap before anything shows up" — this is that same
   empty-space bug in a new shape, just from flexbox instead of the
   pixel-position math it replaced. Top-aligning columns makes every
   round's height independent of every other round's.
   max-height + its own overflow-y keeps that tallest column (and, with
   it, this widget's overall height — which the nav buttons position
   against) bounded, instead of a big Round-of-32 column stretching the
   whole panel and dragging the nav buttons down with it. */
.brk-track {
  display: flex; align-items: flex-start; gap: 24px; overflow-x: auto; overflow-y: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: none; scroll-snap-type: x mandatory;
  padding: 0 40px; scroll-behavior: smooth; max-height: 66vh;
}
@media (min-width: 720px) { .brk-track { max-height: 560px; } }
.brk-track::-webkit-scrollbar { display: none; }

.brk-col {
  flex: 0 0 100%; scroll-snap-align: start; display: flex; flex-direction: column;
  animation: brkColIn .3s ease both;
}
@media (min-width: 720px) { .brk-col { flex: 0 0 320px; } }
@keyframes brkColIn { from { opacity: 0; } to { opacity: 1; } }

.brk-col-head {
  font-size: 15px; font-weight: 800; letter-spacing: -0.2px; text-align: center;
  padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(242,237,230,0.12);
}
[data-theme="paper"] .brk-col-head { border-bottom-color: rgba(20,23,30,0.1); }
.brk-col-list { display: flex; flex-direction: column; gap: 12px; }

@keyframes brkCardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.brk-card {
  box-sizing: border-box; padding: 14px 16px 12px; border-radius: 16px;
  background: rgba(242,237,230,0.035); border: 1px solid rgba(242,237,230,0.09);
  display: flex; flex-direction: column; gap: 10px;
  animation: brkCardIn .34s cubic-bezier(.22,1,.36,1) both;
  transition: background .15s ease, border-color .15s ease, transform .15s ease;
}
[data-theme="paper"] .brk-card { background: #fff; border-color: rgba(20,23,30,0.08); box-shadow: 0 1px 4px rgba(20,23,30,0.05); }
.brk-card.clickable { cursor: pointer; }
.brk-card.clickable:hover { border-color: rgba(0,135,90,0.35); transform: translateY(-2px); }
.brk-card.final { border-color: rgba(0,135,90,0.4); box-shadow: 0 0 0 1px rgba(0,135,90,0.12); }

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

.brk-row { display: flex; align-items: center; gap: 10px; min-width: 0; opacity: 0.55; }
.brk-crest {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
  display: grid; place-items: center; font-size: 12px; font-weight: 800;
  background: rgba(0,135,90,0.14); border: 1px solid rgba(0,135,90,0.28); color: #00875a;
}
.brk-crest img { width: 100%; height: 100%; object-fit: cover; }
.brk-team-name {
  flex: 1 1 auto; min-width: 0; font-size: 14.5px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.brk-vs { flex-shrink: 0; font-size: 12px; font-weight: 700; opacity: 0.4; }
.brk-row.pending .brk-team-name { font-style: italic; opacity: 0.75; }
.brk-row.pending .brk-crest { background: rgba(128,128,128,0.14); border-color: rgba(128,128,128,0.24); color: inherit; opacity: 0.6; }
.brk-score {
  flex-shrink: 0; font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 700;
  display: flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 9px;
}
.brk-score.win { background: rgba(0,135,90,0.12); }
.brk-row.win { opacity: 1; }
.brk-row.win .brk-team-name { font-weight: 800; }
.brk-row.win .brk-score { font-weight: 800; color: #00875a; }
.brk-pens { font-size: 10.5px; font-weight: 600; opacity: 0.75; }
.brk-win-check { color: #00875a; }

/* Below the desktop breakpoint a column is the full viewport width
   (see .brk-col above), so any side padding here would leave the next
   card's edge visibly bleeding in, cut off mid-text — no side padding
   on mobile; the nav buttons instead float on top of the card edges
   (blurred backdrop so they stay legible over whatever's under them)
   rather than living in a reserved gutter. */
@media (max-width: 719px) {
  .brk-track { padding: 0; gap: 0; }
  .brk-nav {
    background: rgba(242,237,230,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }
  [data-theme="paper"] .brk-nav { background: rgba(255,255,255,0.75); }
  .brk-nav.prev { left: 8px; }
  .brk-nav.next { right: 8px; }
}
`;
