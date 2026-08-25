"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Small overlay share icon for a browse-page card — same
// share-then-copy-fallback logic as ShareGameButton/ShareButton, just
// icon-only and positioned to sit on top of the card's image without
// triggering the card's own <Link> navigation.
export default function CardShareButton({ href, title }: { href: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}${href}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* user dismissed the sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <button type="button" className="cs-btn" onClick={share} aria-label="Share">
      {copied ? <Check size={13} /> : <Share2 size={13} />}
      <style>{`
        .cs-btn {
          position: absolute; top: 10px; right: 10px; z-index: 4;
          width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
          display: grid; place-items: center; color: #fff;
          background: rgba(11,13,17,0.55); backdrop-filter: blur(4px);
          transition: background 0.2s, transform 0.2s;
        }
        .cs-btn:hover { background: #006241; transform: scale(1.06); }
      `}</style>
    </button>
  );
}
