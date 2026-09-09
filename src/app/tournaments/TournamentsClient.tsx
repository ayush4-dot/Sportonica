"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Star, Check, Trophy, Users } from "lucide-react";
import type { TournamentBrowseItem } from "@/lib/play/tournaments";
import CardShareButton from "@/components/tournaments/CardShareButton";
import "./tournament-cards.css";

const KTM = "Asia/Kathmandu";

function when(iso: string | null) {
  if (!iso) return "Date TBD";
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
    <div className="play tourn-page">
      <div className="play-wrap">
        <div className="play-hero">
          <h1>Tournaments <em>& events.</em></h1>
          <p>
            Register a team or book a spot, and pay online
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
              const completed = item.kind === "tournament" && item.completed;
              const hasImg = item.bannerUrl && /^https?:\/\//i.test(item.bannerUrl);
              // The "Completed" chip above already says the status — repeating
              // the word here instead of the actual date it happened is just
              // noise. Showing when it happened is more useful either way.
              const dateLabel = when(item.when);
              return (
                <Link
                  key={`${item.kind}-${item.id}`} href={href} className="tc-card"
                  data-completed={completed} style={{ ["--tc-accent" as string]: item.sportColor }}
                >
                  <div className="tc-media">
                    {hasImg ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="tc-media-bg" src={item.bannerUrl!} alt="" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="tc-media-fg" src={item.bannerUrl!} alt="" loading="lazy" />
                      </>
                    ) : (
                      <div className="tc-media-empty"><Trophy size={30} /></div>
                    )}
                    <span className={`tc-status${completed ? " done" : ""}`}>
                      {completed
                        ? <><Check size={11} /> Completed</>
                        : item.kind === "tournament"
                        ? <><Trophy size={11} /> Tournament</>
                        : item.badge === "platform" ? <><Star size={11} /> Sportonica</> : <><Check size={11} /> Official</>}
                    </span>
                    <CardShareButton href={href} title={`${item.title} · Sportonica`} />
                  </div>

                  <div className="tc-body">
                    <span className="tc-sport">{item.sport}</span>
                    <h3 className="tc-title">{item.title}</h3>
                    {item.organizerName && <div className="tc-org">by {item.organizerName}</div>}

                    <div className="tc-loc"><MapPin size={13} /><span>{item.venue}</span></div>
                    <div className={`tc-date${!item.when ? " tbd" : ""}`}>{dateLabel}</div>

                    <div className="tc-foot">
                      {item.kind === "tournament"
                        ? <span className="tc-foot-meta"><Users size={13} /> {item.maxTeams == null ? "Unlimited teams" : `Up to ${item.maxTeams} teams`}</span>
                        : <span className="tc-foot-meta"><Users size={13} /> {item.slotsRemaining} spots left</span>}
                      <span className={`tc-foot-price${item.fee === 0 ? " free" : ""}`}>{item.fee === 0 ? "Free" : `Rs ${item.fee}`}</span>
                    </div>
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
      `}</style>
    </div>
  );
}
