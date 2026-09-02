"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserMinus, UserPlus, X } from "lucide-react";
import {
  registerTeam, getTeamRoster, addTeamGuestPlayer, removeTeamGuestPlayer,
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
    if (!ackTerms) { setErr("You need to agree to the terms to register."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await registerTeam(
        tournament.id, teamName.trim(), ackTerms,
        managerName.trim() || undefined, managerPhone.trim() || undefined
      );
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
          <label>Team manager&apos;s name <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
          <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Who should other teams contact" />
        </div>
        <div className="ev-field" style={{ marginTop: 12 }}>
          <label>Team manager&apos;s phone <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
          <input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="98XXXXXXXX" />
        </div>
        <p style={{ fontSize: 11.5, opacity: 0.55, margin: "6px 0 0" }}>
          If given, shown publicly on this tournament&apos;s Teams tab, so opposing teams and organizers can reach you.
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
                      if (!window.confirm(`Remove ${p.name} from the team?`)) return;
                      startTransition(async () => {
                        const res = await removeTeamGuestPlayer(p.id);
                        if (isActionError(res)) { setErr(res.message); return; }
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
            hostMethod={
              tournament.host_payment_qr_url
                ? {
                    qrUrl: tournament.host_payment_qr_url,
                    merchantName: tournament.host_payment_name ?? tournament.organizer_name ?? "Tournament organizer",
                    account: tournament.host_payment_account,
                    method: tournament.host_payment_method ?? "esewa",
                  }
                : undefined
            }
          />
        </div>
      )}

      {showInvite && (
        <AddPlayerModal
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

// Captain builds their roster by entering each teammate's details —
// name required, email + phone optional. Each teammate is a guest entry
// that auto-links to their account when they sign in with a matching
// email or phone. Stays open so several players can be added in a row.
function AddPlayerModal({ teamId, onClose, onAdded }: { teamId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"player" | "substitute">("player");
  const [err, setErr] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) { setErr("Enter the player's name."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await addTeamGuestPlayer(teamId, name.trim(), phone.trim() || undefined, email.trim() || undefined, role);
      if (isActionError(res)) { setErr(res.message); return; }
      setJustAdded(name.trim());
      setName(""); setEmail(""); setPhone(""); setRole("player");
      onAdded();
      setTimeout(() => setJustAdded(null), 3000);
    });
  }

  return (
    <div onClick={onClose} className="tim-scrim">
      <style>{TIM_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className="tim-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 19, fontWeight: 800 }}>Add a player</h3>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 44, height: 44, display: "grid", placeItems: "center", marginRight: -10 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 14px" }}>
          Only a name is required. Add an email so this player can sign in later and see their own stats.
        </p>

        <input className="tim-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Player's name" />
        <input className="tim-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
        <input className="tim-in" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
        <select className="tim-in" value={role} onChange={(e) => setRole(e.target.value as "player" | "substitute")}>
          <option value="player">Player</option>
          <option value="substitute">Substitute</option>
        </select>

        {err && <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
        {justAdded && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontWeight: 600, fontSize: 12.5, marginTop: 8 }}>
            <Check size={14} /> Added {justAdded}.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={add} disabled={pending}
            style={{ flex: 1, background: "#006241", color: "#fff", border: "none", borderRadius: 8, padding: "12px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {pending ? "Adding…" : "Add player"}
          </button>
          <button onClick={onClose}
            style={{ background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.35)", borderRadius: 8, padding: "12px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Done
          </button>
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
.tim-in { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 12px 12px; border-radius: 10px;
  border: 1px solid rgba(128,128,128,0.3); background: transparent; color: inherit; font-family: inherit; font-size: 14px; }
.tim-in:focus { outline: none; border-color: #006241; }
`;
