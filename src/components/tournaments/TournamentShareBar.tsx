"use client";

import { useState } from "react";
import { Link2, Share2, Download, Check } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

// Three separate, explicit actions rather than one smart "Share" button —
// each covers a different real ask: grabbing the raw link, handing the OS
// share sheet a link (WhatsApp/Messenger/etc), and handing it an actual
// designed image file. That last one is what makes "Instagram/Facebook
// Story" show up as a share target at all — the OS only offers Story for
// image/video files, never for a bare link.
export default function TournamentShareBar({ id, name }: { id: string; name: string }) {
  const [theme] = useTheme();
  const [copied, setCopied] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardDone, setCardDone] = useState(false);

  const url = () => `${window.location.origin}/tournaments/${id}`;
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
    <div className="ts-bar">
      <button type="button" className="ts-btn" onClick={copyLink}>
        {copied ? <Check size={13} /> : <Link2 size={13} />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button type="button" className="ts-btn" onClick={share}>
        <Share2 size={13} /> Share
      </button>
      <button type="button" className="ts-btn" onClick={shareCard} disabled={cardBusy}>
        {cardDone ? <Check size={13} /> : <Download size={13} />}
        {cardBusy ? "Making card…" : cardDone ? "Saved" : "Story / post card"}
      </button>

      <style>{`
        .ts-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .ts-btn {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--dim, inherit);
          background: transparent; border: 1px solid var(--line, rgba(128,128,128,0.35)); border-radius: 999px;
          padding: 8px 14px; cursor: pointer; transition: border-color 0.2s, color 0.2s;
        }
        .ts-btn:hover { border-color: #006241; color: #006241; }
        .ts-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}
