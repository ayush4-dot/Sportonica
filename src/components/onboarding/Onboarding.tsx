"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValue, animate } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { isBareChromeRoute } from "@/lib/nav/authRoutes";
import "./onboarding.css";

/* First-run onboarding. Renders once per device — a full-screen paper
   overlay above all app chrome — then writes a localStorage flag and
   gets out of the way. Deliberately not a route: it should greet the
   very first open no matter where the user lands (home, a shared game
   link, a deep link), and never again after that.

   Mounted in the root layout, after NavWrapper. */

const FLAG = "sportonica:onboarded";

type Pin = {
  /* percentage position within the canvas */
  x: number;
  y: number;
  img: string;
  /* venue pin -> label pill below the photo; chat pin -> speech bubble above */
  kind: "venue" | "chat";
  text: string;
  /* object-position for the circular crop — frames the subject */
  pos?: string;
  size?: number;
  float?: number;
  delay?: number;
};

const P = {
  futsal: "/sports/photos/futsal.jpg",
  cricket: "/sports/photos/cricket.jpg",
  badminton: "/sports/photos/badminton.jpg",
  basketball: "/sports/photos/basketball.jpg",
  volleyball: "/sports/photos/volleyball.jpg",
  swimming: "/sports/photos/swimming.jpg",
  pickleball: "/sports/photos/pickleball.jpg",
};

type Slide = {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
  pins: Pin[];
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Book",
    title: (
      <>
        Get into <em>your game</em>
      </>
    ),
    sub: "Verified futsal courts, box-cricket pitches, badminton halls and pools — live hourly availability, and the bill split automatically across your squad.",
    pins: [
      { x: 24, y: 24, img: P.futsal, pos: "50% 14%", kind: "venue", text: "Futsal", float: 6.5 },
      { x: 75, y: 20, img: P.cricket, pos: "52% 34%", kind: "venue", text: "Cricket", float: 7.2, delay: 0.4 },
      { x: 23, y: 67, img: P.badminton, pos: "50% 42%", kind: "venue", text: "Badminton", size: 56, float: 6, delay: 0.8 },
      { x: 76, y: 69, img: P.basketball, pos: "50% 20%", kind: "venue", text: "Hoops", size: 56, float: 6.8, delay: 0.2 },
    ],
  },
  {
    eyebrow: "Play together",
    title: (
      <>
        Book the venues <em>nearby</em>
      </>
    ),
    sub: "Short a couple of players? Open your game to the city. Every player carries a trust score from how reliably they show up — so you know who's turning up.",
    pins: [
      { x: 30, y: 21, img: P.volleyball, pos: "24% 46%", kind: "chat", text: "I'm in! 👊", float: 6 },
      { x: 68, y: 24, img: P.pickleball, pos: "46% 36%", kind: "chat", text: "Got 2 spots?", float: 7, delay: 0.5 },
      { x: 32, y: 65, img: P.swimming, pos: "42% 44%", kind: "chat", text: "7pm at Kupondole?", float: 6.6, delay: 0.9 },
      { x: 66, y: 68, img: P.basketball, pos: "50% 22%", kind: "chat", text: "On my way", float: 6.2, delay: 0.3 },
    ],
  },
  {
    eyebrow: "Squads",
    title: (
      <>
        Find your <em>friends</em>
      </>
    ),
    sub: "Build a squad, keep the chat and the fixtures in one place, and run your own weekly league — win, lose, and rank across the season.",
    pins: [
      { x: 25, y: 24, img: P.volleyball, pos: "24% 46%", kind: "venue", text: "Sat league", float: 6.4 },
      { x: 75, y: 21, img: P.basketball, pos: "50% 20%", kind: "venue", text: "3-on-3 crew", size: 56, float: 7, delay: 0.5 },
      { x: 24, y: 68, img: P.pickleball, pos: "46% 36%", kind: "venue", text: "Pickle club", size: 56, float: 6.1, delay: 0.9 },
      { x: 75, y: 66, img: P.swimming, pos: "44% 42%", kind: "venue", text: "Lane 4", size: 54, float: 6.7, delay: 0.2 },
    ],
  },
];

/* Abstract street map — a calm light grid, a couple of parks and one
   river bend, all in paper tones so the pins carry every bit of the
   contrast. Pure SVG: crisp at any pixel density. Portrait viewBox so
   `slice` never has to over-zoom. */
function CityMap() {
  return (
    <svg className="ob-map" viewBox="0 0 390 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="-20" y="-20" width="430" height="660" fill="#F2EDE6" />

      {/* parks */}
      <path d="M-20 70 Q 60 40 120 84 Q 150 150 90 180 Q 10 190 -20 140 Z" fill="#dde8da" opacity="0.7" />
      <path d="M300 360 Q 370 345 430 380 L 430 470 Q 350 500 300 455 Q 275 405 300 360 Z" fill="#dde8da" opacity="0.65" />

      {/* river */}
      <path
        d="M-20 470 C 70 450 100 540 190 512 C 270 488 300 545 390 520 C 415 513 430 522 440 518"
        fill="none" stroke="#cfe3e9" strokeWidth="26" strokeLinecap="round" opacity="0.8"
      />

      {/* blocks */}
      <g fill="#eae3d5">
        <rect x="34" y="120" width="78" height="70" rx="9" />
        <rect x="140" y="96" width="92" height="60" rx="9" />
        <rect x="262" y="140" width="86" height="74" rx="9" />
        <rect x="150" y="250" width="80" height="82" rx="9" />
        <rect x="40" y="300" width="80" height="72" rx="9" />
        <rect x="262" y="264" width="84" height="70" rx="9" />
        <rect x="120" y="410" width="96" height="70" rx="9" />
        <rect x="30" y="520" width="80" height="66" rx="9" />
        <rect x="264" y="520" width="90" height="70" rx="9" />
        <rect x="150" y="10" width="80" height="58" rx="9" />
      </g>

      {/* roads — fill:none, or the L-shaped paths fill solid */}
      <g fill="none" stroke="#faf6ef" strokeWidth="14" strokeLinecap="round">
        <path d="M-20 100 H 410" />
        <path d="M-20 230 H 410" />
        <path d="M-20 390 H 410" />
        <path d="M-20 500 H 410" />
        <path d="M126 -20 V 640" />
        <path d="M248 -20 V 640" />
        <path d="M40 -20 L 150 250 L 120 640" />
      </g>
      <g fill="none" stroke="#ece4d5" strokeWidth="4" strokeLinecap="round" opacity="0.9">
        <path d="M-20 165 H 410" />
        <path d="M-20 315 H 410" />
        <path d="M-20 560 H 410" />
        <path d="M70 -20 V 640" />
        <path d="M188 -20 V 640" />
        <path d="M320 -20 V 640" />
      </g>
    </svg>
  );
}

