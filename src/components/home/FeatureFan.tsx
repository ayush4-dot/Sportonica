"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Compass, CalendarPlus, MessageCircle, ClipboardList, Users } from "lucide-react";
import type { ReactNode } from "react";

type Feature = {
  key: string;
  label: string;
  title: string;
  blurb: string;
  href?: string;
  color: string;
  img: string;
  icon: ReactNode;
};

const FEATURES: Feature[] = [
  {
    key: "play",
    label: "Play",
    title: "Find a game tonight",
    blurb: "Browse live games near you, filter by sport and time, and grab the last spot.",
    href: "/discover",
    color: "#2E7D5B",
    img: "/panels/play.jpg",
    icon: <Compass size={14} />,
  },
  {
    key: "book",
    label: "Book",
    title: "Reserve a court",
    blurb: "Real grounds, live availability, hourly slots — pay your share and play.",
    href: "/create",
    color: "#A78BFA",
    img: "/panels/book.jpg",
    icon: <CalendarPlus size={14} />,
  },
  {
    key: "host",
    label: "Host",
    title: "Run your own game",
    blurb: "Set the sport, the spots and the split. Invite your crew or let players join.",
    href: "/create",
    color: "#DE3163",
    img: "/panels/host.jpg",
    icon: <Users size={14} />,
  },
  {
    key: "chat",
    label: "Chat",
    title: "Keep your crew together",
    blurb: "Every game gets its own group. Sort the details, plan the next one.",
    href: "/league",
    color: "#a855f7",
    img: "/panels/chat.jpg",
    icon: <MessageCircle size={14} />,
  },
  {
    key: "games",
    label: "My games",
    title: "Everything in one place",
    blurb: "What you're hosting, what you've joined, and who's coming.",
    href: "/my-games",
    color: "#3b82f6",
    img: "/panels/mygames.jpg",
    icon: <ClipboardList size={14} />,
  },
];

const AUTOPLAY_MS = 4200;
const SWIPE_PX = 56;
const MAX_VISIBLE_OFFSET = 3;

