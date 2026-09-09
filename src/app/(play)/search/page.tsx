"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, X, MapPin, CalendarDays, Trophy, User, Loader2 } from "lucide-react";
import { searchEverything, type SearchHit, type SearchResults } from "@/lib/search/actions";

const KIND_ICON = {
  venue: <MapPin size={16} />,
  game: <CalendarDays size={16} />,
  tournament: <Trophy size={16} />,
  player: <User size={16} />,
} as const;

type Tab = "all" | "venues" | "games" | "tournaments" | "players";
const TABS: { k: Tab; label: string }[] = [
  { k: "all", label: "All" },
  { k: "venues", label: "Venues" },
  { k: "games", label: "Games" },
  { k: "tournaments", label: "Tournaments" },
  { k: "players", label: "Players" },
];

function Row({ hit }: { hit: SearchHit }) {
  return (
    <Link href={hit.href} className="sr-row">
      <span className="sr-ic" style={hit.color ? { color: hit.color, background: `${hit.color}1f` } : undefined}>
        {KIND_ICON[hit.kind]}
      </span>
      <span className="sr-txt">
        <span className="sr-title">{hit.title}</span>
        <span className="sr-sub">{hit.subtitle}</span>
      </span>
    </Link>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const reqId = useRef(0);

  // Keep the URL in sync so the search is shareable / back-navigable.
  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim();
      const next = term ? `/search?q=${encodeURIComponent(term)}` : "/search";
      router.replace(next, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [q, router]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    const mine = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchEverything(term, 24);
        if (mine === reqId.current) setRes(r);
      } finally {
        if (mine === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    if (!res) return [];
    const all: { key: Tab; label: string; hits: SearchHit[] }[] = [
      { key: "venues", label: "Venues", hits: res.venues },
      { key: "games", label: "Games", hits: res.games },
      { key: "tournaments", label: "Tournaments", hits: res.tournaments },
      { key: "players", label: "Players", hits: res.players },
    ];
    return tab === "all" ? all.filter((g) => g.hits.length) : all.filter((g) => g.key === tab);
  }, [res, tab]);

  const count = (k: Tab) => {
    if (!res) return 0;
    if (k === "all") return res.total;
    return res[k].length;
  };

  return (
    <div className="play">
      <div className="play-wrap">
        <h1 className="sr-h1">Search</h1>

        <div className="sr-bar">
          <Search size={18} className="sr-bar-ic" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Venues, games, tournaments, players…"
            aria-label="Search"
          />
          {loading ? <Loader2 size={16} className="sr-spin" /> : q && (
            <button className="sr-clear" onClick={() => setQ("")} aria-label="Clear"><X size={15} /></button>
          )}
        </div>

        {res && res.total > 0 && (
          <div className="sr-tabs">
            {TABS.map(({ k, label }) => (
              <button key={k} className={`sr-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                {label}{count(k) > 0 && <span className="sr-tab-n">{count(k)}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="sr-results">
          {q.trim().length < 2 ? (
            <p className="sr-empty">Type at least 2 characters to search.</p>
          ) : loading && !res ? (
            <p className="sr-empty">Searching…</p>
          ) : res && res.total === 0 ? (
            <p className="sr-empty">Nothing matched “{q.trim()}”. Try a venue name, a sport, or a player.</p>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="sr-group">
                <h2 className="sr-group-h">{g.label} · {g.hits.length}</h2>
                {g.hits.length === 0
                  ? <p className="sr-empty sm">No {g.label.toLowerCase()}.</p>
                  : g.hits.map((hit) => <Row key={hit.kind + hit.id} hit={hit} />)}
              </section>
            ))
          )}
        </div>
      </div>

      <style>{`
        .sr-h1 { font-family: 'Inter', sans-serif; font-size: clamp(26px, 4vw, 38px); font-weight: 800; letter-spacing: -0.03em; margin: 0 0 16px; }
        .sr-bar {
          display: flex; align-items: center; gap: 11px; padding: 14px 16px; border-radius: 14px;
          border: 1px solid rgba(20,23,30,.14); background: #fff;
        }
        :root:not([data-theme="paper"]) .sr-bar { background: rgba(255,255,255,.04); border-color: rgba(242,237,230,.14); }
        .sr-bar-ic { opacity: .45; flex-shrink: 0; }
        .sr-bar input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: inherit; font-family: inherit; font-size: 16px; }
        .sr-bar input::placeholder { opacity: .4; }
        .sr-clear { border: none; background: rgba(20,23,30,.06); cursor: pointer; color: inherit; width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0; }
        .sr-spin { animation: srSpin 1s linear infinite; opacity: .5; flex-shrink: 0; }
        @keyframes srSpin { to { transform: rotate(360deg) } }

        .sr-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin: 16px 0 4px; }
        .sr-tab {
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-family: inherit;
          padding: 7px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 700;
          border: 1px solid rgba(20,23,30,.14); background: transparent; color: inherit;
        }
        :root:not([data-theme="paper"]) .sr-tab { border-color: rgba(242,237,230,.14); }
        .sr-tab.on { background: #006241; border-color: #006241; color: #fff; }
        .sr-tab-n { font-size: 11px; opacity: .7; }
        .sr-tab.on .sr-tab-n { opacity: .85; }

        .sr-results { margin-top: 18px; }
        .sr-group { margin-bottom: 26px; }
        .sr-group-h { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; opacity: .45; margin: 0 0 8px; }
        .sr-empty { padding: 40px 8px; text-align: center; font-size: 14px; opacity: .55; }
        .sr-empty.sm { padding: 12px 8px; font-size: 13px; text-align: left; }

        .sr-row {
          display: flex; align-items: center; gap: 13px; padding: 12px; border-radius: 13px;
          text-decoration: none; color: inherit; transition: background .15s;
        }
        .sr-row:hover { background: rgba(0,98,65,.08); }
        .sr-ic {
          width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center;
          background: rgba(20,23,30,.06); color: rgba(20,23,30,.6);
        }
        :root:not([data-theme="paper"]) .sr-ic { background: rgba(242,237,230,.08); color: rgba(242,237,230,.6); }
        .sr-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sr-title { font-size: 14.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sr-sub { font-size: 12.5px; opacity: .55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="play"><div className="play-wrap" style={{ padding: "40px 0", opacity: .5 }}>Loading…</div></div>}>
      <SearchInner />
    </Suspense>
  );
}
