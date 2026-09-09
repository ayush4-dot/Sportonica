"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, MapPin, CalendarDays, Trophy, User, Loader2, ArrowRight, CornerDownLeft } from "lucide-react";
import { searchEverything, type SearchHit, type SearchResults } from "@/lib/search/actions";

const KIND_ICON = {
  venue: <MapPin size={15} />,
  game: <CalendarDays size={15} />,
  tournament: <Trophy size={15} />,
  player: <User size={15} />,
} as const;

const GROUPS: { key: keyof Pick<SearchResults, "venues" | "games" | "tournaments" | "players">; label: string }[] = [
  { key: "venues", label: "Venues" },
  { key: "games", label: "Games" },
  { key: "tournaments", label: "Tournaments" },
  { key: "players", label: "Players" },
];

function flatten(r: SearchResults | null): SearchHit[] {
  if (!r) return [];
  return [...r.venues, ...r.games, ...r.tournaments, ...r.players];
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // ⌘K / Ctrl-K anywhere, and "/" when not already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); setOpen((v) => !v); return; }
      if (k === "/" && !open) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
        e.preventDefault(); setOpen(true);
      }
      if (k === "escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => { document.body.style.overflow = ""; clearTimeout(t); };
    }
  }, [open]);

  // Debounced search. reqId guards against a slow earlier response
  // landing after a faster later one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    const mine = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchEverything(term);
        if (mine === reqId.current) { setRes(r); setActive(0); }
      } finally {
        if (mine === reqId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const close = useCallback(() => { setOpen(false); setQ(""); setRes(null); }, []);

  const go = useCallback((hit: SearchHit) => {
    close();
    router.push(hit.href);
  }, [close, router]);

  const seeAll = useCallback(() => {
    const term = q.trim();
    close();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }, [q, close, router]);

  const hits = flatten(res);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[active]) go(hits[active]);
      else if (q.trim()) seeAll();
    }
  }

  let runningIndex = -1;

  return (
    <>
      <button className="gs-trigger" onClick={() => setOpen(true)} aria-label="Search">
        <Search size={16} />
        <span className="gs-trigger-txt">Search</span>
        <kbd className="gs-kbd">⌘K</kbd>
      </button>

      {open && (
        <div className="gs-scrim" onMouseDown={close}>
          <div className="gs-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
            <div className="gs-bar">
              <Search size={18} className="gs-bar-ic" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search venues, games, tournaments, players…"
                aria-label="Search query"
              />
              {loading ? <Loader2 size={16} className="gs-spin" /> : q && (
                <button className="gs-clear" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear">
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="gs-body">
              {q.trim().length < 2 ? (
                <p className="gs-hint">Type at least 2 characters. <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>↵</kbd> to open.</p>
              ) : !loading && hits.length === 0 ? (
                <p className="gs-hint">No matches for “{q.trim()}”.</p>
              ) : (
                GROUPS.map(({ key, label }) => {
                  const group = res?.[key] ?? [];
                  if (!group.length) return null;
                  return (
                    <div className="gs-group" key={key}>
                      <p className="gs-group-h">{label}</p>
                      {group.map((hit) => {
                        runningIndex += 1;
                        const idx = runningIndex;
                        return (
                          <button
                            key={hit.kind + hit.id}
                            className={`gs-row ${idx === active ? "on" : ""}`}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => go(hit)}
                          >
                            <span className="gs-row-ic" style={hit.color ? { color: hit.color, background: `${hit.color}1f` } : undefined}>
                              {KIND_ICON[hit.kind]}
                            </span>
                            <span className="gs-row-txt">
                              <span className="gs-row-title">{hit.title}</span>
                              <span className="gs-row-sub">{hit.subtitle}</span>
                            </span>
                            <ArrowRight size={14} className="gs-row-arrow" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {q.trim().length >= 2 && hits.length > 0 && (
              <button className="gs-seeall" onClick={seeAll}>
                See all results for “{q.trim()}”
                <span className="gs-seeall-k"><CornerDownLeft size={13} /></span>
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        /* Ghosted to match the header's icon buttons (.ah-btn): no fill,
           the same hairline border and green hover, text and shortcut
           carried at low opacity so it reads as chrome, not a form field. */
        .gs-trigger {
          display: inline-flex; align-items: center; gap: 8px;
          height: 42px; padding: 0 8px 0 14px; border-radius: 999px;
          font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
          border: 1px solid rgba(20,23,30,.14); background: transparent;
          color: inherit; white-space: nowrap;
          transition: border-color .2s ease, transform .15s ease;
        }
        :root:not([data-theme="paper"]) .gs-trigger { border-color: rgba(242,237,230,.16); }
        .gs-trigger svg { opacity: .7; }
        .gs-trigger:hover { transform: translateY(-1px); border-color: rgba(0,98,65,.55); }
        .gs-trigger:hover svg { opacity: 1; }
        .gs-trigger-txt { opacity: .6; }
        .gs-trigger:hover .gs-trigger-txt { opacity: .9; }
        .gs-kbd {
          font-family: inherit; font-size: 10px; font-weight: 700; letter-spacing: .04em; line-height: 1;
          padding: 3px 6px 2px; border-radius: 6px;
          border: 1px solid currentColor; background: transparent; color: inherit; opacity: .32;
        }
        .gs-trigger:hover .gs-kbd { opacity: .5; }

        .gs-scrim {
          position: fixed; inset: 0; z-index: 600;
          background: rgba(6,8,11,.5); backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 12vh 16px 16px; animation: gsFade .16s ease both;
        }
        @keyframes gsFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes gsPop { from { opacity: 0; transform: translateY(-8px) scale(.98) } to { opacity: 1; transform: none } }

        .gs-panel {
          width: 100%; max-width: 560px; border-radius: 18px; overflow: hidden;
          background: #faf7f2; color: #14171E;
          border: 1px solid rgba(20,23,30,.12);
          box-shadow: 0 32px 80px -24px rgba(0,0,0,.55), 0 4px 12px -6px rgba(0,0,0,.3);
          display: flex; flex-direction: column; max-height: 72vh;
          animation: gsPop .2s cubic-bezier(.22,1,.36,1) both;
        }
        :root:not([data-theme="paper"]) .gs-panel {
          background: #12151b; color: #F2EDE6; border-color: rgba(242,237,230,.12);
        }

        .gs-bar {
          display: flex; align-items: center; gap: 11px; padding: 15px 16px;
          border-bottom: 1px solid rgba(20,23,30,.09);
        }
        :root:not([data-theme="paper"]) .gs-bar { border-bottom-color: rgba(242,237,230,.1); }
        .gs-bar-ic { opacity: .45; flex-shrink: 0; }
        .gs-bar input {
          flex: 1; min-width: 0; border: none; outline: none; background: transparent;
          font-family: inherit; font-size: 16px; font-weight: 500; color: inherit;
        }
        .gs-bar input::placeholder { opacity: .4; }
        .gs-clear {
          border: none; background: rgba(20,23,30,.06); cursor: pointer; color: inherit;
          width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0;
        }
        :root:not([data-theme="paper"]) .gs-clear { background: rgba(242,237,230,.1); }
        .gs-spin { animation: gsSpin 1s linear infinite; opacity: .5; flex-shrink: 0; }
        @keyframes gsSpin { to { transform: rotate(360deg) } }

        .gs-body { overflow-y: auto; padding: 8px; flex: 1; }
        .gs-hint {
          padding: 30px 16px; text-align: center; font-size: 13px; opacity: .5; margin: 0;
          display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;
        }
        .gs-hint kbd {
          font-family: inherit; font-size: 10.5px; font-weight: 700; padding: 1px 5px;
          border-radius: 5px; border: 1px solid rgba(20,23,30,.2); background: rgba(20,23,30,.05);
        }
        :root:not([data-theme="paper"]) .gs-hint kbd { border-color: rgba(242,237,230,.2); background: rgba(242,237,230,.06); }

        .gs-group { margin-bottom: 6px; }
        .gs-group-h {
          font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
          opacity: .42; margin: 8px 10px 4px;
        }
        .gs-row {
          display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
          padding: 9px 10px; border-radius: 11px; border: none; background: none; cursor: pointer;
          color: inherit; font-family: inherit;
        }
        .gs-row.on { background: rgba(0,98,65,.1); }
        .gs-row-ic {
          width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
          display: grid; place-items: center;
          background: rgba(20,23,30,.06); color: rgba(20,23,30,.6);
        }
        :root:not([data-theme="paper"]) .gs-row-ic { background: rgba(242,237,230,.08); color: rgba(242,237,230,.6); }
        .gs-row-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .gs-row-title { font-size: 14px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gs-row-sub { font-size: 12px; opacity: .55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gs-row-arrow { opacity: 0; flex-shrink: 0; }
        .gs-row.on .gs-row-arrow { opacity: .5; }

        .gs-seeall {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; border: none; cursor: pointer; font-family: inherit;
          padding: 13px 16px; font-size: 13px; font-weight: 700; color: #006241;
          background: rgba(0,98,65,.08); border-top: 1px solid rgba(0,98,65,.16);
        }
        .gs-seeall:hover { background: rgba(0,98,65,.14); }
        .gs-seeall-k { display: inline-flex; padding: 3px; border-radius: 6px; background: rgba(0,98,65,.16); }

        @media (max-width: 560px) {
          .gs-trigger-txt, .gs-kbd { display: none; }
          .gs-trigger { width: 42px; padding: 0; justify-content: center; }
          .gs-scrim { padding: 0; align-items: stretch; }
          .gs-panel { max-width: none; border-radius: 0; max-height: 100dvh; height: 100dvh; }
        }
      `}</style>
    </>
  );
}
