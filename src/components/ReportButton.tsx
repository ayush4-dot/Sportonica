"use client";

import { useState, useTransition } from "react";
import { Flag, X, Check } from "lucide-react";
import { fileReport } from "@/lib/squads/actions";

const REASONS = [
  "Harassment or abuse",
  "Spam or scam",
  "Inappropriate content",
  "Fake or misleading",
  "Something else",
];

export default function ReportButton({
  targetType, targetId, label = "Report",
}: { targetType: "message" | "squad" | "user"; targetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await fileReport({ target_type: targetType, target_id: targetId, reason, details });
        setSent(true);
        setTimeout(() => { setOpen(false); setSent(false); setDetails(""); }, 1600);
      } catch (e) {
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) {
          window.location.href = "/login";
        }
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none",
          color: "var(--faint)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: 4 }}
        title="Report">
        <Flag size={12} />{label ? ` ${label}` : ""}
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,7,10,0.72)", backdropFilter: "blur(6px)", zIndex: 500, display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, background: "#14171E", border: "1px solid rgba(242,237,230,0.12)", borderRadius: 16, padding: 24, color: "#F2EDE6" }}>
            {sent ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <Check size={28} style={{ color: "#2E7D5B", marginBottom: 10 }} />
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 800 }}>Report sent</div>
                <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>Our team will review it. Thanks for keeping Khelam Na safe.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 19, fontWeight: 800 }}>Report {targetType}</h3>
                  <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer" }}><X size={18} /></button>
                </div>

                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>What&apos;s wrong?</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 9, padding: "10px 12px", color: "inherit", fontFamily: "inherit", fontSize: 14, marginBottom: 14 }}>
                  {REASONS.map((r) => <option key={r} style={{ background: "#14171E" }}>{r}</option>)}
                </select>

                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>Details (optional)</label>
                <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)}
                  placeholder="Anything that helps us understand…"
                  style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 9, padding: "10px 12px", color: "inherit", fontFamily: "inherit", fontSize: 14, marginBottom: 16 }} />

                <button onClick={submit} disabled={pending}
                  style={{ width: "100%", background: "#DE3163", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {pending ? "Sending…" : "Send report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
