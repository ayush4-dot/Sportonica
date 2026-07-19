"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** accent1 hex — primary orb colour */
  accent1?: string;
  /** accent2 hex — secondary orb colour */
  accent2?: string;
  /** accent3 hex — tertiary orb colour */
  accent3?: string;
  /** overall opacity of the canvas layer (0-1) */
  opacity?: number;
}

export default function AnimatedBackground({
  accent1 = "#DE3163",
  accent2 = "#FFC93C",
  accent3 = "#2E7D5B",
  opacity = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = 0, H = 0, raf = 0;

    /* ── parse hex to [r,g,b] ── */
    const hex2rgb = (hex: string): [number, number, number] => {
      const h = hex.replace("#", "");
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    };

    const c1 = hex2rgb(accent1);
    const c2 = hex2rgb(accent2);
    const c3 = hex2rgb(accent3);

    /* ── orb definitions ── */
    const orbs = [
      { x: 0.15, y: 0.2,  r: 0.55, rgb: c1, speed: 0.00018, ox: 0, oy: 0, phase: 0 },
      { x: 0.82, y: 0.15, r: 0.45, rgb: c2, speed: 0.00014, ox: 0, oy: 0, phase: 2.1 },
      { x: 0.5,  y: 0.75, r: 0.5,  rgb: c3, speed: 0.00016, ox: 0, oy: 0, phase: 4.2 },
      { x: 0.88, y: 0.7,  r: 0.35, rgb: c1, speed: 0.0002,  ox: 0, oy: 0, phase: 1.0 },
      { x: 0.1,  y: 0.82, r: 0.3,  rgb: c2, speed: 0.00012, ox: 0, oy: 0, phase: 3.5 },
    ];

    /* ── grid dots ── */
    const CELL = 44;
    const DOTS: { x: number; y: number }[] = [];

    const buildDots = () => {
      DOTS.length = 0;
      for (let x = 0; x < W; x += CELL) {
        for (let y = 0; y < H; y += CELL) {
          DOTS.push({ x, y });
        }
      }
    };

    const resize = () => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      buildDots();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    /* ── mouse parallax ── */
    const mouse = { x: 0.5, y: 0.5 };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMove);

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, W, H);

      /* ── 1. deep base ── */
      const base = ctx.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, "#0B0D11");
      base.addColorStop(1, "#0d1017");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);

      /* ── 2. orbs ── */
      orbs.forEach((o) => {
        const drift  = Math.sin(ts * o.speed + o.phase);
        const drift2 = Math.cos(ts * o.speed * 0.7 + o.phase + 1);
        /* mouse parallax shifts each orb a little */
        const px = (o.x + drift * 0.12 + (mouse.x - 0.5) * 0.04) * W;
        const py = (o.y + drift2 * 0.10 + (mouse.y - 0.5) * 0.03) * H;
        const radius = o.r * Math.min(W, H);

        const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
        const [r, g2, b] = o.rgb;
        g.addColorStop(0,   `rgba(${r},${g2},${b},0.18)`);
        g.addColorStop(0.4, `rgba(${r},${g2},${b},0.07)`);
        g.addColorStop(1,   `rgba(${r},${g2},${b},0)`);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      /* ── 3. dot grid — brightness driven by nearest orb ── */
      orbs.forEach((o) => {
        const drift  = Math.sin(ts * o.speed + o.phase);
        const drift2 = Math.cos(ts * o.speed * 0.7 + o.phase + 1);
        const cx = (o.x + drift * 0.12 + (mouse.x - 0.5) * 0.04) * W;
        const cy = (o.y + drift2 * 0.10 + (mouse.y - 0.5) * 0.03) * H;
        const R  = o.r * Math.min(W, H) * 0.9;
        const [r, g2, b] = o.rgb;

        DOTS.forEach((d) => {
          const dist = Math.hypot(d.x - cx, d.y - cy);
          if (dist > R) return;
          const brightness = 1 - dist / R;
          ctx.beginPath();
          ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g2},${b},${brightness * 0.35})`;
          ctx.fill();
        });
      });

      /* ── 4. scan line ── */
      const scanY = ((ts * 0.035) % (H * 2)) - H * 0.5;
      const scan = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
      scan.addColorStop(0,   "rgba(255,255,255,0)");
      scan.addColorStop(0.5, "rgba(255,255,255,0.025)");
      scan.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = scan;
      ctx.fillRect(0, scanY - 60, W, 120);

      /* ── 5. vignette ── */
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
    };
  }, [accent1, accent2, accent3]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        opacity,
      }}
      aria-hidden="true"
    />
  );
}
