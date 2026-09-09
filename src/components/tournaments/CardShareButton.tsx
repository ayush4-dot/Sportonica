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
      {copied ? <Check size={15} /> : <Share2 size={15} />}
      <style>{`
        .cs-btn {
          position: absolute; top: 12px; right: 12px; z-index: 4;
          width: 44px; height: 44px; border-radius: 50%; cursor: pointer;
          display: grid; place-items: center; color: #14171E;
          background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.32);
          backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
          box-shadow: 0 4px 14px -6px rgba(0,0,0,0.45);
          filter: drop-shadow(0 1px 1px rgba(255,255,255,0.4));
          transition: transform .22s cubic-bezier(.22,1,.36,1), background .22s ease;
        }
        .cs-btn:hover { transform: scale(1.04); background: rgba(255,255,255,0.3); }
        .cs-btn:active { transform: scale(0.97); }
      `}</style>
    </button>
  );
}