function Canvas({ slide, active }: { slide: Slide; active: boolean }) {
  return (
    <div className="ob-canvas">
      <CityMap />

      {slide.pins.map((p, i) => (
        <div
          key={i}
          className={`ob-pin${p.kind === "chat" ? " is-chat" : ""}${active ? " ob-show" : ""}`}
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              "--f": `${p.float ?? 6}s`,
              "--d": `${p.delay ?? 0}s`,
              "--in": `${0.15 + i * 0.09}s`,
              "--s": `${p.size ?? 62}px`,
              "--pos": p.pos ?? "50% 30%",
            } as React.CSSProperties
          }
        >
          <span className="ob-pin-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.img} alt="" />
          </span>
          {p.kind === "chat" ? (
            <div className="ob-pin-bubble">{p.text}</div>
          ) : (
            <div className="ob-pin-label">{p.text}</div>
          )}
        </div>
      ))}

      <div className="ob-you">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/mark.png" alt="Sportonica" />
      </div>
    </div>
  );
}

export default function Onboarding() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [i, setI] = useState(0);
  const [w, setW] = useState(0);
  const x = useMotionValue(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Consoles and auth flows own their full screen — never cover them.
  const blocked =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/offline") ||
    isBareChromeRoute(pathname);

  useEffect(() => {
    if (blocked) return;
    let seen = true;
    try {
      seen = localStorage.getItem(FLAG) === "1";
    } catch {
      /* privacy mode / storage disabled — treat as already seen, don't nag */
    }
    if (!seen) setOpen(true);
  }, [blocked]);

  // Lock the page behind the overlay.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Track the stage width so drag constraints and slide offsets stay
  // exact through rotation / resize.
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setW(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Keep the track aligned to the active slide (resize, dot tap, keys).
  useEffect(() => {
    if (!open || !w) return;
    const controls = animate(x, -i * w, { type: "spring", stiffness: 320, damping: 38 });
    return controls.stop;
  }, [i, w, open, x]);

  const finish = useCallback(
    (dest?: string) => {
      try {
        localStorage.setItem(FLAG, "1");
      } catch {
        /* ignore */
      }
      setLeaving(true);
      window.setTimeout(() => {
        setOpen(false);
        if (dest) router.push(dest);
      }, 300);
    },
    [router],
  );

  const last = i === SLIDES.length - 1;
  const next = useCallback(() => {
    if (last) finish("/discover");
    else setI((v) => Math.min(v + 1, SLIDES.length - 1));
  }, [last, finish]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, SLIDES.length - 1));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={`ob${leaving ? " ob-out" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sportonica"
      tabIndex={-1}
    >
      <div className="ob-top">
        <div className="ob-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark.png" alt="" />
          Sportonica
        </div>
        <button className="ob-skip" onClick={() => finish()}>
          Skip
        </button>
      </div>

      <div className="ob-stage" ref={stageRef}>
        <motion.div
          className="ob-track"
          style={{ x }}
          drag="x"
          dragElastic={0.12}
          dragConstraints={{ left: -(SLIDES.length - 1) * w, right: 0 }}
          onDragEnd={(_, info) => {
            const span = w || 1;
            const moved = info.offset.x;
            const flung = Math.abs(info.velocity.x) > 350;
            let target = i;
            if ((moved < -span * 0.28 || (flung && info.velocity.x < 0)) && i < SLIDES.length - 1) target = i + 1;
            else if ((moved > span * 0.28 || (flung && info.velocity.x > 0)) && i > 0) target = i - 1;
            setI(target);
            animate(x, -target * span, { type: "spring", stiffness: 320, damping: 38 });
          }}
        >
          {SLIDES.map((s, idx) => (
            <div className="ob-slide" key={idx} aria-hidden={idx !== i}>
              <Canvas slide={s} active={idx === i} />
              <div className="ob-copy">
                <div className="ob-eyebrow">{s.eyebrow}</div>
                <h2 className="ob-title">{s.title}</h2>
                <p className="ob-sub">{s.sub}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="ob-foot">
        <div className="ob-dots" role="tablist" aria-label="Onboarding progress">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              className={`ob-dot${idx === i ? " on" : ""}`}
              aria-label={`Go to step ${idx + 1}`}
              aria-selected={idx === i}
              role="tab"
              onClick={() => setI(idx)}
            />
          ))}
        </div>

        <button className="ob-cta" onClick={next}>
          {last ? "Find your game" : "Next"}
          <ArrowRight size={18} strokeWidth={2.4} />
        </button>

        <button className="ob-signin" onClick={() => finish("/login")}>
          Already play here? <b>Sign in</b>
        </button>
      </div>
    </div>
  );
}
