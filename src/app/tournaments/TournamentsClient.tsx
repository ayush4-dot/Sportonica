"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Star, Check, Trophy, Users } from "lucide-react";
import type { TournamentBrowseItem } from "@/lib/play/tournaments";

const KTM = "Asia/Kathmandu";

function when(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: KTM });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
  if (key(d) === key(new Date())) return `Tonight · ${time}`;
  if (key(d) === key(new Date(Date.now() + 864e5))) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM })} · ${time}`;
}

export default function TournamentsClient({ items }: { items: TournamentBrowseItem[] }) {
  const [sport, setSport] = useState<string | null>(null);

  // Only offer sports that actually have something on right now — a
  // filter row full of empty options is worse than no filter at all.
  const sports = useMemo(
    () => Array.from(new Set(items.map((e) => e.sport))).sort(),
    [items]
  );
  const shown = sport ? items.filter((e) => e.sport === sport) : items;

  return (
    <div className="play">
      <div className="play-wrap">
        <div className="play-hero">
          <div className="play-eyebrow">Organised play</div>
          <h1>Tournaments <em>& events.</em></h1>
          <p>
            Run by venues and by Sportonica — register a team or book a spot, and pay online
            with eSewa, Khalti or bank transfer.
          </p>
        </div>

        {sports.length > 1 && (
          <div className="tourn-filters">
            <button
              className={`tourn-chip ${sport === null ? "on" : ""}`}
              onClick={() => setSport(null)}
            >
              All sports
            </button>
            {sports.map((s) => (
              <button
                key={s}
                className={`tourn-chip ${sport === s ? "on" : ""}`}
                onClick={() => setSport(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="play-empty">
            <Trophy size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h3>{items.length === 0 ? "No tournaments right now" : "No tournaments in that sport"}</h3>
            <p>
              {items.length === 0
                ? "Once a venue or Sportonica lists one, it'll show up here."
                : "Try a different sport, or check back soon."}
            </p>
          </div>
        ) : (
          <div className="tourn-grid">
            {shown.map((item) => {
              const href = item.kind === "tournament" ? `/tournaments/${item.id}` : `/game/${item.id}`;
              return (
                <Link key={`${item.kind}-${item.id}`} href={href} className="rc rc-event" style={{ ["--rc-accent" as string]: item.sportColor }}>
                  <div className="rc-badge" style={
                    item.kind === "tournament"
                      ? { color: "#006241", borderColor: "rgba(0,98,65,.4)", background: "rgba(0,98,65,.12)" }
                      : {
                          color: item.badge === "platform" ? "#006241" : "#2E7D5B",
                          borderColor: item.badge === "platform" ? "rgba(0,98,65,.4)" : "rgba(46,125,91,.4)",
                          background: item.badge === "platform" ? "rgba(0,98,65,.12)" : "rgba(46,125,91,.12)",
                        }
                  }>
                    {item.kind === "tournament"
                      ? <><Trophy size={10} /> Tournament</>
                      : item.badge === "platform" ? <><Star size={10} /> Sportonica</> : <><Check size={10} /> Official</>}
                  </div>
                  <div className="rc-sport" style={{ color: item.sportColor }}>{item.sport}</div>
                  <div className="rc-title">{item.title}</div>
                  {item.organizerName && <div className="rc-by">by {item.organizerName}</div>}
                  <div className="rc-meta"><MapPin size={11} /> {item.venue}</div>
                  <div className="rc-when">{when(item.when)}</div>
                  <div className="rc-foot">
                    {item.kind === "tournament"
                      ? <span style={{ color: item.sportColor, display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={11} /> Up to {item.maxTeams} teams</span>
                      : <span style={{ color: item.sportColor }}>{item.slotsRemaining} spots left</span>}
                    <span>{item.fee === 0 ? "Free" : `Rs ${item.fee}`}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .tourn-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
        .tourn-chip {
          padding: 9px 16px; border-radius: 999px; border: 1px solid var(--line);
          background: transparent; color: var(--dim); font-family: inherit; font-size: 13px;
          font-weight: 700; cursor: pointer; transition: all 0.2s ease;
        }
        .tourn-chip:hover { border-color: rgba(0,98,65,0.4); color: var(--paper); }
        .tourn-chip.on { border-color: #006241; color: #006241; background: rgba(0,98,65,0.12); }
        .tourn-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .tourn-grid .rc { flex: 0 1 272px; }
      `}</style>
    </div>
  );
}
