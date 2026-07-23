"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Plus, X, Check, Lock } from "lucide-react";
import { createPoll, castVote, closePoll } from "@/lib/squads/polls";
import type { PollRow } from "@/lib/squads/queries";

export default function SquadPolls({
  squadId, polls, isMember, meId,
}: { squadId: string; polls: PollRow[]; isMember: boolean; meId: string | null }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  function vote(pollId: string, optionId: string) {
    startTransition(async () => {
      try { await castVote(pollId, optionId, squadId); router.refresh(); }
      catch (e) {
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) window.location.href = "/login";
      }
    });
  }

  function close(pollId: string) {
    startTransition(async () => { await closePoll(pollId, squadId); router.refresh(); });
  }

  if (!isMember) return null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "34px 0 14px" }}>
        <h2 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 800, margin: 0 }}>
          Polls {polls.length > 0 && <span style={{ opacity: 0.4, fontWeight: 500 }}>({polls.length})</span>}
        </h2>
        <button className="play-btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New poll
        </button>
      </div>

      {polls.length === 0 ? (
        <div style={{ border: "1px dashed var(--line)", borderRadius: 14, padding: "26px 20px", textAlign: "center", color: "var(--dim)" }}>
          <BarChart3 size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div style={{ fontSize: 13.5 }}>No polls yet. Ask the squad when to play, which venue, anything.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {polls.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{p.question}</div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>
                    {p.totalVotes} vote{p.totalVotes !== 1 ? "s" : ""}
                    {p.multi && " · pick many"}
                    {p.closed && " · closed"}
                  </div>
                </div>
                {p.creator_id === meId && !p.closed && (
                  <button onClick={() => close(p.id)} disabled={pending}
                    style={{ background: "none", border: "1px solid rgba(128,128,128,0.3)", color: "var(--dim)", borderRadius: 8, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <Lock size={11} /> Close
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p.options.map((o) => {
                  const pct = p.totalVotes > 0 ? Math.round((o.votes / p.totalVotes) * 100) : 0;
                  const mine = p.myVotes.includes(o.option_id);
                  return (
                    <button key={o.option_id}
                      onClick={() => !p.closed && vote(p.id, o.option_id)}
                      disabled={pending || p.closed}
                      style={{
                        position: "relative", overflow: "hidden", textAlign: "left",
                        border: `1px solid ${mine ? "rgba(255,201,60,0.5)" : "var(--line)"}`,
                        background: "transparent", borderRadius: 10, padding: "11px 13px",
                        cursor: p.closed ? "default" : "pointer", color: "inherit",
                        fontFamily: "inherit", width: "100%",
                      }}>
                      {/* fill bar */}
                      <span style={{ position: "absolute", inset: 0, width: `${pct}%`,
                        background: mine ? "rgba(255,201,60,0.16)" : "rgba(128,128,128,0.12)",
                        transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)" }} />
                      <span style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: mine ? 700 : 500, display: "inline-flex", alignItems: "center", gap: 7 }}>
                          {mine && <Check size={13} style={{ color: "#FFC93C" }} />}
                          {o.label}
                        </span>
                        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "var(--dim)", flexShrink: 0 }}>
                          {o.votes} · {pct}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePollModal squadId={squadId} onClose={() => { setShowCreate(false); router.refresh(); }} />
      )}
    </>
  );
}

function CreatePollModal({ squadId, onClose }: { squadId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setOpt(i: number, v: string) {
    const next = [...options]; next[i] = v; setOptions(next);
  }

  function submit() {
    setErr(null);
    startTransition(async () => {
      try {
        await createPoll({ squadId, question, options, multi });
        onClose();
      } catch (e) {
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) { window.location.href = "/login"; return; }
        setErr(e instanceof Error ? e.message : "Couldn't create the poll.");
      }
    });
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,7,10,0.72)", backdropFilter: "blur(6px)", zIndex: 400, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, background: "#14171E", border: "1px solid rgba(242,237,230,0.12)", borderRadius: 16, padding: 22, color: "#F2EDE6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 19, fontWeight: 800 }}>New poll</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <input className="pl-in" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="When should we play this week?" style={{ marginBottom: 14 }} />

        {options.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="pl-in" value={o} onChange={(e) => setOpt(i, e.target.value)}
              placeholder={`Option ${i + 1}`} />
            {options.length > 2 && (
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                style={{ background: "none", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 9, color: "inherit", opacity: 0.6, cursor: "pointer", padding: "0 10px" }}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {options.length < 6 && (
          <button onClick={() => setOptions([...options, ""])}
            style={{ background: "none", border: "1px dashed rgba(128,128,128,0.4)", borderRadius: 9, color: "inherit", opacity: 0.7, cursor: "pointer", padding: "9px 12px", fontSize: 13, width: "100%", marginBottom: 14, fontFamily: "inherit" }}>
            + Add option
          </button>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          Let people pick more than one
        </label>

        {err && <div style={{ color: "#DE3163", fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <button onClick={submit} disabled={pending}
          style={{ width: "100%", background: "#FFC93C", color: "#0B0D11", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          {pending ? "Creating…" : "Post poll"}
        </button>

        <style>{`
          .pl-in { width: 100%; box-sizing: border-box; background: transparent;
            border: 1px solid rgba(128,128,128,0.28); border-radius: 10px;
            padding: 10px 12px; color: inherit; font-family: inherit; font-size: 14px; }
          .pl-in:focus { outline: none; border-color: #FFC93C; }
        `}</style>
      </div>
    </div>
  );
}
