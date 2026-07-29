"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, animate } from "framer-motion";
import { CircleDot, Target, Wind, Activity, Trophy, Zap, Waves } from "lucide-react";

// Sport showcase items. Drop a real action photo URL into `img` later and it
// replaces the gradient placeholder automatically.
type SportCard = {
  sport: string;
  color: string;
  tint: string;
  icon: React.ReactNode;
  tagline: string;
  img?: string; // ← put your action-shot URL here when ready
};

const CARDS: SportCard[] = [
  { sport: "Futsal",     color: "#2E7D5B", tint: "#0f3d2b", icon: <CircleDot size={40} />, tagline: "Floodlit nights, fast feet",       img: "/sports/futsal.jpg" },
  { sport: "Cricket",    color: "#f97316", tint: "#48260a", icon: <Target size={40} />,    tagline: "Box cages after dark",             img: "/sports/cricket.jpg" },
  { sport: "Basketball", color: "#FFC93C", tint: "#4a3a0c", icon: <Trophy size={40} />,    tagline: "Three on three, all week",         img: "/sports/basketball.jpg" },
  { sport: "Volleyball", color: "#3b82f6", tint: "#132a52", icon: <Activity size={40} />,  tagline: "Sand, net, sunset",                img: "/sports/volleyball.jpg" },
  { sport: "Badminton",  color: "#a855f7", tint: "#2e1450", icon: <Wind size={40} />,      tagline: "Dawn doubles, indoor courts",      img: "/sports/badminton.jpg" },
  { sport: "Tennis",     color: "#ec4899", tint: "#43102b", icon: <Activity size={40} />,  tagline: "Baseline rallies" },
  { sport: "Pickleball", color: "#84cc16", tint: "#28380c", icon: <Target size={40} />,    tagline: "Easy to learn, hard to stop" },
  { sport: "Swimming",   color: "#06b6d4", tint: "#0c3640", icon: <Waves size={40} />,     tagline: "Lanes, laps, early mornings" },
  { sport: "Running",    color: "#60a5fa", tint: "#16304f", icon: <Zap size={40} />,       tagline: "Ring road crews, every morning",   img: "/sports/running.jpg" },
];

const CARD_W = 175;
const GAP = 40;
const STEP = CARD_W + GAP;

export default function SportCoverflow({
  onPick, selected,
}: {
  /** If given, tapping the centred card calls this instead of navigating —
   *  lets a page filter in place rather than changing route. */
  onPick?: (sport: string) => void;
  /** Keeps the coverflow in sync when the sport is changed elsewhere. */
  selected?: string;
} = {}) {
  const router = useRouter();
  const [active, setActive] = useState(Math.floor(CARDS.length / 2));
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 170, damping: 26, mass: 0.85 });
  const dragging = useRef(false);
  const velocity = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const didDrag = useRef(false);
  const startX = useRef(0);
  const startPos = useRef(0);

  // Follow an externally chosen sport (e.g. the filter chips).
  useEffect(() => {
    if (!selected) return;
    const i = CARDS.findIndex((c) => c.sport === selected);
    if (i >= 0) setActive(i);
  }, [selected]);

  // Move to a given index (spring animates there).
  useEffect(() => {
    const target = -active * STEP;
    animate(x, target, { type: "spring", stiffness: 170, damping: 26, mass: 0.85 });
  }, [active, x]);

  function clampIndex(i: number) {
    return Math.max(0, Math.min(CARDS.length - 1, i));
  }

  // Wheel / trackpad: accumulate movement so a flick glides across cards
  // instead of stepping one notch at a time.
  const wheelAcc = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onWheel(e: React.WheelEvent) {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 2) return;

    wheelAcc.current += delta;

    // Move a card once enough travel has built up.
    const threshold = STEP * 0.45;
    if (Math.abs(wheelAcc.current) >= threshold) {
      const steps = Math.trunc(wheelAcc.current / threshold);
      wheelAcc.current -= steps * threshold;
      setActive((a) => clampIndex(a + steps));
    }

    // Reset the accumulator once the gesture stops.
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => { wheelAcc.current = 0; }, 140);
  }

  // Pointer drag / swipe.
  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    didDrag.current = false;
    startX.current = e.clientX;
    startPos.current = x.get();
    lastX.current = e.clientX;
    lastT.current = performance.now();
    velocity.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 6) didDrag.current = true;   // a real drag, not a tap

    // Track velocity for a momentum-aware release.
    const now = performance.now();
    const dt = now - lastT.current;
    if (dt > 0) velocity.current = (e.clientX - lastX.current) / dt; // px per ms
    lastX.current = e.clientX;
    lastT.current = now;

    // Rubber-band at the ends so it never feels stuck.
    let next = startPos.current + dx;
    const min = -(CARDS.length - 1) * STEP;
    if (next > 0) next = next * 0.35;
    if (next < min) next = min + (next - min) * 0.35;
    x.set(next);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;

    // A quick flick carries you onward; a slow drag just snaps to nearest.
    const v = velocity.current;                 // px/ms, positive = dragging right
    const projected = -(x.get() + v * 140) / STEP;
    const nearest = clampIndex(Math.round(projected));

    velocity.current = 0;
    setActive(nearest);
  }

  return (
    <div
      style={{ position: "relative", width: "100%", height: 250, overflow: "hidden", touchAction: "pan-y", cursor: "grab" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* stage */}
      <motion.div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", x: springX, marginLeft: -CARD_W / 2, display: "flex", gap: GAP, alignItems: "center" }}>
        {CARDS.map((c, i) => (
          <Card
            key={c.sport}
            card={c}
            index={i}
            activeIndex={active}
            springX={springX}
            filtersInPlace={!!onPick}
            onClick={() => {
              if (didDrag.current) return;          // ignore clicks after a drag
              // Side card → bring it to the centre.
              if (i !== active) { setActive(i); return; }
              // Centre card → filter in place if the page handles it,
              // otherwise go to discover filtered by this sport.
              if (onPick) onPick(c.sport);
              else router.push(`/discover?sport=${encodeURIComponent(c.sport)}`);
            }}
          />
        ))}
      </motion.div>

      {/* cinematic edge blur — frosted gradient masks on both sides */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "22%", pointerEvents: "none", background: "linear-gradient(to right, var(--ink,#0B0D11) 10%, transparent)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", maskImage: "linear-gradient(to right, #000 40%, transparent)", zIndex: 5 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "22%", pointerEvents: "none", background: "linear-gradient(to left, var(--ink,#0B0D11) 10%, transparent)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", maskImage: "linear-gradient(to left, #000 40%, transparent)", zIndex: 5 }} />

      {/* dots */}
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8, zIndex: 6 }}>
        {CARDS.map((c, i) => (
          <button key={i} onClick={() => setActive(i)} aria-label={c.sport}
            style={{ width: i === active ? 22 : 7, height: 7, borderRadius: 99, border: "none", cursor: "pointer",
              background: i === active ? c.color : "rgba(255,255,255,0.25)", transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)" }} />
        ))}
      </div>
    </div>
  );
}

