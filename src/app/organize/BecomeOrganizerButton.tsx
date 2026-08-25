"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { becomeOrganizer } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

export default function BecomeOrganizerButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    setErr(null);
    startTransition(async () => {
      const res = await becomeOrganizer();
      if (isActionError(res)) {
        if (res.message === "UNAUTHORIZED") {
          router.push(`/login?redirect=${encodeURIComponent("/organize")}`);
          return;
        }
        setErr(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button className="adm-btn primary" onClick={go} disabled={pending}>
        {pending ? "Setting up…" : "Become an organizer"}
      </button>
      {err && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{err}</p>}
    </>
  );
}
