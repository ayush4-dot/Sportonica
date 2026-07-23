"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

export default function ShareButton({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // Build the full absolute URL — a relative path is useless once pasted
    // into WhatsApp, Instagram, etc.
    const fullUrl = url.startsWith("http")
      ? url
      : `${window.location.origin}${url}`;

    // Native share sheet on mobile, copy to clipboard on desktop.
    // Send ONLY the url — adding `text` too makes some apps attach the
    // message and the link preview as two separate items.
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} · Khelam Na`, url: fullUrl });
      } catch {
        /* user dismissed — stop here, don't also copy */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <button className="pf-btn" onClick={share}>
      {copied ? <><Check size={15} /> Link copied</> : <><Share2 size={15} /> Share card</>}
    </button>
  );
}
