"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ONBOARDING_SEEN_KEY, ONBOARDING_DONE_EVENT } from "@/lib/onboarding";

// First-run intro. Shown once per device the first time someone lands on
// the app root — same idea as Playo's opening carousel: a stylised city
// map with sport/player pins, then a title and a big CTA. Dismissal is
// stored in localStorage so it never takes over the screen again; bump
// ONBOARDING_SEEN_KEY's suffix (in lib/onboarding.ts) to re-show it.

type Pin = {
  src: string;
  /** white pill caption (slides without chat bubbles) */
  label?: string;
  /** speech bubble caption (the "find players" slide) */
  bubble?: string;
  /** map position — x is the pin's centre, y its top, both % of the scene */
  x: string;
  y: string;
  size: number;
  delay: number;
};

type Slide = {
  title: [string, string];
  sub: string;
  pins: Pin[];
};

// Four map positions reused across slides: two up top, two lower down,
// clear of the centred "you" avatar.
const SPOTS = [
  { x: "23%", y: "6%" },
  { x: "75%", y: "11%" },
  { x: "17%", y: "44%" },
  { x: "73%", y: "48%" },
] as const;

const SLIDES: Slide[] = [
  {
    title: ["Book Venues to", "Play with Friends"],
    sub: "Get your squad to play together — courts across Kathmandu, booked in seconds.",
    pins: [
      { src: "/sports/badminton.jpg", label: "Badminton", ...SPOTS[0], size: 74, delay: 0 },
      { src: "/sports/cricket.jpg", label: "Cricket", ...SPOTS[1], size: 74, delay: 0.1 },
      { src: "/sports/swimming.jpg", label: "Swimming", ...SPOTS[2], size: 80, delay: 0.18 },
      { src: "/sports/futsal.jpg", label: "Futsal", ...SPOTS[3], size: 86, delay: 0.26 },
    ],
  },
  {
    title: ["Find Players in", "Your Neighbourhood"],
    sub: "Just like you did as a kid — see who's up for a game near you.",
    pins: [
      { src: "/sports/futsal.jpg", bubble: "Wanna play today?", ...SPOTS[0], size: 74, delay: 0 },
      { src: "/sports/basketball.jpg", bubble: "I'm in! 👍", ...SPOTS[1], size: 74, delay: 0.1 },
      { src: "/sports/volleyball.jpg", bubble: "At 7?", ...SPOTS[2], size: 80, delay: 0.18 },
      { src: "/sports/pickleball.jpg", bubble: "Free this evening", ...SPOTS[3], size: 86, delay: 0.26 },
    ],
  },
  {
    title: ["Keep Your Crew", "Together"],
    sub: "One squad, one regular slot — no more chasing the group chat.",
    pins: [
      { src: "/sports/cricket.jpg", label: "Sunday XI", ...SPOTS[0], size: 74, delay: 0 },
      { src: "/sports/volleyball.jpg", label: "Sunset six", ...SPOTS[1], size: 74, delay: 0.1 },
      { src: "/sports/futsal.jpg", label: "Tuesday futsal", ...SPOTS[2], size: 80, delay: 0.18 },
      { src: "/sports/badminton.jpg", label: "Dawn doubles", ...SPOTS[3], size: 86, delay: 0.26 },
    ],
  },
];

// Routes that run their own full-screen flow — never cover them.
const BLOCKED = ["/admin", "/platform", "/login", "/signup", "/auth", "/welcome"];

// framer-motion resolves function variants against the `custom` prop, so
// the swap direction (+1 next / -1 back) can drive enter/exit x offset.
const sceneVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -40 }),
};
const textVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -24 }),
};

