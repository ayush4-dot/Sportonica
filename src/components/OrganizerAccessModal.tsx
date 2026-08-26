"use client";

import { useEffect, useState } from "react";
import { X, Trophy, Clock, Check } from "lucide-react";
import { getMyRole, requestOrganizerAccess } from "@/lib/organizer/actions";
import { isActionError } from "@/lib/actionError";

type Stage = "checking" | "loggedOut" | "canRequest" | "pending" | "justRequested";

// Clicking the header's trophy icon checks the real role fresh (server
// truth, profiles.role — not the client-side useProfile() hook, which
// mirrors auth user_metadata and was never wired to organizer status)
// each time, rather than baking it into the header's own render. Already
// organizer/super_admin skips the popup entirely and goes straight to
// /organize — the popup only exists for the request/pending states.
export default function OrganizerAccessModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("checking");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMyRole().then((role) => {
      if (role === null) setStage("loggedOut");
      else if (role === "organizer_pending") setStage("pending");
      else setStage("canRequest");
    });
  }, []);

  function request() {
    setErr(null);
    setPending(true);
    requestOrganizerAccess()
      .then((res) => {
        if (isActionError(res)) { setErr(res.message); return; }
        setStage("justRequested");
      })
      .finally(() => setPending(false));
  }

  return (
    <div className="oam-scrim" onClick={onClose}>
      <div className="oam-card" onClick={(e) => e.stopPropagation()}>
        <button className="oam-x" onClick={onClose} aria-label="Close"><X size={18} /></button>

        {stage === "checking" && <div className="oam-body"><p>Checking…</p></div>}

        {stage === "loggedOut" && (
          <div className="oam-body">
            <Trophy size={28} className="oam-icon" />
            <h3>Run your own tournaments</h3>
            <p>Log in first, then request organizer access.</p>
            <a href={`/login?redirect=${encodeURIComponent("/organize")}`} className="oam-btn primary">Log in</a>
          </div>
        )}

        {stage === "canRequest" && (
          <div className="oam-body">
            <Trophy size={28} className="oam-icon" />
            <h3>Request to become an Organizer</h3>
            <p>
              Run tournaments — fixtures, teams, results, announcements. Use your own venue
              directly, or invite a Sportonica venue to host. Sportonica reviews your request
              first, then reviews each tournament the same as anyone else&apos;s.
            </p>
            {err && <div className="oam-err">{err}</div>}
            <button className="oam-btn primary" onClick={request} disabled={pending}>
              {pending ? "Sending…" : "Request organizer access"}
            </button>
          </div>
        )}

        {stage === "justRequested" && (
          <div className="oam-body">
            <Check size={28} className="oam-icon" style={{ color: "#006241" }} />
            <h3>Request sent</h3>
            <p>Sportonica will review it shortly. You&apos;ll get this same popup until you&apos;re approved.</p>
            <button className="oam-btn" onClick={onClose}>Close</button>
          </div>
        )}

        {stage === "pending" && (
          <div className="oam-body">
            <Clock size={28} className="oam-icon" />
            <h3>Waiting for review</h3>
            <p>Your request to become an organizer is with Sportonica — check back soon.</p>
            <button className="oam-btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>

      <style>{`
        .oam-scrim { position: fixed; inset: 0; z-index: 700; padding: 20px; display: flex; align-items: center; justify-content: center; background: rgba(4,6,9,.72); backdrop-filter: blur(6px); }
        .oam-card { position: relative; width: 100%; max-width: 400px; border-radius: 20px; padding: 28px 24px 24px; background: #12151b; border: 1px solid rgba(242,237,230,.12); color: #F2EDE6; }
        [data-theme="paper"] .oam-card { background: #F8F5F0; border-color: rgba(20,23,30,.12); color: #14171E; }
        .oam-x { position: absolute; top: 14px; right: 14px; background: none; border: none; color: inherit; opacity: .6; cursor: pointer; padding: 4px; }
        .oam-body { text-align: center; display: flex; flex-direction: column; align-items: center; }
        .oam-icon { opacity: .8; margin-bottom: 12px; }
        .oam-body h3 { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 800; margin: 0 0 8px; }
        .oam-body p { font-size: 13.5px; opacity: .7; line-height: 1.5; margin: 0 0 20px; max-width: 320px; }
        .oam-btn { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.35); border-radius: 11px; padding: 11px 20px; font-weight: 700; font-size: 13.5px; cursor: pointer; text-decoration: none; font-family: inherit; }
        .oam-btn.primary { background: #006241; color: #fff; border: none; }
        .oam-btn:disabled { opacity: .6; cursor: default; }
        .oam-err { color: #ef4444; font-size: 12.5px; margin: -10px 0 16px; }
      `}</style>
    </div>
  );
}
