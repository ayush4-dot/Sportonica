"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

// Per-fixture sibling of TournamentShareBar's "Story / post card" button —
// same fetch-blob-then-share-or-download dance, but pointed at the
// single-match card route so a fan can post one fixture (not the whole
// tournament) straight to a feed post or story.
export default function FixtureShareButton({
  tournamentId, matchId, teamAName, teamBName, size = 14,
}: { tournamentId: string; matchId: string; teamAName: string; teamBName: string; size?: number }) {
  const [theme] = useTheme();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function download(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(`/tournaments/${tournamentId}/fixture/${matchId}/card?theme=${theme}`);
      const blob = await res.blob();
      const file = new File([blob], "fixture-sportonica.png", { type: "image/png" });
      const title = `${teamAName} vs ${teamBName} · Sportonica`;

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
        } catch {
          /* user dismissed the sheet — do NOT also trigger a download */
        }
        setBusy(false);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fixture-sportonica.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button" onClick={download} disabled={busy}
      aria-label="Download or share this fixture as a card"
      className="fx-share-btn"
    >
      {done ? <Check size={size} /> : <Download size={size} />}
      <span>{busy ? "Making card…" : done ? "Saved" : "Share card"}</span>
      <style>{`
        .fx-share-btn {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: inherit; font-size: 11.5px; font-weight: 700; color: var(--dim, inherit);
          background: transparent; border: 1px solid var(--line, rgba(128,128,128,0.35)); border-radius: 999px;
          padding: 6px 11px; cursor: pointer; transition: border-color 0.2s, color 0.2s; flex-shrink: 0;
        }
        .fx-share-btn:hover { border-color: #006241; color: #006241; }
        .fx-share-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </button>
  );
}
