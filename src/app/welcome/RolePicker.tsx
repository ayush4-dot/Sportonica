"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, Store, ArrowRight } from "lucide-react";
import { setMyRole } from "@/lib/profile/actions";

export default function RolePicker({ name, next }: { name: string; next: string }) {
  const router = useRouter();
  const [role, setRole] = useState<"player" | "venue_owner">("player");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    setErr(null);
    startTransition(async () => {
      try {
        await setMyRole(role);
        router.push(role === "venue_owner" ? "/admin" : next);
      } catch (e) {
        const m = e instanceof Error ? e.message : "Couldn't save that.";
        if (m.includes("UNAUTHORIZED")) { router.push("/login?redirect=/welcome"); return; }
        setErr(m);
        console.error("[welcome] setMyRole failed:", e);
      }
    });
  }

  return (
    <div className="wc">
      <div className="wc-card">
        <div className="wc-eyebrow">Welcome to Khelam Na</div>
        <h1 className="wc-title">Hey {name}.<br />How will you use it?</h1>
        <p className="wc-sub">You can change this later — it just decides where we drop you.</p>

        <button className={`wc-opt ${role === "player" ? "on" : ""}`} onClick={() => setRole("player")}>
          <span className="wc-ic"><User size={20} /></span>
          <span>
            <b>I&apos;m here to play</b>
            <small>Book courts, join games, find a squad.</small>
          </span>
        </button>

        <button className={`wc-opt ${role === "venue_owner" ? "on" : ""}`} onClick={() => setRole("venue_owner")}>
          <span className="wc-ic"><Store size={20} /></span>
          <span>
            <b>I run a venue</b>
            <small>List your grounds, manage bookings and pricing.</small>
          </span>
        </button>

        {err && <p className="wc-err">{err}</p>}

        <button className="wc-go" onClick={go} disabled={pending}>
          {pending ? "Setting up…" : <>Continue <ArrowRight size={16} /></>}
        </button>
      </div>

      <style>{`
        .wc {
          min-height: 100vh; display: grid; place-items: center; padding: 24px;
          background: var(--ink, #0B0D11); color: var(--chalk, #F2EDE6);
          font-family: 'Inter', system-ui, sans-serif;
        }
        .wc-card { width: 100%; max-width: 430px; }
        .wc-eyebrow {
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
          letter-spacing: 0.2em; text-transform: uppercase; color: #006241; margin-bottom: 14px;
        }
        .wc-title {
          font-family: 'Bricolage Grotesque', sans-serif;
          font-size: clamp(30px, 6vw, 42px); font-weight: 800;
          letter-spacing: -1.5px; line-height: 1.05; margin: 0 0 10px;
        }
        .wc-sub { font-size: 14px; opacity: 0.6; margin: 0 0 26px; }
        .wc-opt {
          width: 100%; display: flex; align-items: flex-start; gap: 14px; text-align: left;
          padding: 16px; margin-bottom: 12px; border-radius: 14px; cursor: pointer;
          background: transparent; color: inherit; font-family: inherit;
          border: 1px solid rgba(242,237,230,0.14);
          transition: border-color .2s, background .2s, transform .2s cubic-bezier(.22,1,.36,1);
        }
        .wc-opt:hover { transform: translateY(-2px); border-color: rgba(0,98,65,.45); }
        .wc-opt.on { border-color: #006241; background: rgba(0,98,65,0.1); }
        .wc-ic {
          width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
          display: grid; place-items: center; background: rgba(255,255,255,0.06);
        }
        .wc-opt.on .wc-ic { background: rgba(0,98,65,0.18); color: #006241; }
        .wc-opt b { display: block; font-size: 14.5px; margin-bottom: 3px; }
        .wc-opt small { font-size: 12.5px; opacity: 0.6; line-height: 1.45; }
        .wc-go {
          width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 10px; padding: 14px; border-radius: 12px; cursor: pointer;
          background: #006241; color: #ffffff; border: none;
          font-family: inherit; font-size: 15px; font-weight: 700;
        }
        .wc-go:disabled { opacity: .6; cursor: default; }
        .wc-err { color: #ef4444; font-size: 13px; margin: 4px 0 0; }
      `}</style>
    </div>
  );
}