export default function FeatureFan() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startX = useRef(0);
  const pointerId = useRef<number | null>(null);
  const pointerDown = useRef(false);
  const wheelCooldown = useRef(false);

  const goTo = useCallback((i: number) => {
    setActive(Math.max(0, Math.min(FEATURES.length - 1, i)));
  }, []);

  useEffect(() => {
    if (paused || dragging) return;
    const t = setInterval(() => {
      setActive((a) => (a + 1) % FEATURES.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, dragging]);

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    pointerId.current = e.pointerId;
    pointerDown.current = true;
    // Don't capture yet — a plain tap/click must still reach the card
    // or link underneath. Capture only kicks in once we confirm a drag.
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointerDown.current || pointerId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    if (!dragging) {
      if (Math.abs(dx) < 6) return;
      setDragging(true);
      setPaused(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDragX(dx);
  }
  function endDrag(e: React.PointerEvent) {
    if (!pointerDown.current || pointerId.current !== e.pointerId) return;
    pointerDown.current = false;
    if (dragging) {
      if (dragX <= -SWIPE_PX) goTo(active + 1);
      else if (dragX >= SWIPE_PX) goTo(active - 1);
      setDragging(false);
    }
    setDragX(0);
    pointerId.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    // Only hijack genuinely horizontal intent (trackpad swipe / shift+wheel) —
    // plain vertical scrolling must keep scrolling the page.
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    if (wheelCooldown.current) return;
    wheelCooldown.current = true;
    setPaused(true);
    goTo(active + (e.deltaX > 0 ? 1 : -1));
    setTimeout(() => { wheelCooldown.current = false; }, 380);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
    else if (e.key === "Enter") { const h = FEATURES[active].href; if (h) router.push(h); }
  }

  return (
    <div
      className="ff"
      role="region"
      aria-roledescription="carousel"
      aria-label="What you can do here"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="ff-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        {FEATURES.map((f, i) => {
          const raw = i - active;
          const dist = Math.abs(raw);
          if (dist > MAX_VISIBLE_OFFSET) return null;
          const drift = dragging ? dragX / 90 : 0;
          const offset = raw + drift;
          const adist = Math.abs(offset);
          const on = i === active;

          const x = offset * 128;
          const rotate = offset * 9;
          const y = adist * 16;
          const scale = Math.max(1 - adist * 0.1, 0.62);
          const opacity = dist > MAX_VISIBLE_OFFSET ? 0 : Math.max(1 - Math.max(dist - 1, 0) * 0.32, 0.22);
          const z = 100 - Math.round(adist * 10);

          return (
            <motion.div
              key={f.key}
              className={`ff-card ${on ? "on" : ""}`}
              style={{ ["--c" as string]: f.color, zIndex: z }}
              animate={{ x, y, rotate, scale, opacity }}
              whileHover={dragging ? undefined : { y: y - (on ? 10 : 14), scale: scale * (on ? 1.02 : 1.06) }}
              whileTap={dragging ? undefined : { scale: scale * 0.97 }}
              transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
              onClick={() => { if (!on) goTo(i); }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.img} alt="" className="ff-img" draggable={false} />
              <span className="ff-veil" />
              <span className="ff-tag"><span className="ff-ic">{f.icon}</span>{f.label}</span>

              <span className="ff-copy">
                <span className="ff-h">{f.title}</span>
                {on && <span className="ff-b">{f.blurb}</span>}
                {on && f.href && (
                  <Link href={f.href} className="ff-go" onClick={(e) => e.stopPropagation()}>
                    Go <ArrowRight size={13} />
                  </Link>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="ff-dots">
        {FEATURES.map((f, i) => (
          <button
            key={f.key}
            className={`ff-dot ${i === active ? "on" : ""}`}
            style={{ ["--c" as string]: f.color }}
            aria-label={`Show ${f.label}`}
            aria-current={i === active}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <style>{`
        .ff {
          position: relative; width: 100%;
          height: clamp(360px, 50vh, 460px);
          outline: none;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
        }
        .ff:focus-visible { -webkit-mask-image: none; mask-image: none; }

        .ff-stage {
          display: grid; place-items: center;
          width: 100%; height: calc(100% - 34px);
          touch-action: pan-y;
          user-select: none;
        }

        .ff-card {
          grid-area: 1 / 1;
          width: clamp(200px, 27vw, 300px);
          height: 100%;
          transform-origin: 50% 100%;
          border-radius: 26px;
          overflow: hidden;
          cursor: pointer;
          background: #0B0D11;
          box-shadow: 0 30px 60px -24px rgba(0,0,0,.65), inset 0 0 0 1px rgba(255,255,255,.06);
          will-change: transform, opacity;
        }
        .ff-card.on { cursor: default; box-shadow: 0 40px 80px -20px rgba(0,0,0,.7), inset 0 0 0 1.5px var(--c); }

        .ff-img {
          position: absolute; inset: -1px; width: calc(100% + 2px); height: calc(100% + 2px);
          object-fit: cover; pointer-events: none;
        }
        .ff-veil {
          position: absolute; inset: 0;
          background: linear-gradient(0deg, rgba(6,8,11,.92) 0%, rgba(6,8,11,.45) 42%, transparent 68%);
        }

        .ff-tag {
          position: absolute; top: 14px; right: 14px; z-index: 2;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px 6px 8px; border-radius: 999px;
          background: rgba(10,10,12,.55); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,.14);
          font-size: 11.5px; font-weight: 800; letter-spacing: .02em; color: #fff;
        }
        .ff-ic {
          width: 22px; height: 22px; border-radius: 999px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--c); color: #0B0D11;
        }

        .ff-copy {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
          display: flex; flex-direction: column; gap: 8px;
          padding: 20px;
          opacity: 0; transform: translateY(6px);
          transition: opacity .35s .1s, transform .4s .1s cubic-bezier(.22,1,.36,1);
          pointer-events: none;
        }
        .ff-card.on .ff-copy { opacity: 1; transform: none; pointer-events: auto; }
        .ff-h {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: clamp(19px, 2vw, 24px); font-weight: 800;
          letter-spacing: -.5px; line-height: 1.08; color: #fff;
        }
        .ff-b { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.72); }
        .ff-go {
          display: inline-flex; align-items: center; gap: 5px; width: fit-content;
          margin-top: 2px; padding: 8px 14px; border-radius: 999px;
          font-size: 12.5px; font-weight: 800;
          background: var(--c); color: #0B0D11; text-decoration: none;
          transition: transform .28s cubic-bezier(.22,1,.36,1);
        }
        .ff-go:hover { transform: translateX(4px); }

        .ff-dots {
          display: flex; justify-content: center; align-items: center; gap: 8px;
          height: 34px;
        }
        .ff-dot {
          width: 8px; height: 8px; border-radius: 999px; padding: 0;
          border: none; cursor: pointer; background: rgba(255,255,255,.2);
          transition: width .3s cubic-bezier(.22,1,.36,1), background .3s;
        }
        .ff-dot.on { width: 22px; background: var(--c); }

        @media (max-width: 900px) {
          .ff { height: clamp(320px, 46vh, 380px); }
          .ff-card { width: clamp(180px, 40vw, 240px); }
        }
        @media (max-width: 620px) {
          .ff { height: 340px; }
          .ff-card { width: 72vw; }
          .ff-b { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ff-card { transition: none; }
        }
      `}</style>
    </div>
  );
}
