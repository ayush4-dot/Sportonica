"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserPlus } from "lucide-react";
import { joinSquad, leaveSquad } from "@/lib/squads/actions";

export default function SquadJoinButton({ squadId, initialJoined }: { squadId: string; initialJoined: boolean }) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      try {
        if (joined) { await leaveSquad(squadId); setJoined(false); }
        else { await joinSquad(squadId); setJoined(true); }
        router.refresh();
      } catch (e) {
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) {
          router.push(`/login?redirect=/league/${squadId}`);
          return;
        }
        if (e instanceof Error && e.message.includes("SQUAD_LOCKED")) {
          setMsg("This squad is locked — no new members.");
          return;
        }
      }
    });
  }

  return (
    <div>
      <button className={`play-btn ${joined ? "ghost" : ""}`} onClick={toggle} disabled={pending}>
        {joined ? <><Check size={15} /> Joined — tap to leave</> : <><UserPlus size={15} /> Join this squad</>}
      </button>
      {msg && <div style={{ fontSize: 12.5, color: "#DE3163", marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
