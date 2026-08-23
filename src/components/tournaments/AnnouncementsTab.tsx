"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postTournamentAnnouncement } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { TournamentAnnouncement } from "@/lib/tournaments/types";

const inputStyle: React.CSSProperties = {
  padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

export default function AnnouncementsTab({ tournamentId, announcements }: {
  tournamentId: string;
  announcements: TournamentAnnouncement[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function post() {
    setErr(null);
    startTransition(async () => {
      const res = await postTournamentAnnouncement(tournamentId, title, body || undefined);
      if (isActionError(res)) { setErr(res.message); return; }
      setTitle(""); setBody("");
      router.refresh();
    });
  }

  return (
    <div className="tc-card">
      <div className="tc-card-t">Announcements</div>
      <div className="tc-card-sub">Posted here and sent as a notification to every confirmed team&apos;s captain.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 20px" }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        {err && <div className="tc-err">{err}</div>}
        <button className="tc-btn primary" disabled={pending || !title.trim()} onClick={post} style={{ alignSelf: "flex-start" }}>
          Post announcement
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="tc-empty">No announcements yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {announcements.map((a) => (
            <div key={a.id} style={{ borderBottom: "1px solid rgba(242,237,230,0.08)", paddingBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.title}</div>
              {a.body && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{a.body}</div>}
              <div className="tc-dim" style={{ fontSize: 11.5, marginTop: 6 }}>
                {new Date(a.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
