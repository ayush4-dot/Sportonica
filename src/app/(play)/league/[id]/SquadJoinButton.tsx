"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserPlus } from "lucide-react";
import { joinSquad, leaveSquad } from "@/lib/squads/actions";
import { isActionError } from "@/lib/actionError";

export default function SquadJoinButton({ squadId, initialJoined }: { squadId: string; initialJoined: boolean }) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      try {
        if (joined) {
          const res = await leaveSquad(squadId);
          if (isActionError(res)) { handleErr(res.message); return; }
          setJoined(false);
        } else {
          const res = await joinSquad(squadId);
          if (isActionError(res)) { handleErr(res.message); return; }
          setJoined(true);
        }
        router.refresh();
      } catch (e) {
        if (e instanceof Error) handleErr(e.message);
      }
    });

    function handleErr(message: string) {
      if (message.includes("UNAUTHORIZED")) {
        router.push(`/login?redirect=/league/${squadId}`);
        return;
      }
      if (message.includes("SQUAD_LOCKED") || message.includes("SQUAD_FULL")) {
        setMsg("This squad is locked — no new members.");
        return;
      }
    }
  }

  return (
    <div>
      <button className={`play-btn ${joined ? "ghost" : ""}`} onClick={toggle} disabled={pending}>
        {joined ? <><Check size={15} /> Joined — tap to leave</> : <><UserPlus size={15} /> Join this squad</>}
      </button>
      {msg && <div style={{ fontSize: 12.5, color: "#ef4444", marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
