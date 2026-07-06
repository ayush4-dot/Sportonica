"use client";

import React from "react";

/**
 * HeroScene — two animated sport silhouettes:
 *   Left:  footballer mid-kick scoring a goal
 *   Right: cricketer in full batting swing
 * Pure SVG + CSS animation, no Three.js, no external assets.
 */

export const ThreeScene: React.FC = () => {
  return (
    <div style={{
      position: "absolute", inset: 0,
      overflow: "hidden",
      background: "linear-gradient(160deg, #080c10 0%, #0a1a0e 55%, #080c10 100%)",
    }}>
      <style>{`
        /* ── pitch ground ── */
        .hs-pitch {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 38%;
          background: linear-gradient(180deg, #0d2416 0%, #091a0e 100%);
        }
        .hs-pitch::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg,
            rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px,
            transparent 1px, transparent 60px
          );
        }

        /* ── floodlight beams ── */
        .hs-beam {
          position: absolute;
          top: -20px;
          width: 140px;
          height: 70%;
          border-radius: 0 0 60% 60%;
          animation: beamFlicker 5s ease-in-out infinite;
          pointer-events: none;
        }
        .hs-beam-l {
          left: 8%;
          background: linear-gradient(180deg, rgba(255,200,60,0.13) 0%, transparent 80%);
          transform: rotate(10deg);
          transform-origin: top center;
          animation-delay: 0s;
        }
        .hs-beam-r {
          right: 6%;
          background: linear-gradient(180deg, rgba(255,200,60,0.10) 0%, transparent 80%);
          transform: rotate(-12deg);
          transform-origin: top center;
          animation-delay: 1.8s;
        }

        @keyframes beamFlicker {
          0%,100% { opacity: 1; }
          45%      { opacity: 0.65; }
          50%      { opacity: 0.85; }
          55%      { opacity: 0.55; }
        }

        /* ── footballer ── */
        .hs-footballer {
          position: absolute;
          bottom: 36%;
          left: 8%;
          width: 140px;
          height: 200px;
          animation: footballerKick 1.6s ease-in-out infinite;
          transform-origin: bottom center;
        }
        @keyframes footballerKick {
          0%   { transform: translateX(0)   rotate(0deg);   }
          30%  { transform: translateX(6px)  rotate(-4deg);  }
          55%  { transform: translateX(14px) rotate(3deg);   }
          70%  { transform: translateX(10px) rotate(-2deg);  }
          100% { transform: translateX(0)   rotate(0deg);   }
        }

        /* ── football rolling toward goal ── */
        .hs-ball {
          position: absolute;
          bottom: 33%;
          left: 18%;
          width: 34px;
          height: 34px;
          animation: ballRoll 1.6s ease-in-out infinite;
        }
        @keyframes ballRoll {
          0%   { transform: translateX(0px)   rotate(0deg);   }
          60%  { transform: translateX(120px) rotate(360deg); opacity: 1; }
          80%  { transform: translateX(180px) rotate(500deg); opacity: 0.5; }
          100% { transform: translateX(0px)   rotate(0deg);   opacity: 1; }
        }

        /* ── goal net ── */
        .hs-goal {
          position: absolute;
          bottom: 33%;
          left: 42%;
          width: 90px;
          height: 56px;
          border: 2.5px solid rgba(255,255,255,0.35);
          border-bottom: none;
          background: repeating-linear-gradient(
            90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 12px
          ),
          repeating-linear-gradient(
            180deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 12px
          );
          animation: goalFlash 1.6s ease-in-out infinite;
        }
        @keyframes goalFlash {
          0%,59%,100% { background-color: transparent; box-shadow: none; }
          60%,79%     { background-color: rgba(255,201,60,0.08); box-shadow: 0 0 20px rgba(255,201,60,0.25); }
          80%         { background-color: transparent; box-shadow: none; }
        }

        /* ── goal posts ── */
        .hs-post-l, .hs-post-r {
          position: absolute;
          bottom: 33%;
          width: 4px;
          height: 62px;
          background: rgba(255,255,255,0.5);
          border-radius: 2px;
        }
        .hs-post-l { left: 41.5%; }
        .hs-post-r { left: calc(41.5% + 90px); }
        .hs-crossbar {
          position: absolute;
          bottom: calc(33% + 56px);
          left: 41.5%;
          width: 96px;
          height: 4px;
          background: rgba(255,255,255,0.5);
          border-radius: 2px;
        }

        /* ── cricketer ── */
        .hs-cricketer {
          position: absolute;
          bottom: 36%;
          right: 8%;
          width: 150px;
          height: 210px;
          animation: cricketSwing 1.8s ease-in-out infinite;
          transform-origin: bottom center;
        }
        @keyframes cricketSwing {
          0%   { transform: scaleX(-1) rotate(0deg);    }
          20%  { transform: scaleX(-1) rotate(-6deg);   }
          45%  { transform: scaleX(-1) rotate(8deg);    }
          65%  { transform: scaleX(-1) rotate(2deg);    }
          100% { transform: scaleX(-1) rotate(0deg);    }
        }

        /* ── cricket ball arc ── */
        .hs-cball {
          position: absolute;
          bottom: 44%;
          right: 22%;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #e63946, #9b1d24);
          border: 1.5px solid rgba(255,255,255,0.2);
          animation: cballArc 1.8s ease-in-out infinite;
        }
        @keyframes cballArc {
          0%   { transform: translate(0px,   0px);   opacity: 0; }
          10%  { opacity: 1; }
          40%  { transform: translate(-60px, -50px); opacity: 1; }
          70%  { transform: translate(-130px, -20px); opacity: 0.7; }
          90%  { transform: translate(-170px, 10px);  opacity: 0; }
          100% { transform: translate(0px,   0px);   opacity: 0; }
        }

        /* ── ambient particles ── */
        .hs-particle {
          position: absolute;
          border-radius: 50%;
          animation: particleDrift linear infinite;
          pointer-events: none;
        }
        @keyframes particleDrift {
          0%   { transform: translateY(0)   scale(1);   opacity: 0.7; }
          50%  { transform: translateY(-22px) scale(1.4); opacity: 0.3; }
          100% { transform: translateY(0)   scale(1);   opacity: 0.7; }
        }

        /* ── crowd dots ── */
        .hs-crowd {
          position: absolute;
          top: 4%;
          left: 0; right: 0;
          height: 18%;
          display: flex;
          align-items: flex-end;
          gap: 3px;
          padding: 0 8px;
          overflow: hidden;
        }
        .hs-crowd-dot {
          width: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.12);
          animation: crowdBob ease-in-out infinite;
        }
        @keyframes crowdBob {
          0%,100% { transform: scaleY(1); opacity: 0.4; }
          50%     { transform: scaleY(1.6); opacity: 0.8; }
        }
      `}</style>

      {/* Floodlight beams */}
      <div className="hs-beam hs-beam-l" />
      <div className="hs-beam hs-beam-r" />

      {/* Crowd silhouette dots */}
      <div className="hs-crowd">
        {Array.from({ length: 80 }).map((_, i) => (
          <div
            key={i}
            className="hs-crowd-dot"
            style={{
              height: `${8 + (i % 5) * 4}px`,
              animationDuration: `${0.8 + (i % 7) * 0.15}s`,
              animationDelay:    `${(i % 11) * 0.08}s`,
              background: i % 9 === 0 ? "rgba(222,49,99,0.4)" : i % 7 === 0 ? "rgba(255,201,60,0.3)" : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      {/* Pitch */}
      <div className="hs-pitch" />

      {/* Goal posts + net */}
      <div className="hs-post-l" />
      <div className="hs-post-r" />
      <div className="hs-crossbar" />
      <div className="hs-goal" />

      {/* Footballer SVG */}
      <div className="hs-footballer">
        <svg viewBox="0 0 140 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* head */}
          <circle cx="72" cy="22" r="16" fill="#F4A261" />
          {/* hair */}
          <path d="M58 16 Q72 4 86 16" fill="#1a0a00" />
          {/* body — jersey #DE3163 */}
          <path d="M54 38 Q72 34 90 38 L96 90 H48 Z" fill="#DE3163" />
          {/* shorts */}
          <path d="M48 90 H96 L92 118 H52 Z" fill="#1C2029" />
          {/* left leg — planted */}
          <path d="M52 118 L46 170 L58 172 L64 122 Z" fill="#1C2029" />
          {/* right leg — kicking forward */}
          <path d="M78 118 L100 155 L110 148 L88 114 Z" fill="#1C2029" />
          {/* left boot */}
          <ellipse cx="52" cy="174" rx="12" ry="7" fill="#111" />
          {/* right boot — kicking */}
          <ellipse cx="108" cy="151" rx="14" ry="7" fill="#111" transform="rotate(-20 108 151)" />
          {/* left arm */}
          <path d="M54 42 L34 82 L44 86 L62 50 Z" fill="#DE3163" />
          {/* right arm — raised */}
          <path d="M90 42 L118 60 L114 70 L86 52 Z" fill="#DE3163" />
          {/* jersey number */}
          <text x="68" y="72" fontSize="16" fontWeight="bold" fill="rgba(255,255,255,0.6)" fontFamily="monospace">10</text>
        </svg>
      </div>

      {/* Football */}
      <div className="hs-ball">
        <svg viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="17" cy="17" r="16" fill="#f0f0f0" stroke="#ccc" strokeWidth="0.5" />
          <path d="M17 2 L20 9 L17 13 L14 9 Z" fill="#111" opacity="0.75" />
          <path d="M30 17 L24 15 L17 17 L24 20 Z" fill="#111" opacity="0.75" />
          <path d="M4 17 L10 15 L17 17 L10 20 Z" fill="#111" opacity="0.75" />
          <path d="M17 32 L20 25 L17 21 L14 25 Z" fill="#111" opacity="0.75" />
          <path d="M7 7 L12 11 L17 13 L14 9 Z" fill="#111" opacity="0.5" />
          <path d="M27 7 L22 11 L17 13 L20 9 Z" fill="#111" opacity="0.5" />
        </svg>
      </div>

      {/* Cricketer SVG */}
      <div className="hs-cricketer">
        <svg viewBox="0 0 150 210" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* helmet */}
          <path d="M60 28 Q75 10 92 18 L96 30 Q75 36 60 28Z" fill="#1C2029" />
          <circle cx="76" cy="28" r="16" fill="#F4A261" />
          {/* helmet visor */}
          <path d="M60 28 L56 36 Q76 40 96 34 L96 28 Q76 36 60 28Z" fill="#0f1115" opacity="0.8" />
          {/* body — whites */}
          <path d="M58 46 Q76 42 94 46 L100 100 H52 Z" fill="#e8e4dc" />
          {/* chest pad */}
          <path d="M58 46 Q67 44 76 44 L78 90 H52 Z" fill="#d0ccc4" />
          {/* trousers */}
          <path d="M52 100 H100 L96 130 H56 Z" fill="#e8e4dc" />
          {/* left leg — bent back */}
          <path d="M56 130 L44 175 L56 177 L66 134 Z" fill="#e8e4dc" />
          {/* right leg — forward stride */}
          <path d="M84 130 L96 175 L108 173 L96 128 Z" fill="#e8e4dc" />
          {/* pads on legs */}
          <rect x="43" y="148" width="14" height="28" rx="4" fill="#c8c4bc" />
          <rect x="95" y="148" width="14" height="28" rx="4" fill="#c8c4bc" />
          {/* boots */}
          <ellipse cx="50" cy="178" rx="13" ry="6" fill="#333" />
          <ellipse cx="102" cy="176" rx="13" ry="6" fill="#333" />
          {/* left arm — extended follow-through */}
          <path d="M58 50 L22 36 L18 46 L54 62 Z" fill="#e8e4dc" />
          {/* right arm — bat swing HIGH */}
          <path d="M92 50 L128 18 L134 26 L98 60 Z" fill="#e8e4dc" />
          {/* bat */}
          <rect x="118" y="4" width="12" height="52" rx="4" fill="#c8860a" transform="rotate(-35 118 4)" />
          <rect x="119" y="5" width="8" height="40" rx="2" fill="#e8a010" opacity="0.5" transform="rotate(-35 119 5)" />
          {/* gloves */}
          <ellipse cx="24" cy="40" rx="9" ry="7" fill="#cc2233" transform="rotate(-10 24 40)" />
          <ellipse cx="132" cy="24" rx="9" ry="7" fill="#cc2233" transform="rotate(-35 132 24)" />
        </svg>
      </div>

      {/* Cricket ball */}
      <div className="hs-cball" />

      {/* Ambient particles */}
      {[
        { l:"15%", b:"55%", s:4, c:"#FFC93C", dur:"3.2s", delay:"0s"   },
        { l:"30%", b:"65%", s:3, c:"#DE3163", dur:"2.8s", delay:"0.5s" },
        { l:"55%", b:"50%", s:5, c:"#FFC93C", dur:"3.5s", delay:"1.1s" },
        { l:"70%", b:"60%", s:3, c:"#2E7D5B", dur:"2.6s", delay:"0.3s" },
        { l:"82%", b:"55%", s:4, c:"#FFC93C", dur:"3.0s", delay:"0.9s" },
        { l:"42%", b:"70%", s:3, c:"#DE3163", dur:"2.4s", delay:"1.5s" },
        { l:"62%", b:"72%", s:5, c:"#2E7D5B", dur:"3.8s", delay:"0.7s" },
      ].map((p, i) => (
        <div
          key={i}
          className="hs-particle"
          style={{
            left: p.l, bottom: p.b,
            width: p.s, height: p.s,
            background: p.c,
            animationDuration: p.dur,
            animationDelay:    p.delay,
          }}
        />
      ))}
    </div>
  );
};
