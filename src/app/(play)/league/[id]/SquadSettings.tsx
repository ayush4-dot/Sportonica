"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, EyeOff, Eye } from "lucide-react";
import { setSquadLocked, setSquadUnlisted } from "@/lib/squads/actions";

// Only rendered for the squad creator.
export default function SquadSettings({
  squadId, initialLocked, initialUnlisted,
}: { squadId: string; initialLocked: boolean; initialUnlisted: boolean }) {
  const router = useRouter();
  const [locked, setLocked] = useState(initialLocked);
  const [unlisted, setUnlisted] = useState(initialUnlisted);
  const [pending, startTransition] = useTransition();

  function toggleLock() {
    const next = !locked;
    setLocked(next);
    startTransition(async () => { await setSquadLocked(squadId, next); router.refresh(); });
  }
  function toggleUnlisted() {
    const next = !unlisted;
    setUnlisted(next);
    startTransition(async () => { await setSquadUnlisted(squadId, next); router.refresh(); });
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginTop: 18 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.5, marginBottom: 14 }}>
        Squad settings
      </div>

      <Row
        icon={locked ? <Lock size={15} /> : <Unlock size={15} />}
        title={locked ? "Locked" : "Open to join"}
        note={locked ? "No new members can join." : "Anyone can join from the squad list."}
        on={locked}
        onToggle={toggleLock}
        disabled={pending}
      />

      <Row
        icon={unlisted ? <EyeOff size={15} /> : <Eye size={15} />}
        title={unlisted ? "Unlisted" : "Public"}
        note={unlisted ? "Hidden from the squads list — shareable by link only." : "Shows in the public squads list."}
        on={unlisted}
        onToggle={toggleUnlisted}
        disabled={pending}
      />
    </div>
  );
}

function Row({
  icon, title, note, on, onToggle, disabled,
}: { icon: React.ReactNode; title: string; note: string; on: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "10px 0" }}>
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
        <span style={{ opacity: 0.7, marginTop: 2 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{note}</div>
        </div>
      </div>
      <button onClick={onToggle} disabled={disabled} aria-label={title}
        style={{ width: 44, height: 25, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
          background: on ? "#FFC93C" : "rgba(128,128,128,0.35)", transition: "background 0.3s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left 0.3s cubic-bezier(0.22,1,0.36,1)" }} />
      </button>
    </div>
  );
}