// Stylised street map, drawn inline so it works offline in the native
// shell (no tile server, no external request).
function CityMap() {
  return (
    <svg
      className="ob-map"
      viewBox="0 0 390 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <rect width="390" height="520" fill="#EDE4D5" />
      {/* parks */}
      <path d="M-20 360 q60 -50 140 -20 q40 40 -20 90 q-90 40 -140 -10 Z" fill="#CFE0BE" opacity="0.8" />
      <ellipse cx="330" cy="120" rx="90" ry="70" fill="#CFE0BE" opacity="0.75" />
      <rect x="250" y="330" width="120" height="150" rx="26" fill="#CFE0BE" opacity="0.7" />
      {/* river */}
      <path
        d="M70 -30 C 40 120, 150 180, 90 320 C 50 420, 120 500, 100 560"
        fill="none"
        stroke="#AFD4E3"
        strokeWidth="26"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* roads */}
      <g stroke="#F6F1E7" strokeLinecap="round" fill="none">
        <path d="M-20 90 L 420 40" strokeWidth="16" />
        <path d="M-20 250 L 420 300" strokeWidth="18" />
        <path d="M-20 430 L 420 400" strokeWidth="14" />
        <path d="M150 -20 L 120 560" strokeWidth="16" />
        <path d="M300 -20 L 340 560" strokeWidth="14" />
        <path d="M20 -20 L 60 560" strokeWidth="10" />
      </g>
      <g stroke="#D8CDB8" strokeLinecap="round" fill="none" strokeWidth="2" opacity="0.6">
        <path d="M-20 90 L 420 40" />
        <path d="M-20 250 L 420 300" />
        <path d="M150 -20 L 120 560" />
        <path d="M300 -20 L 340 560" />
      </g>
    </svg>
  );
}

