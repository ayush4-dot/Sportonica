"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TournamentMatch, TournamentTeam } from "@/lib/tournaments/types";

const DONE_STATUSES = new Set(["completed", "walkover", "cancelled"]);

// Premium, broadcast-graphic style knockout bracket — round columns
// flowing left to right with elbow connectors between a match and
// whatever it feeds into. Uses the same card/border/dim-text tokens as
// the rest of the tournament page (ev2-card, ev2-srow, ev2-status-pill
// in event-tabs.css) and adapts to the site's "paper" theme just like
// everything around it — no separately-themed panel.
//
// Layout is computed in JS, not measured off the DOM: round 0's cards
// are evenly spaced, and every later match is centered on the average
// y of whichever earlier matches point into it via next_match_id/
// next_match_slot. That's an exact tree only when the bracket came out
// of "Generate bracket" (which sets that linkage); a hand-built bracket
// without it still gets a sane fallback (evenly spaced, doubling the
// gap each round) and simply skips drawing a connector for that match.

const CARD_W = 268;
const CARD_H = 104;
const ROUND_GAP = 64;
const BASE_ROW_GAP = 22;
const KTM = "Asia/Kathmandu";

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

function layout(knockout: TournamentMatch[]) {
  const rounds = [...new Set(knockout.map((m) => m.round))].sort((a, b) => a - b);
  const byRound = rounds.map((r) =>
    knockout.filter((m) => m.round === r).sort((a, b) => a.created_at.localeCompare(b.created_at))
  );
  const positions = new Map<string, number>();
  const rowStep = CARD_H + BASE_ROW_GAP;

  byRound.forEach((ms, ri) => {
    ms.forEach((m, i) => {
      if (ri === 0) {
        positions.set(m.id, i * rowStep + CARD_H / 2);
        return;
      }
      const feeders = byRound[ri - 1].filter((pm) => pm.next_match_id === m.id);
      if (feeders.length > 0) {
        const ys = feeders.map((f) => positions.get(f.id)!);
        positions.set(m.id, ys.reduce((a, b) => a + b, 0) / ys.length);
      } else {
        const spacing = rowStep * 2 ** ri;
        positions.set(m.id, i * spacing + spacing / 2);
      }
    });
  });

  const height = Math.max(
    rowStep,
    ...byRound.flatMap((ms) => ms.map((m) => positions.get(m.id)! + CARD_H / 2 + BASE_ROW_GAP))
  );

  return { rounds, byRound, positions, height };
}

