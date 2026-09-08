"use client";

import { useState } from "react";
import { Link2, Share2, Download, Check, ClipboardList } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

// Three separate, explicit actions rather than one smart "Share" button —
// each covers a different real ask: grabbing the raw link, handing the OS
// share sheet a link (WhatsApp/Messenger/etc), and handing it an actual
// designed image file. That last one is what makes "Instagram/Facebook
// Story" show up as a share target at all — the OS only offers Story for
// image/video files, never for a bare link.
export default function TournamentShareBar({
  id, name, canRegister = false, accent = "#006241",
}: { id: string; name: string; canRegister?: boolean; accent?: string }) {
  const [theme] = useTheme();
  const [copied, setCopied] = useState(false);
  const [regCopied, setRegCopied] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardDone, setCardDone] = useState(false);

  const url = () => `${window.location.origin}/tournaments/${id}`;
  const regUrl = () => `${window.location.origin}/tournaments/${id}?tab=register`;
  const title = `${name} · Sportonica`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked (permissions/insecure context) — nothing more we can do here */
    }
  }

  async function copyRegLink() {
    try {
      await navigator.clipboard.writeText(regUrl());
      setRegCopied(true);
      setTimeout(() => setRegCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: url() });
      } catch {
        /* user dismissed the sheet */
      }
      return;
    }
    copyLink();
  }

  async function shareCard() {
    setCardBusy(true);
    try {
      const res = await fetch(`/tournaments/${id}/story?theme=${theme}`);
      const blob = await res.blob();
      const file = new File([blob], "tournament-sportonica.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
        } catch {
          /* user dismissed the sheet — do NOT also trigger a download */
        }
        setCardBusy(false);
        return;
      }

      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = "tournament-sportonica.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);

      setCardDone(true);
      setTimeout(() => setCardDone(false), 1800);
    } catch {
      /* ignore */
    } finally {
      setCardBusy(false);
    }
  }

  return (
    <div className="ts-bar" style={{ "--ts-accent": accent } as React.CSSProperties}>
      <button type="button" className="ts-btn" onClick={copyLink}>
        <span className="ts-ico">{copied ? <Check size={13} /> : <Link2 size={13} />}</span>
        {copied ? "Copied" : "Copy link"}
      </button>
      {canRegister && (
        <button type="button" className="ts-btn" onClick={copyRegLink}>
          <span className="ts-ico">{regCopied ? <Check size={13} /> : <ClipboardList size={13} />}</span>
          {regCopied ? "Copied" : "Registration link"}
        </button>
      )}
      <button type="button" className="ts-btn" onClick={share}>
        <span className="ts-ico"><Share2 size={13} /></span>
        Share
      </button>
      {/* The one action that produces a real designed asset (not just a
          link) — given the primary, filled treatment so it reads as the
          standout thing to do here, not just a fourth identical pill. */}
      <button type="button" className="ts-btn primary" onClick={shareCard} disabled={cardBusy}>
        <span className="ts-ico">{cardDone ? <Check size={13} /> : <Download size={13} />}</span>
        {cardBusy ? "Making card…" : cardDone ? "Saved" : "Story / post card"}
      </button>

      <style>{`
        .ts-bar { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 16px; }
        .ts-btn {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--dim, inherit);
          background: transparent; border: 1px solid var(--line, rgba(128,128,128,0.35)); border-radius: 999px;
          padding: 7px 14px 7px 7px; cursor: pointer;
          transition: border-color 0.2s, color 0.2s, background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .ts-ico {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(128,128,128,0.12); flex-shrink: 0;
          transition: background 0.2s, color 0.2s;
        }
        .ts-btn:hover { border-color: var(--ts-accent); color: var(--ts-accent); transform: translateY(-1px); }
        .ts-btn:hover .ts-ico { background: color-mix(in srgb, var(--ts-accent) 16%, transparent); color: var(--ts-accent); }
        .ts-btn:disabled { opacity: 0.6; cursor: default; transform: none; }
        .ts-btn.primary {
          padding: 7px 16px 7px 7px;
          color: #fff; border-color: var(--ts-accent);
          background: var(--ts-accent);
          box-shadow: 0 4px 14px -6px var(--ts-accent);
        }
        .ts-btn.primary .ts-ico { background: rgba(255,255,255,0.2); color: #fff; }
        .ts-btn.primary:hover { color: #fff; transform: translateY(-1px); box-shadow: 0 6px 18px -6px var(--ts-accent); }
        .ts-btn.primary:hover .ts-ico { background: rgba(255,255,255,0.28); color: #fff; }
        .ts-btn.primary:disabled { transform: none; box-shadow: none; }
      `}</style>
    </div>
  );
}