export default function Onboarding() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  // +1 next, -1 back — drives the slide direction.
  const [dir, setDir] = useState(1);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    // Root only: a deep link (shared game, SEO landing) shouldn't get a
    // takeover. Guard localStorage — Safari private mode throws on read.
    if (pathname !== "/") return;
    if (BLOCKED.some((p) => pathname.startsWith(p))) return;
    try {
      if (localStorage.getItem(ONBOARDING_SEEN_KEY)) return;
    } catch {
      return;
    }
    setOpen(true);
  }, [pathname]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, String(Date.now()));
    } catch {
      /* private mode — just close for this session */
    }
    setOpen(false);
    // Hand off to the next first-run step (the header's "Where do you
    // play?" city prompt) in place, on this same page — it holds itself
    // back until this fires so the two don't stack. Staying on "/" keeps
    // it feeling like one flow rather than a jump to another screen.
    window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
  }, []);

  const next = useCallback(() => {
    if (i >= SLIDES.length - 1) return finish();
    setDir(1);
    setI((n) => n + 1);
  }, [i, finish]);

  const back = useCallback(() => {
    if (i === 0) return;
    setDir(-1);
    setI((n) => n - 1);
  }, [i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!open) return null;

  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div
      className="ob"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sportonica"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -45) next();
        else if (dx > 45) back();
        setTouchX(null);
      }}
    >
      <button className="ob-skip" onClick={() => finish()}>
        Skip
      </button>

      <div className="ob-scene">
        <CityMap />
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            className="ob-pins"
            custom={dir}
            variants={sceneVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {slide.pins.map((p) => (
              // Outer node owns the map position (translateX centres it on
              // p.x); the inner motion node owns the entrance transform, so
              // framer-motion's inline transform can't clobber the centring.
              <div
                key={(p.label ?? p.bubble ?? "") + p.x}
                className="ob-pin"
                style={{ left: p.x, top: p.y }}
              >
                <motion.div
                  className="ob-pin-inner"
                  initial={{ opacity: 0, scale: 0.6, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.1 + p.delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span
                    className="ob-pin-img"
                    style={{
                      width: p.size,
                      height: p.size,
                      backgroundImage: `url(${p.src})`,
                      animationDelay: `${p.delay}s`,
                    }}
                  />
                  {p.bubble ? (
                    <span className="ob-bubble">{p.bubble}</span>
                  ) : (
                    <span className="ob-pin-label">{p.label}</span>
                  )}
                </motion.div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        <div className="ob-avatar" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark.png" alt="" />
        </div>

        <div className="ob-fade" aria-hidden />
      </div>

      <div className="ob-body">
        <div className="ob-dots" role="tablist" aria-label="Slides">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              className={`ob-dot ${n === i ? "on" : ""}`}
              aria-label={`Go to slide ${n + 1}`}
              aria-selected={n === i}
              role="tab"
              onClick={() => {
                setDir(n > i ? 1 : -1);
                setI(n);
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            variants={textVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <h1 className="ob-title">
              {slide.title[0]}
              <br />
              {slide.title[1]}
            </h1>
            <p className="ob-sub">{slide.sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ob-foot">
        <span className="ob-tag">Let&apos;s get playing!</span>
        <button className="ob-go" onClick={next}>
          {last ? (
            "Ready. Set. Go."
          ) : (
            <>
              Next <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      <style>{`
        .ob {
          position: fixed; inset: 0; z-index: 2000;
          display: flex; flex-direction: column;
          background: #F2EDE6; color: var(--color-dark, #1e3932);
          font-family: 'Inter', system-ui, sans-serif;
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          animation: obIn .28s ease-out both;
        }
        @keyframes obIn { from { opacity: 0; } to { opacity: 1; } }

        .ob-skip {
          position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); right: 16px;
          z-index: 4; background: rgba(242,237,230,0.75); border: none; cursor: pointer;
          font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 999px;
          color: var(--color-secondary, #5f756d); padding: 6px 12px; backdrop-filter: blur(4px);
        }

        .ob-scene {
          position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
        }
        .ob-map {
          position: absolute; inset: 0; width: 100%; height: 100%; display: block;
        }
        .ob-fade {
          position: absolute; left: 0; right: 0; bottom: 0; height: 90px;
          background: linear-gradient(to bottom, rgba(242,237,230,0), #F2EDE6);
          pointer-events: none;
        }
        .ob-pins { position: absolute; inset: 0; }
        .ob-pin {
          position: absolute; transform: translateX(-50%); width: max-content;
        }
        .ob-pin-inner {
          display: flex; flex-direction: column; align-items: center; gap: 7px;
        }
        .ob-pin-img {
          display: block; border-radius: 999px; background-size: cover; background-position: center;
          border: 3px solid #fff;
          box-shadow: 0 12px 26px -10px rgba(30,57,50,0.55), 0 0 0 1px rgba(30,57,50,0.06);
          animation: obFloat 5s ease-in-out infinite;
        }
        @keyframes obFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .ob-pin-label, .ob-bubble {
          font-size: 12px; font-weight: 600; white-space: nowrap;
          background: #fff; color: var(--color-dark, #1e3932);
          padding: 4px 11px; border-radius: 999px; position: relative;
          box-shadow: 0 8px 18px -8px rgba(30,57,50,0.45);
        }
        /* speech-bubble tail, pointing up at the face */
        .ob-bubble { border-radius: 13px; }
        .ob-bubble::before {
          content: ""; position: absolute; top: -5px; left: 50%; transform: translateX(-50%) rotate(45deg);
          width: 10px; height: 10px; background: #fff; border-radius: 2px;
        }
        .ob-avatar {
          position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%);
          width: 88px; height: 88px; border-radius: 999px; background: #fff;
          display: grid; place-items: center;
          box-shadow: 0 20px 44px -12px rgba(30,57,50,0.5);
        }
        .ob-avatar img { width: 54px; height: 54px; object-fit: contain; }

        .ob-body { padding: 18px 26px 4px; text-align: center; position: relative; z-index: 1; }
        .ob-dots { display: flex; justify-content: center; gap: 7px; margin-bottom: 18px; }
        .ob-dot {
          width: 7px; height: 7px; border-radius: 999px; border: none; padding: 0; cursor: pointer;
          background: rgba(30,57,50,0.22); transition: width .25s, background .25s;
        }
        .ob-dot.on { width: 22px; background: #006241; }
        .ob-title {
          font-size: clamp(25px, 6.2vw, 33px); font-weight: 800;
          letter-spacing: -1.1px; line-height: 1.14; margin: 0 0 12px;
        }
        .ob-sub {
          font-size: 14px; line-height: 1.5; margin: 0 auto; max-width: 22em;
          color: var(--color-secondary, #5f756d);
        }

        .ob-foot {
          padding: 12px 22px calc(16px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid rgba(30,57,50,0.10);
          text-align: center;
        }
        .ob-tag { display: block; font-size: 13px; color: var(--color-secondary, #5f756d); margin-bottom: 11px; }
        .ob-go {
          width: 100%; max-width: 460px; margin: 0 auto;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 16px; border-radius: 14px; cursor: pointer;
          background: #006241; color: #fff; border: none;
          font-family: inherit; font-size: 15px; font-weight: 700;
          letter-spacing: 0.02em; text-transform: uppercase;
          box-shadow: 0 16px 34px -14px rgba(0,98,65,0.7);
        }
        .ob-go:active { transform: translateY(1px); }

        @media (min-height: 740px) {
          .ob-scene { flex-grow: 1.35; }
        }
        @media (max-width: 380px) {
          .ob-body { padding-left: 18px; padding-right: 18px; }
          .ob-pin-label, .ob-bubble { font-size: 11px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ob-pin-img { animation: none; }
        }
      `}</style>
    </div>
  );
}