export default function BracketBoard({ matches, team, onMatchClick, emptyLabel = "No knockout matches added yet." }: {
  matches: TournamentMatch[];
  team: (id: string | null) => TournamentTeam | undefined;
  onMatchClick?: (m: TournamentMatch) => void;
  emptyLabel?: string;
}) {
  const knockout = matches.filter((m) => m.stage === "knockout");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colStep = CARD_W + ROUND_GAP;

  const { rounds, byRound, positions, height } = layout(knockout);

  // Which round the board is currently "on" — drives the prev/next
  // buttons so one tap moves a whole round at a time (Round of 16 ->
  // Quarter-finals, not just a card-width nudge), and stays in sync if
  // the visitor swipes/scrolls by hand instead of using the buttons.
  //
  // Lands one round *before* the interesting one (not aligned exactly
  // to its left edge) so that round shows together with whatever led
  // into it, rather than alone with its lead-in scrolled out of view —
  // a completed bracket opens on Semifinal+Final visible together, not
  // Final by itself.
  const [round, setRound] = useState(() => {
    const i = byRound.findIndex((ms) => ms.some((m) => !DONE_STATUSES.has(m.status)));
    const landing = i === -1 ? Math.max(0, byRound.length - 1) : i;
    return Math.max(0, landing - 1);
  });

  // A round with a lot of matches (Round of 32, say) needs a lot of
  // vertical room to keep every card readably spaced — but that means
  // the shared coordinate space every round sits in is that tall too,
  // so a later round with only one or two matches (Semifinal, Final)
  // ends up floating far down an otherwise-empty column. Vertically
  // centering on whichever round is current — not just paging left to
  // right — is what actually fixes that, instead of merely capping the
  // container and leaving the emptiness to scroll through.
  function centerYFor(ri: number): number {
    const ms = byRound[ri];
    if (!ms || ms.length === 0) return 0;
    const ys = ms.map((m) => positions.get(m.id)!);
    return (Math.min(...ys) + Math.max(...ys)) / 2;
  }

  // The state above only tracks *which* round is "current" — it doesn't
  // by itself move the scroll container. Apply it once, before paint,
  // so the board actually opens there (both horizontally and vertically
  // centered on it) instead of always at round 0's top-left.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = round * colStep;
    el.scrollTop = Math.max(0, centerYFor(round) - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (knockout.length === 0) return <div className="brk-empty">{emptyLabel}</div>;
  const safeRound = Math.min(Math.max(round, 0), rounds.length - 1);

  function goToRound(target: number) {
    const clamped = Math.min(Math.max(target, 0), rounds.length - 1);
    setRound(clamped);
    const el = scrollRef.current;
    if (!el) return;
    const top = Math.max(0, centerYFor(clamped) - el.clientHeight / 2);
    el.scrollTo({ left: clamped * colStep, top, behavior: "smooth" });
  }

  function onScroll() {
    if (!scrollRef.current) return;
    const nearest = Math.round(scrollRef.current.scrollLeft / colStep);
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
      <div className="brk-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="brk-heads" style={{ width: rounds.length * CARD_W + (rounds.length - 1) * ROUND_GAP }}>
          {rounds.map((r, ri) => (
            <div key={r} className="brk-head" style={{ width: CARD_W }}>
              {byRound[ri][0]?.round_label ?? `Round ${r}`}
            </div>
          ))}
        </div>
        <div className="brk-board" style={{ height, width: rounds.length * CARD_W + (rounds.length - 1) * ROUND_GAP }}>
          {byRound.map((ms, ri) => (
            <div key={ri} className="brk-col" style={{ width: CARD_W, left: ri * (CARD_W + ROUND_GAP) }}>
              {ms.map((m, i) => (
                <MatchCard
                  key={m.id} match={m} team={team} y={positions.get(m.id)!}
                  isFinal={ri === rounds.length - 1}
                  delayMs={Math.min(i * 30, 240)}
                  onClick={onMatchClick ? () => onMatchClick(m) : undefined}
                />
              ))}
            </div>
          ))}
          {byRound.slice(0, -1).map((ms, ri) => (
            <svg
              key={`c${ri}`} className="brk-conn"
              style={{ left: ri * (CARD_W + ROUND_GAP) + CARD_W, width: ROUND_GAP, height }}
            >
              {ms.filter((m) => m.next_match_id && positions.has(m.next_match_id)).map((m) => {
                const y1 = positions.get(m.id)!;
                const y2 = positions.get(m.next_match_id!)!;
                const midX = ROUND_GAP / 2;
                return (
                  <path
                    key={m.id} d={`M0,${y1} H${midX} V${y2} H${ROUND_GAP}`}
                    className={`brk-conn-path${m.winner_team_id ? " decided" : ""}`}
                  />
                );
              })}
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match: m, team, y, isFinal, delayMs = 0, onClick }: {
  match: TournamentMatch;
  team: (id: string | null) => TournamentTeam | undefined;
  y: number;
  isFinal: boolean;
  delayMs?: number;
  onClick?: () => void;
}) {
  const a = team(m.team_a_id);
  const b = team(m.team_b_id);
  const decided = !!m.winner_team_id;
  const badge = statusBadge(m);
  const fallbackB = m.team_b_id ? "TBD" : m.status === "completed" ? "Bye" : "TBD";

  return (
    <div
      className={`brk-card${isFinal ? " final" : ""}${onClick ? " clickable" : ""}`}
      style={{ top: y - CARD_H / 2, animationDelay: `${delayMs}ms` }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="brk-card-head">
        <span className="brk-date">{cardDate(m)}</span>
        <span className={`brk-badge ${badge.cls}`}>{badge.cls === "live" && <i className="brk-live-dot" />}{badge.label}</span>
      </div>
      <BracketRow team={a} fallback="TBD" score={m.score_a} pens={m.score_a_pens} winner={decided && m.winner_team_id === m.team_a_id} loser={decided && m.winner_team_id !== m.team_a_id && !!m.team_a_id} />
      <BracketRow team={b} fallback={fallbackB} score={m.score_b} pens={m.score_b_pens} winner={decided && m.winner_team_id === m.team_b_id} loser={decided && m.winner_team_id !== m.team_b_id && !!m.team_b_id} />
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
  return (
    <div className={`brk-row${winner ? " win" : ""}${loser ? " lose" : ""}`}>
      <span className="brk-crest">
        {t?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.logo_url} alt="" />
          : name.charAt(0).toUpperCase()}
      </span>
      <span className="brk-team-name">{name}</span>
      <span className="brk-score">
        {score ?? "–"}
        {pens != null && <span className="brk-pens">({pens})</span>}
      </span>
      {winner && <span className="brk-win-tick">◀</span>}
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

.brk-nav {
  position: absolute; top: 46px; z-index: 5;
  width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center;
  background: rgba(242,237,230,0.06); border: 1px solid rgba(242,237,230,0.14); color: inherit; cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
[data-theme="paper"] .brk-nav { background: #fff; border-color: rgba(20,23,30,0.14); box-shadow: 0 1px 4px rgba(20,23,30,0.06); }
.brk-nav:hover { background: rgba(0,135,90,0.14); border-color: rgba(0,135,90,0.4); }
.brk-nav.prev { left: -4px; }
.brk-nav.next { right: -4px; }

/* Capped and internally scrollable (both axes) rather than however
   tall the tallest round happens to be — a Round-of-32 column needs a
   lot of vertical room to stay readable, but that shouldn't force the
   whole page to scroll past a screenful of empty space just to reach
   Semifinal/Final, which only have one or two cards. goToRound() keeps
   whichever round is current vertically centered inside this box. */
.brk-scroll {
  overflow: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding: 0 20px;
  max-height: 68vh; scroll-behavior: smooth;
}
@media (min-width: 900px) { .brk-scroll { max-height: 580px; } }
.brk-heads {
  display: flex; gap: 64px; margin-bottom: 16px; position: sticky; top: 0; left: 0; z-index: 3;
  padding-top: 2px; background: rgba(20,23,30,0.55); backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
}
[data-theme="paper"] .brk-heads { background: rgba(255,255,255,0.78); }
.brk-head {
  flex-shrink: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.2px;
  padding-bottom: 10px; border-bottom: 1px solid rgba(242,237,230,0.12);
}
[data-theme="paper"] .brk-head { border-bottom-color: rgba(20,23,30,0.1); }
.brk-board { position: relative; }
.brk-col { position: absolute; top: 0; }
.brk-conn { position: absolute; top: 0; pointer-events: none; overflow: visible; }
.brk-conn-path { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: 0.16; }
.brk-conn-path.decided { opacity: 0.28; }

@keyframes brkCardIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.brk-card {
  position: absolute; left: 0; width: 100%; height: 104px; box-sizing: border-box;
  animation: brkCardIn .32s cubic-bezier(.22,1,.36,1) backwards;
  padding: 10px 12px 8px; border-radius: 14px;
  background: rgba(242,237,230,0.035); border: 1px solid rgba(242,237,230,0.09);
  display: flex; flex-direction: column; gap: 6px;
  transition: background .15s ease, border-color .15s ease, transform .15s ease;
}
[data-theme="paper"] .brk-card { background: #fff; border-color: rgba(20,23,30,0.08); box-shadow: 0 1px 4px rgba(20,23,30,0.05); }
.brk-card.clickable { cursor: pointer; }
.brk-card.clickable:hover { border-color: rgba(0,135,90,0.35); transform: translateY(-1px); }
.brk-card.final { border-color: rgba(0,135,90,0.4); box-shadow: 0 0 0 1px rgba(0,135,90,0.12); }

.brk-card-head { display: flex; align-items: center; justify-content: space-between; }
.brk-date { font-size: 11px; font-weight: 600; opacity: 0.55; }
.brk-badge {
  font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 3px 8px; border-radius: 999px;
  background: rgba(128,128,128,0.16); opacity: 0.75; display: inline-flex; align-items: center; gap: 5px;
}
.brk-badge.live { background: rgba(229,72,77,0.16); color: #E5484D; opacity: 1; }
.brk-badge.upcoming { background: rgba(0,135,90,0.12); color: #00875a; opacity: 1; }
[data-theme="paper"] .brk-badge.upcoming { color: #006241; }
.brk-badge.pp, .brk-badge.cancel { background: rgba(217,119,6,0.14); color: #d97706; opacity: 1; }
.brk-live-dot { width: 5px; height: 5px; border-radius: 999px; background: #E5484D; animation: brkpulse 1.4s infinite; }
@keyframes brkpulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

.brk-row { display: flex; align-items: center; gap: 8px; min-width: 0; opacity: 0.55; }
.brk-crest {
  width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
  display: grid; place-items: center; font-size: 10px; font-weight: 800;
  background: rgba(0,135,90,0.14); border: 1px solid rgba(0,135,90,0.28); color: #00875a;
}
.brk-crest img { width: 100%; height: 100%; object-fit: cover; }
.brk-team-name {
  flex: 1 1 auto; min-width: 0; font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.brk-score {
  flex-shrink: 0; font-variant-numeric: tabular-nums; font-size: 13.5px; font-weight: 700;
  display: flex; align-items: baseline; gap: 3px;
}
.brk-row.win { opacity: 1; }
.brk-row.win .brk-team-name, .brk-row.win .brk-score { font-weight: 800; }
.brk-pens { font-size: 10.5px; font-weight: 600; opacity: 0.75; }
.brk-win-tick { color: #00875a; font-size: 9px; flex-shrink: 0; margin-left: 1px; }

.brk-nav:disabled { opacity: 0.35; cursor: default; pointer-events: none; }

@media (max-width: 640px) {
  .brk-nav { width: 30px; height: 30px; }
  .brk-nav.prev { left: 2px; }
  .brk-nav.next { right: 2px; }
  .brk-scroll { padding: 0 40px; }
}
`;
