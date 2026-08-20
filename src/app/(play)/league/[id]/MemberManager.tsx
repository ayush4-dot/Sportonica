"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, UserMinus, Search, X } from "lucide-react";
import { removeMember, addMember, searchPlayers } from "@/lib/squads/actions";
import { isActionError } from "@/lib/actionError";
import type { SquadMember } from "@/lib/squads/queries";

// Rendered on the squad page. Creators get invite + remove buttons;
// everyone else just sees the roster.
export default function MemberManager({
  squadId, members, isCreator, meId, accentColor,
}: {
  squadId: string;
  members: SquadMember[];
  isCreator: boolean;
  meId: string | null;
  accentColor: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);

  function remove(userId: string) {
    startTransition(async () => {
      try { await removeMember(squadId, userId); router.refresh(); }
      catch { /* ignore */ }
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "34px 0 14px" }}>
        <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800, margin: 0 }}>
          Members <span style={{ opacity: 0.4, fontWeight: 500 }}>({members.length})</span>
        </h2>
        {isCreator && (
          <button className="play-btn" style={{ padding: "13px 16px", fontSize: 13 }} onClick={() => setShowInvite(true)}>
            <UserPlus size={14} /> Invite players
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {members.map((m) => (
          <div key={m.user_id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 6px", borderBottom: "1px solid var(--line)" }}>
            <Link href={m.username ? `/p/${m.username}` : "#"} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, textDecoration: "none", color: "inherit" }}>
              <Avatar name={m.name} url={m.avatar_url} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                {m.username && <div style={{ fontSize: 12, color: "var(--faint)", fontFamily: "'Inter',sans-serif" }}>@{m.username}</div>}
              </div>
            </Link>

            {m.role === "admin" ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: accentColor, border: `1px solid ${accentColor}55`, background: `${accentColor}14`, padding: "3px 9px", borderRadius: 6 }}>ADMIN</span>
            ) : isCreator && m.user_id !== meId ? (
              <button onClick={() => remove(m.user_id)} disabled={pending}
                title="Remove from squad"
                style={{ background: "none", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <UserMinus size={12} /> Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {showInvite && (
        <InviteModal squadId={squadId} onClose={() => { setShowInvite(false); router.refresh(); }} />
      )}
    </>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const ok = url && /\.(jpe?g|png|gif|webp)$/i.test(url);
  return (
    <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center", fontWeight: 800, color: "#ffffff", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ok ? <img src={url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function InviteModal({ squadId, onClose }: { squadId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; username: string | null; avatar_url: string | null }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      try {
        const res = await searchPlayers(value, squadId);
        setResults(isActionError(res) ? [] : res);
      }
      catch { setResults([]); }
    });
  }

  function invite(userId: string) {
    startTransition(async () => {
      try {
        await addMember(squadId, userId);
        added.add(userId);
        setAdded(new Set(added));
      } catch { /* ignore */ }
    });
  }

  return (
    <div onClick={onClose} className="mm-scrim">
      <style>{MM_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className="mm-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 19, fontWeight: 800 }}>Invite players</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 44, height: 44, display: "grid", placeItems: "center", marginRight: -10 }}><X size={18} /></button>
        </div>

        <div className="mm-search">
          <Search size={15} style={{ opacity: 0.6 }} />
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search by name or @username"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "inherit", fontFamily: "inherit", fontSize: 14 }} />
        </div>

        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {q.trim().length < 2 ? (
            <div style={{ fontSize: 13, opacity: 0.5, padding: "20px 0", textAlign: "center" }}>Type at least 2 characters.</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.5, padding: "20px 0", textAlign: "center" }}>{pending ? "Searching…" : "No players found."}</div>
          ) : results.map((p) => (
            <div key={p.id} className="mm-row">
              <Avatar name={p.name} url={p.avatar_url} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
                {p.username && <div style={{ fontSize: 11.5, opacity: 0.5, fontFamily: "'Inter',sans-serif" }}>@{p.username}</div>}
              </div>
              <button onClick={() => invite(p.id)} disabled={pending || added.has(p.id)}
                style={{ background: added.has(p.id) ? "transparent" : "#006241", color: added.has(p.id) ? "#2E7D5B" : "#ffffff", border: added.has(p.id) ? "1px solid rgba(46,125,91,0.4)" : "none", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {added.has(p.id) ? "Added ✓" : "Add"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MM_CSS = `
.mm-scrim { position: fixed; inset: 0; background: rgba(6,7,10,0.72); backdrop-filter: blur(6px);
  z-index: 400; display: grid; place-items: center; padding: 20px; }
.mm-card { width: 100%; max-width: 420px; background: #14171E; border: 1px solid rgba(242,237,230,0.12);
  border-radius: 16px; padding: 22px; color: #F2EDE6; }
[data-theme="paper"] .mm-card { background: #fff; border-color: rgba(20,23,30,0.1); color: #14171E; }
.mm-search { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(128,128,128,0.3);
  border-radius: 10px; padding: 13px 12px; margin-bottom: 14px; }
.mm-row { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
[data-theme="paper"] .mm-row { border-bottom-color: rgba(20,23,30,0.08); }
`;
