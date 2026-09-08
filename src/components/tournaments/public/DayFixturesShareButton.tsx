"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

// One button per date group on the public Fixtures tab — downloads/shares
// that whole day's matches as a single designed card (time, teams, score,
// round), rather than one card per individual match.
export default function DayFixturesShareButton({
  tournamentId, date, dateLabel,
}: { tournamentId: string; date: string; dateLabel: string }) {
  const [theme] = useTheme();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/tournaments/${tournamentId}/fixtures-card?date=${date}&theme=${theme}`);
      const blob = await res.blob();
      const file = new File([blob], `fixtures-${date}-sportonica.png`, { type: "image/png" });
      const title = `Fixtures · ${dateLabel} · Sportonica`;

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
      a.download = `fixtures-${date}-sportonica.png`;
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
      aria-label={`Download or share ${dateLabel}'s fixtures as a card`}
      className="fx-share-btn"
    >
      {done ? <Check size={13} /> : <Download size={13} />}
      <span>{busy ? "Making card…" : done ? "Saved" : "Share this day"}</span>
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
