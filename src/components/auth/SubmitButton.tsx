"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";

// The CTA: it leans toward the cursor (magnetic), spawns a ripple from
// the click point, and swaps its label for a spinner while `loading`.
export default function SubmitButton({
  loading, disabled, onClick, children,
}: {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const mx = useSpring(useMotionValue(0), { stiffness: 200, damping: 15 });
  const my = useSpring(useMotionValue(0), { stiffness: 200, damping: 15 });

  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.18);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.3);
  }
  function reset() { mx.set(0); my.set(0); }

  function ripple(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = ref.current;
    if (!btn || reduce) return;
    const r = btn.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "abtn-ripple";
    const size = Math.max(r.width, r.height);
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.appendChild(s);
    s.addEventListener("animationend", () => s.remove());
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      className="abtn"
      style={{ x: mx, y: my }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onClick={(e) => { ripple(e); onClick(); }}
      disabled={disabled || loading}
      whileTap={reduce ? undefined : { scale: 0.97 }}
    >
      <span className="abtn-label" data-loading={loading ? "1" : "0"}>
        {loading ? <Loader2 size={17} className="abtn-spin" /> : children}
      </span>
      <span className="abtn-sheen" aria-hidden />
    </motion.button>
  );
}
