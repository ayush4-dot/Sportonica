"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

// The glass card, but alive: it tilts a few degrees toward the pointer in
// 3D, and a soft light follows the cursor across its surface. Falls back
// to a plain static card when the OS asks for reduced motion.
export default function AuthCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const px = useMotionValue(0.5); // 0..1 pointer position within the card
  const py = useMotionValue(0.5);

  const rx = useSpring(useTransform(py, [0, 1], [6, -6]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-7, 7]), { stiffness: 150, damping: 18 });
  const glowX = useTransform(px, (v) => `${v * 100}%`);
  const glowY = useTransform(py, (v) => `${v * 100}%`);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      className="auth-card"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.15 }}
    >
      {!reduce && (
        <motion.span
          aria-hidden
          className="auth-card-glow"
          style={{ left: glowX, top: glowY }}
        />
      )}
      <div className="auth-card-inner">{children}</div>
    </motion.div>
  );
}
