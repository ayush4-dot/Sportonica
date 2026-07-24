"use client";

import Link from "next/link";
import { useRef } from "react";
import { MapPin, Users, ChevronLeft, ChevronRight, ImageIcon, ShieldCheck, Star, Check } from "lucide-react";
import { sportColor } from "@/lib/sports";
import type { RailEvent, RailVenue } from "@/lib/play/homeRails";

const KTM = "Asia/Kathmandu";

function when(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: KTM });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM });
  if (key(d) === key(new Date())) return `Tonight · ${time}`;
  if (key(d) === key(new Date(Date.now() + 864e5))) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM })} · ${time}`;
}

/** Shared shell: title, "see all" link, arrows, horizontal scroller. */
function Rail({
  title, sub, href, hrefLabel, children,
}: {
  title: string; sub?: string; href: string; hrefLabel: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const nudge = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <section className="rail">
      <div className="rail-head">
        <div>
          <h2 className="rail-t">{title}</h2>
          {sub && <p className="rail-s">{sub}</p>}
        </div>
        <div className="rail-ctl">
          <button onClick={() => nudge(-1)} aria-label="Scroll left"><ChevronLeft size={16} /></button>
          <button onClick={() => nudge(1)} aria-label="Scroll right"><ChevronRight size={16} /></button>
          <Link href={href} className="rail-all">{hrefLabel} →</Link>
        </div>
      </div>
      <div className="rail-scroll" ref={ref}>{children}</div>
    </section>
  );
}

export function EventsRail({ events }: { events: RailEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Rail
      title="Official events"
      sub="Tournaments and organised nights, run by venues and by us."
      href="/discover" hrefLabel="See all events"
    >
      {events.map((e) => {
        const c = e.sport_color ?? sportColor(e.sport);
        const platform = e.event_type === "platform_event";
        return (
          <Link key={e.id} href={`/game/${e.id}`} className="rc rc-event" style={{ ["--rc-accent" as string]: c }}>
            <div className="rc-badge" style={{
              color: platform ? "#FFC93C" : "#2E7D5B",
              borderColor: platform ? "rgba(255,201,60,.4)" : "rgba(46,125,91,.4)",
              background: platform ? "rgba(255,201,60,.12)" : "rgba(46,125,91,.12)",
            }}>
              {platform ? <><Star size={10} /> Khelam Na</> : <><Check size={10} /> Official</>}
            </div>
            <div className="rc-sport" style={{ color: c }}>{e.sport}</div>
            <div className="rc-title">{e.title}</div>
            {e.organizer_name && <div className="rc-by">by {e.organizer_name}</div>}
            <div className="rc-meta"><MapPin size={11} /> {e.venue}</div>
            <div className="rc-when">{when(e.event_date)}</div>
            <div className="rc-foot">
              <span style={{ color: c }}>{e.slots_remaining} spots left</span>
              <span>{Number(e.fee) === 0 ? "Free" : `Rs ${e.fee}`}</span>
            </div>
          </Link>
        );
      })}
    </Rail>
  );
}

export function VenuesRail({ venues }: { venues: RailVenue[] }) {
  if (venues.length === 0) return null;
  return (
    <Rail
      title="Grounds to book"
      sub="Verified courts across Kathmandu, bookable by the hour."
      href="/create" hrefLabel="See all grounds"
    >
      {venues.map((v) => {
        const photo = v.photos?.[0];
        return (
          <Link key={v.id} href={`/create/${v.id}`} className="rc rc-venue" style={{ ["--rc-accent" as string]: sportColor(v.sports?.[0]) }}>
            <div className="rc-img">
              {photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={photo} alt={v.name} loading="lazy" />
                : <div className="rc-img-empty"><ImageIcon size={24} /></div>}
            </div>
            <div className="rc-title">{v.name}</div>
            <div className="rc-meta">{(v.sports ?? []).slice(0, 3).join(" · ") || v.venue_type}</div>
            <div className="rc-foot">
              <span>{v.address ?? "Kathmandu"}</span>
              {v.from_price && <span style={{ color: "#FFC93C" }}>from Rs {v.from_price}/hr</span>}
            </div>
          </Link>
        );
      })}
    </Rail>
  );
}

export function GamesRail({ games }: { games: RailEvent[] }) {
  if (games.length === 0) return null;
  return (
    <Rail
      title="Games to join"
      sub="Someone booked a court and needs players. Take a spot."
      href="/discover" hrefLabel="See all games"
    >
      {games.map((g) => {
        const c = g.sport_color ?? sportColor(g.sport);
        return (
          <Link key={g.id} href={`/game/${g.id}`} className="rc rc-game" style={{ ["--rc-accent" as string]: c }}>
            <div className="rc-sport" style={{ color: c }}>{g.sport}</div>
            <div className="rc-title">{g.title}</div>
            <div className="rc-host">
              <span className="rc-av">
                {g.host_avatar && /\.(jpe?g|png|gif|webp)$/i.test(g.host_avatar)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={g.host_avatar} alt="" />
                  : (g.host_name ?? "H").charAt(0).toUpperCase()}
              </span>
              {g.host_name ?? "Host"}
              <span className="rc-trust"><ShieldCheck size={9} /> {g.host_trust ?? 50}</span>
            </div>
            <div className="rc-meta"><MapPin size={11} /> {g.venue}</div>
            <div className="rc-when">{when(g.event_date)}</div>
            <div className="rc-foot">
              <span><Users size={11} /> {g.slots_remaining} left</span>
              <span>{Number(g.fee) === 0 ? "Free" : `Rs ${g.fee}`}</span>
            </div>
          </Link>
        );
      })}
    </Rail>
  );
}
