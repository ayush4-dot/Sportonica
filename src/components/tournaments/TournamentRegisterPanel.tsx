"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, UserMinus, UserPlus, X } from "lucide-react";
import {
  registerTeam, getTeamRoster, searchPlayersForTeam, addTeamPlayer, removeTeamPlayer,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";
import { TEAM_STATUS_LABELS, type Tournament, type TournamentTeam } from "@/lib/tournaments/types";

type RosterPlayer = { id: string; team_id: string; user_id: string | null; role: string; name: string; username: string | null; avatar_url: string | null };

export default function TournamentRegisterPanel({
  tournament, initialTeam, loggedIn,
}: {
  tournament: Tournament;
  initialTeam: TournamentTeam | null;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [team, setTeam] = useState(initialTeam);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [ackTerms, setAckTerms] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!team) return;
    getTeamRoster(team.id).then((r) => { if (!isActionError(r)) setRoster(r); });
  }, [team]);

  function submitRegister() {
    if (!teamName.trim()) { setErr("Enter a team name."); return; }
    if (!managerName.trim()) { setErr("Enter the team manager's name."); return; }
    if (!managerPhone.trim()) { setErr("Enter the team manager's phone number."); return; }
    if (!ackTerms) { setErr("You need to agree to the terms to register."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await registerTeam(tournament.id, teamName.trim(), ackTerms, managerName.trim(), managerPhone.trim());
      if (isActionError(res)) { setErr(res.message); return; }
      setTeam(res);
    });
  }

  if (!loggedIn) {
    return (
      <div className="bk-panel">
        <h3>Register a team</h3>
        <p style={{ fontSize: 13.5, opacity: 0.7, margin: "8px 0 16px" }}>Log in to register a team for this tournament.</p>
        <a href={`/login?redirect=${encodeURIComponent(`/tournaments/${tournament.id}`)}`} className="play-btn">Log in</a>
      </div>
    );
  }

  if (!team) {
    if (tournament.status !== "registration_open") {
      return (
        <div className="bk-panel">
          <h3>Registration</h3>
          <p style={{ fontSize: 13.5, opacity: 0.7, margin: "8px 0 0" }}>
            {tournament.status === "registration_closed" || tournament.status === "live" || tournament.status === "completed"
              ? "Registration for this tournament is closed."
              : "Registration hasn't opened yet — check back soon."}
          </p>
        </div>
      );
    }
    return (
      <div className="bk-panel">
        <h3>Register a team</h3>
        <div className="ev-field" style={{ marginTop: 12 }}>
          <label>Team name</label>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Your team's name" />
        </div>
        <div className="ev-field" style={{ marginTop: 12 }}>
          <label>Team manager&apos;s name</label>
          <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Who should other teams contact" />
        </div>
        <div className="ev-field" style={{ marginTop: 12 }}>
          <label>Team manager&apos;s phone</label>
          <input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="98XXXXXXXX" />
        </div>
        <p style={{ fontSize: 11.5, opacity: 0.55, margin: "6px 0 0" }}>
          Shown publicly on this tournament&apos;s Teams tab, so opposing teams and organizers can reach you.
        </p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, opacity: 0.75, margin: "10px 0 16px", cursor: "pointer" }}>
          <input type="checkbox" checked={ackTerms} onChange={(e) => setAckTerms(e.target.checked)} style={{ marginTop: 2 }} />
          I agree to the tournament rules{tournament.refund_policy ? " and refund policy" : ""}.
        </label>
        {err && <div className="ev-err">{err}</div>}
        <button className="play-btn" onClick={submitRegister} disabled={pending}>
          {pending ? "Registering…" : "Register team"}
        </button>
      </div>
    );
  }

  return (
    <div className="bk-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ marginBottom: 0 }}>{team.name}</h3>
        <span className={`tt-status ${team.status}`}>{TEAM_STATUS_LABELS[team.status]}</span>
      </div>

      {team.status === "confirmed" && (
        <p style={{ fontSize: 13.5, color: "#006241", fontWeight: 600, margin: "8px 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={15} /> Your team&apos;s spot is confirmed.
        </p>
      )}
      {team.status === "verification_pending" && (
        <p style={{ fontSize: 13.5, opacity: 0.7, margin: "8px 0 16px" }}>Payment submitted — awaiting verification.</p>
      )}
      {(team.status === "rejected" || team.status === "withdrawn") && (
        <>
          <p style={{ fontSize: 13.5, color: "#ef4444", margin: "8px 0 16px" }}>
            {team.status === "rejected" ? "Your registration wasn't approved." : "You withdrew from this tournament."} You can register again below.
          </p>
          <div className="ev-field">
            <label>Team name</label>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Your team's name" />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, opacity: 0.75, margin: "10px 0 16px", cursor: "pointer" }}>
            <input type="checkbox" checked={ackTerms} onChange={(e) => setAckTerms(e.target.checked)} style={{ marginTop: 2 }} />
            I agree to the tournament rules{tournament.refund_policy ? " and refund policy" : ""}.
          </label>
          {err && <div className="ev-err">{err}</div>}
          <button className="play-btn" onClick={submitRegister} disabled={pending || tournament.status !== "registration_open"}>
            {pending ? "Registering…" : "Register again"}
          </button>
        </>
      )}

      {(team.status === "pending" || team.status === "payment_pending" || team.status === "confirmed" || team.status === "verification_pending") && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Roster ({roster.length}/{tournament.max_players_per_team})
            </div>
            {tournament.status === "registration_open" && roster.length < tournament.max_players_per_team && (
              <button className="play-btn" style={{ padding: "9px 13px", fontSize: 12.5 }} onClick={() => setShowInvite(true)}>
                <UserPlus size={13} /> Add player
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {roster.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 13.5 }}>{p.name} {p.role === "captain" && <span style={{ opacity: 0.5, fontSize: 11 }}>(captain)</span>}</div>
                {p.role !== "captain" && tournament.status === "registration_open" && (
                  <button
                    aria-label={`Remove ${p.name} from the team`}
                    onClick={() => {
                      if (!p.user_id) return;
                      if (!window.confirm(`Remove ${p.name} from the team?`)) return;
                      startTransition(async () => {
                        await removeTeamPlayer(team.id, p.user_id!);
                        const r = await getTeamRoster(team.id);
                        if (!isActionError(r)) setRoster(r);
                      });
                    }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", opacity: 0.7 }}
                  ><UserMinus size={15} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {team.status === "payment_pending" && tournament.fee > 0 && (
        <div style={{ marginTop: 20 }}>
          <PaymentStep
            bookingType="tournament_registration"
            bookingId={team.id}
            amount={tournament.fee}
            summary={[{ label: "Team", value: team.name }, { label: "Tournament", value: tournament.name }]}
          />
        </div>
      )}

      {showInvite && (
        <InviteModal
          teamId={team.id}
          onClose={() => setShowInvite(false)}
          onAdded={async () => { const r = await getTeamRoster(team.id); if (!isActionError(r)) setRoster(r); router.refresh(); }}
        />
      )}

      <style>{`
        .tt-status { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: capitalize; white-space: nowrap; }
        .tt-status.confirmed { background: rgba(0,98,65,.14); color: #006241; }
        .tt-status.payment_pending, .tt-status.verification_pending, .tt-status.pending { background: rgba(217,119,6,.14); color: #d97706; }
        .tt-status.rejected, .tt-status.withdrawn { background: rgba(239,68,68,.14); color: #ef4444; }
      `}</style>
    </div>
  );
}

function InviteModal({ teamId, onClose, onAdded }: { teamId: string; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; username: string | null; avatar_url: string | null }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const res = await searchPlayersForTeam(value, teamId);
      setResults(isActionError(res) ? [] : res);
    });
  }

  function invite(userId: string) {
    startTransition(async () => {
      const res = await addTeamPlayer(teamId, userId);
      if (!isActionError(res)) { added.add(userId); setAdded(new Set(added)); onAdded(); }
    });
  }

  return (
    <div onClick={onClose} className="tim-scrim">
      <style>{TIM_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className="tim-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 19, fontWeight: 800 }}>Add a player</h3>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 44, height: 44, display: "grid", placeItems: "center", marginRight: -10 }}><X size={18} /></button>
        </div>
        <div className="tim-search">
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
            <div key={p.id} className="tim-row">
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(150deg,#006241,#1e3932)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
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

const TIM_CSS = `
.tim-scrim { position: fixed; inset: 0; background: rgba(6,7,10,0.72); backdrop-filter: blur(6px);
  z-index: 400; display: grid; place-items: center; padding: 20px; }
.tim-card { width: 100%; max-width: 420px; background: #14171E; border: 1px solid rgba(242,237,230,0.12);
  border-radius: 16px; padding: 22px; color: #F2EDE6; }
[data-theme="paper"] .tim-card { background: #fff; border-color: rgba(20,23,30,0.1); color: #14171E; }
.tim-search { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(128,128,128,0.3);
  border-radius: 10px; padding: 13px 12px; margin-bottom: 14px; }
.tim-row { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
[data-theme="paper"] .tim-row { border-bottom-color: rgba(20,23,30,0.08); }
`;
