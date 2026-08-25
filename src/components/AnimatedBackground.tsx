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
  accent1 = "#006241",
  accent2 = "#1e3932",
  accent3 = "#5f756d",
  opacity = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = 0, H = 0, raf = 0;

    // Phones report devicePixelRatio 2-3.5, so an uncapped canvas.width is
    // 6-12x the actual pixel count of a desktop window that size — every
    // gradient fill below has to rasterize that many pixels, every frame.
    // Capping it is the single biggest lever on mobile paint cost; the visual
    // loss is invisible on blurry gradients/dots at this size.
    const isSmallScreen = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.5 : 2);

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
    // Fewer orbs on phones: each is a full-canvas radial gradient fill, and
    // that's the other big-ticket cost alongside devicePixelRatio above.
    const allOrbs = [
      { x: 0.15, y: 0.2,  r: 0.55, rgb: c1, speed: 0.00018, ox: 0, oy: 0, phase: 0 },
      { x: 0.82, y: 0.15, r: 0.45, rgb: c2, speed: 0.00014, ox: 0, oy: 0, phase: 2.1 },
      { x: 0.5,  y: 0.75, r: 0.5,  rgb: c3, speed: 0.00016, ox: 0, oy: 0, phase: 4.2 },
      { x: 0.88, y: 0.7,  r: 0.35, rgb: c1, speed: 0.0002,  ox: 0, oy: 0, phase: 1.0 },
      { x: 0.1,  y: 0.82, r: 0.3,  rgb: c2, speed: 0.00012, ox: 0, oy: 0, phase: 3.5 },
    ];
    const orbs = isSmallScreen ? allOrbs.slice(0, 3) : allOrbs;

    /* ── grid dots ── */
    // The dot grid is a decorative nice-to-have but its per-frame cost is
    // nested (orbs × dots, each a distance calc + its own arc()+fill() call
    // — canvas state changes are the expensive part, not the math), so it's
    // skipped entirely on phones rather than just thinned out.
    const CELL = 44;
    const DOTS: { x: number; y: number }[] = [];

    const buildDots = () => {
      DOTS.length = 0;
      if (isSmallScreen) return;
      for (let x = 0; x < W; x += CELL) {
        for (let y = 0; y < H; y += CELL) {
          DOTS.push({ x, y });
        }
      }
    };

    const resize = () => {
      // offsetWidth/Height are 0 until the element is laid out. Falling back
      // to the viewport keeps the maths finite — a 0 height makes the scan
      // line NaN and crashes createLinearGradient.
      const nextW = canvas.offsetWidth || window.innerWidth || 1;
      const nextH = canvas.offsetHeight || window.innerHeight || 1;
      const nextPxW = Math.round(nextW * dpr);
      const nextPxH = Math.round(nextH * dpr);
      // Reassigning canvas.width/height clears the bitmap even when the
      // value is unchanged. Mobile browsers fire ResizeObserver repeatedly
      // while their address bar collapses/expands during scroll — without
      // this guard every one of those was a real (if brief) blank flash,
      // most visible through the blurred header/dock glass above it.
      if (canvas.width === nextPxW && canvas.height === nextPxH) return;
      W = nextW;
      H = nextH;
      canvas.width  = nextPxW;
      canvas.height = nextPxH;
      ctx.setTransform(1, 0, 0, 1, 0, 0);   // reset before scaling again
      ctx.scale(dpr, dpr);
      buildDots();
      last = 0; // force the next already-scheduled frame to repaint immediately
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    W = canvas.offsetWidth || window.innerWidth || 1;
    H = canvas.offsetHeight || window.innerHeight || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    buildDots();

    /* ── mouse parallax ── */
    const mouse = { x: 0.5, y: 0.5 };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMove);

    // Blurred elements (header, dock) sit on top of this canvas and have to
    // resample it every frame it changes. At 60fps that's expensive enough
    // on weaker mobile GPUs to drop frames and read as a visible flicker —
    // capping to ~30fps (~20fps on phones) halves that compositing cost with
    // no visible loss since the drift here is slow to begin with.
    const frameBudget = isSmallScreen ? 48 : 32;
    let last = 0;
    const draw = (ts: number) => {
      // A backgrounded tab still gets rAF callbacks on some mobile browsers;
      // skip the work entirely rather than paint frames nobody sees.
      if (document.hidden) { raf = requestAnimationFrame(draw); return; }
      if (ts - last < frameBudget) { raf = requestAnimationFrame(draw); return; }
      last = ts;
      ctx.clearRect(0, 0, W, H);

      // Read live so a theme switch repaints the very next frame — this
      // canvas sits behind the CSS-driven chrome and has no other way to
      // know the page flipped from dark to light.
      const isPaper = document.documentElement.dataset.theme === "paper";

      /* ── 1. deep base ── */
      const base = ctx.createLinearGradient(0, 0, W, H);
      if (isPaper) {
        base.addColorStop(0, "#F2EDE6");
        base.addColorStop(1, "#EDE6D8");
      } else {
        base.addColorStop(0, "#0B0D11");
        base.addColorStop(1, "#0d1017");
      }
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
      // Skip if the canvas has no size yet — the modulo below would be NaN.
      if (!Number.isFinite(H) || H <= 0) return;
      const scanY = ((ts * 0.035) % (H * 2)) - H * 0.5;
      const scan = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
      scan.addColorStop(0,   "rgba(255,255,255,0)");
      scan.addColorStop(0.5, "rgba(255,255,255,0.025)");
      scan.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = scan;
      ctx.fillRect(0, scanY - 60, W, 120);

      /* ── 5. vignette ── */
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
      if (isPaper) {
        vig.addColorStop(0, "rgba(20,23,30,0)");
        vig.addColorStop(1, "rgba(20,23,30,0.05)");
      } else {
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.55)");
      }
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
        // Must be negative, not 0: a static (non-positioned) page's content
        // paints *before* a z-index:0 positioned descendant in CSS's stacking
        // order, so at z-index:0 this canvas silently painted over every
        // page's text the instant its first frame drew its opaque gradient
        // fill, washing everything out. Negative z-index paints it in the
        // backdrop step instead, unambiguously behind static content.
        zIndex: -1,
        pointerEvents: "none",
        opacity,
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      aria-hidden="true"
    />
  );
}
