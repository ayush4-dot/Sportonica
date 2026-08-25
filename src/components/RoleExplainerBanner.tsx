"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

// One-time, dismissible orientation banner for a role's dashboard —
// localStorage-only (per device/browser, not synced). Reads the initial
// dismissed state via useSyncExternalStore rather than a setState-in-effect
// (same pattern as PageTransition.tsx): the stored value never changes
// externally while mounted, so subscribe is a no-op — this purely reads a
// value that legitimately differs between server (always "not dismissed",
// no window) and client, without a hydration-mismatch flash. The dismiss
// click itself just flips a plain useState — a normal event handler, not
// an effect — for an instant hide.
const subscribe = () => () => {};

function isDismissed(storageKey: string) {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false; // localStorage blocked — just show it, no harm in that
  }
}

export default function RoleExplainerBanner({
  storageKey, title, body,
}: { storageKey: string; title: string; body: string }) {
  const initiallyDismissed = useSyncExternalStore(subscribe, () => isDismissed(storageKey), () => false);
  const [justDismissed, setJustDismissed] = useState(false);

  function dismiss() {
    setJustDismissed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }

  if (initiallyDismissed || justDismissed) return null;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      background: "rgba(0,98,65,0.08)", border: "1px solid rgba(0,98,65,0.25)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 20,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>{body}</div>
      </div>
      <button
        onClick={dismiss} aria-label="Dismiss"
        style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", padding: 4, flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
