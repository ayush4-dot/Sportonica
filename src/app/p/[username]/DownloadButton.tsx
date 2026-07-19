"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

// Downloads a 9:16 story card (1080x1920) rendered server-side, in whatever
// theme the viewer is currently using. On phones it offers the native share
// sheet with the real image file, so it can go straight to an IG story.
export default function DownloadButton({ username, name }: { username: string; name: string }) {
  const [theme] = useTheme();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/p/${username}/story?theme=${theme}`);
      const blob = await res.blob();
      const file = new File([blob], `${username}-khelumna.png`, { type: "image/png" });

      // Phone: hand the real file to the native share sheet (Instagram
      // stories, WhatsApp, etc). If the user cancels, we stop — we must NOT
      // also download, or they end up with two copies of the same image.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${name} · Khelum Na` });
        } catch {
          /* user dismissed the sheet — nothing more to do */
        }
        setBusy(false);
        return;
      }

      // Desktop / no file-share support: plain download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${username}-khelumna.png`;
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
    <button className="pf-btn ghost" onClick={download} disabled={busy}>
      {done ? <><Check size={15} /> Saved</> : <><Download size={15} /> {busy ? "Making card…" : "Download card"}</>}
    </button>
  );
}