function Card({
  card, index, activeIndex, springX, onClick, filtersInPlace,
}: {
  card: SportCard; index: number; activeIndex: number;
  springX: ReturnType<typeof useSpring>; onClick: () => void;
  filtersInPlace?: boolean;
}) {
  // distance from center in card-steps, derived live from the spring position
  const [style, setStyle] = useState({ scale: 1, rotateY: 0, z: 0, blur: 0, opacity: 1 });

  useEffect(() => {
    const unsub = springX.on("change", (val: number) => {
      const centerOffset = -val / STEP; // which index is centered (fractional)
      const d = index - centerOffset;    // signed distance from center
      const ad = Math.abs(d);
      setStyle({
        scale: Math.max(1 - ad * 0.16, 0.72),
        rotateY: Math.max(Math.min(-d * 22, 45), -45),
        z: -ad * 120,
        blur: Math.min(ad * 2.4, 6),
        opacity: Math.max(1 - ad * 0.22, 0.4),
      });
    });
    return () => unsub();
  }, [springX, index]);

  return (
    <motion.div
      onClick={onClick}
      style={{
        width: CARD_W, height: 220, flexShrink: 0, borderRadius: 18, overflow: "hidden",
        position: "relative", cursor: "pointer", transformStyle: "preserve-3d",
        transform: `perspective(1200px) translateZ(${style.z}px) rotateY(${style.rotateY}deg) scale(${style.scale})`,
        filter: `blur(${style.blur}px)`, opacity: style.opacity,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: index === activeIndex ? `0 30px 80px -20px ${card.color}66` : "0 20px 50px -20px rgba(0,0,0,0.6)",
        transition: "box-shadow 0.4s ease",
        background: card.img ? "#000" : `linear-gradient(160deg, ${card.tint}, #0B0D11 80%)`,
      }}
    >
      {card.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.img} alt={card.sport} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 26 }}>
          <div style={{ color: card.color }}>{card.icon}</div>
          {/* big ghost icon */}
          <div style={{ position: "absolute", right: -30, bottom: -20, color: card.color, opacity: 0.1, transform: "scale(6)", transformOrigin: "bottom right" }}>{card.icon}</div>
        </div>
      )}

      {/* label overlay */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 13, zIndex: 2,
        background: "linear-gradient(to top, rgba(8,9,12,0.92), transparent)" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>{card.sport}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{card.tagline}</div>
        {/* Only the centred card is tappable — show that it is. */}
        {index === activeIndex && (
          <div style={{
            marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11.5, fontWeight: 700, color: card.color,
            border: `1px solid ${card.color}66`, background: `${card.color}1f`,
            padding: "6px 11px", borderRadius: 999,
          }}>
            {filtersInPlace ? `Show ${card.sport} games` : `See ${card.sport} games →`}
          </div>
        )}
      </div>
    </motion.div>
  );
}
