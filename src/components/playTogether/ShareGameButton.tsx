"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Native share sheet on mobile (WhatsApp, Messages, etc. all show up for
// free); desktop browsers mostly don't implement navigator.share, so we
// fall back to copying the link and flashing a brief confirmation instead
// of failing silently.
export default function ShareGameButton({ gameId, title, text }: {
  gameId: string;
  title: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/play-together/${gameId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions/insecure context) — nothing more we can do here.
    }
  }

  return (
    <button type="button" className="pt-share-btn" onClick={share}>
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
