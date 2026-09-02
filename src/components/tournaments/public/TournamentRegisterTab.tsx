"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Trophy, Users, UserPlus, X, Trash2, Clock, LogIn, CalendarDays, Wallet, ShieldCheck,
} from "lucide-react";
import {
  registerTeam, setManagerPlays, getTeamRoster, addTeamGuestPlayer, removeTeamGuestPlayer,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";
import { type Tournament, type TournamentTeam } from "@/lib/tournaments/types";

type RosterPlayer = { id: string; user_id: string | null; role: string; name: string; username: string | null; avatar_url: string | null };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });

export default function TournamentRegisterTab({
  tournament, initialTeam, loggedIn, confirmedCount,
}: {
  tournament: Tournament;
  initialTeam: TournamentTeam | null;
  loggedIn: boolean;
  confirmedCount: number;
}) {
  const router = useRouter();
  const [team, setTeam] = useState(initialTeam);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [teamName, setTeamName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [iPlay, setIPlay] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const managerOnRoster = !!team && roster.some((p) => p.user_id === team.captain_id);
  const openSlots = Math.max(0, tournament.max_teams - confirmedCount);
  const regOpen = tournament.status === "registration_open";
  const paid = tournament.fee > 0;

  useEffect(() => {
    if (!team) return;
    getTeamRoster(team.id).then((r) => { if (!isActionError(r)) setRoster(r); });
  }, [team]);

  function submitRegister() {
    if (!teamName.trim()) { setErr("Give your team a name."); return; }
    if (!ackTerms) { setErr("Please agree to the tournament rules to register."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await registerTeam(
        tournament.id, teamName.trim(), ackTerms,
        managerName.trim() || undefined, managerPhone.trim() || undefined, iPlay,
      );
      if (isActionError(res)) { setErr(res.message); return; }
      setTeam(res);
      router.refresh();
    });
  }

  function toggleIPlay(next: boolean) {
    if (!team) return;
    setErr(null);
    startTransition(async () => {
      const res = await setManagerPlays(team.id, next);
      if (isActionError(res)) { setErr(res.message); return; }
      const r = await getTeamRoster(team.id);
      if (!isActionError(r)) setRoster(r);
    });
  }

  function removePlayer(p: RosterPlayer) {
    if (!window.confirm(`Remove ${p.name} from the roster?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await removeTeamGuestPlayer(p.id);
      if (isActionError(res)) { setErr(res.message); return; }
      const r = team ? await getTeamRoster(team.id) : null;
      if (r && !isActionError(r)) setRoster(r);
    });
  }

  // ── Hero (always shown) ──────────────────────────────────────────
  const hero = (
    <div className="rgt-hero">
      <div className="rgt-hero-badge"><Trophy size={18} /></div>
      <div className="rgt-hero-main">
        <div className="rgt-hero-eyebrow">{tournament.sport} · Team registration</div>
        <h2 className="rgt-hero-title">{tournament.name}</h2>
      </div>
      <div className="rgt-hero-facts">
        <div className="rgt-fact">
          <Wallet size={13} />
          <span>{paid ? rs(tournament.fee) : "Free entry"}</span>
        </div>
        <div className="rgt-fact">
          <CalendarDays size={13} />
          <span>Closes {dateLabel(tournament.registration_closes_at)}</span>
        </div>
        <div className="rgt-fact">
          <Users size={13} />
          <span>{openSlots > 0 ? `${openSlots} of ${tournament.max_teams} slots open` : "Full"}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rgt">
      <style>{RGT_CSS}</style>

      {/* ── Not signed in ─────────────────────────────────────────── */}
      {!loggedIn ? (
        <>
          {hero}
          <div className="rgt-card rgt-center">
            <div className="rgt-lock"><LogIn size={20} /></div>
            <h3>Sign in to register your team</h3>
            <p>You&apos;ll manage the team, add players and pay — all from here.</p>
            <a className="rgt-btn primary" href={`/login?redirect=${encodeURIComponent(`/tournaments/${tournament.id}`)}`}>
              <LogIn size={15} /> Sign in
            </a>
          </div>
        </>
      ) : !team && !regOpen ? (
        /* ── Registration not open ──────────────────────────────── */
        <>
          {hero}
          <div className="rgt-card rgt-center">
            <div className="rgt-lock"><Clock size={20} /></div>
            <h3>
              {tournament.status === "published"
                ? "Registration hasn't opened yet"
                : "Registration is closed"}
            </h3>
            <p>
              {tournament.status === "published"
                ? `Opens ${dateLabel(tournament.registration_opens_at)}.`
                : "Follow the tournament for updates on the tabs above."}
            </p>
          </div>
        </>
      ) : !team ? (
        /* ── Step 1: create the team ────────────────────────────── */
        <>
          {hero}
          <Stepper active={0} paid={paid} />
          <div className="rgt-card">
            <div className="rgt-step-t">Your team</div>
            <label className="rgt-label">Team name</label>
            <input className="rgt-in" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Everest United" />

            <div className="rgt-row">
              <div>
                <label className="rgt-label">Manager name <span className="rgt-opt">optional</span></label>
                <input className="rgt-in" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Point of contact" />
              </div>
              <div>
                <label className="rgt-label">Manager phone <span className="rgt-opt">optional</span></label>
                <input className="rgt-in" value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="98XXXXXXXX" />
              </div>
            </div>
            <p className="rgt-hint">Shown on the Teams tab so opponents and organisers can reach you.</p>

            <label className="rgt-check">
              <input type="checkbox" checked={iPlay} onChange={(e) => setIPlay(e.target.checked)} />
              <span>I&apos;m also playing — add me to the roster</span>
            </label>
            <label className="rgt-check">
              <input type="checkbox" checked={ackTerms} onChange={(e) => setAckTerms(e.target.checked)} />
              <span>I agree to the tournament rules{tournament.refund_policy ? " and refund policy" : ""}.</span>
            </label>

            {err && <div className="rgt-err">{err}</div>}
            <button className="rgt-btn primary rgt-btn-lg" onClick={submitRegister} disabled={pending}>
              {pending ? "Creating team…" : "Create team"}
            </button>
          </div>
        </>
      ) : team.status === "confirmed" ? (
        /* ── Confirmed! ─────────────────────────────────────────── */
        <>
          {hero}
          <div className="rgt-card rgt-center rgt-done">
            <div className="rgt-done-mark"><Check size={30} /></div>
            <h3>{team.name} is in! 🎉</h3>
            <p>Your team&apos;s spot is confirmed. Keep the roster up to date until the tournament starts.</p>
            <div className="rgt-done-rows">
              <div><span>Team</span><b>{team.name}</b></div>
              <div><span>Players</span><b>{roster.length}</b></div>
              {paid && <div><span>Entry fee</span><b>{rs(tournament.fee)} · paid</b></div>}
            </div>
          </div>
          <RosterCard
            team={team} roster={roster} tournament={tournament} managerOnRoster={managerOnRoster}
            regOpen={regOpen} onAdd={() => setShowAdd(true)} onRemove={removePlayer}
            onToggleIPlay={toggleIPlay} pending={pending} err={err}
          />
          {showAdd && (
            <AddPlayerModal teamId={team.id} onClose={() => setShowAdd(false)}
              onAdded={async () => { const r = await getTeamRoster(team.id); if (!isActionError(r)) setRoster(r); }} />
          )}
        </>
      ) : (team.status === "rejected" || team.status === "withdrawn") ? (
        /* ── Rejected / withdrawn — register again ──────────────── */
        <>
          {hero}
          <div className="rgt-card">
            <div className="rgt-step-t" style={{ color: "#ef4444" }}>
              {team.status === "rejected" ? "Registration wasn't approved" : "You withdrew from this tournament"}
            </div>
            <p className="rgt-hint" style={{ marginTop: 0 }}>You can register again below.</p>
            <label className="rgt-label">Team name</label>
            <input className="rgt-in" value={teamName || team.name} onChange={(e) => setTeamName(e.target.value)} />
            <label className="rgt-check">
              <input type="checkbox" checked={ackTerms} onChange={(e) => setAckTerms(e.target.checked)} />
              <span>I agree to the tournament rules{tournament.refund_policy ? " and refund policy" : ""}.</span>
            </label>
            {err && <div className="rgt-err">{err}</div>}
            <button className="rgt-btn primary rgt-btn-lg" onClick={submitRegister} disabled={pending || !regOpen}>
              {pending ? "Registering…" : "Register again"}
            </button>
          </div>
        </>
      ) : (
        /* ── Team created — roster (+ payment) ──────────────────── */
        <>
          {hero}
          <Stepper active={team.status === "payment_pending" && paid ? 2 : 1} paid={paid} />

          {team.status === "verification_pending" && (
            <div className="rgt-note"><ShieldCheck size={15} /> Payment submitted — the organiser is verifying it. You&apos;ll be confirmed once it&apos;s approved.</div>
          )}

          <RosterCard
            team={team} roster={roster} tournament={tournament} managerOnRoster={managerOnRoster}
            regOpen={regOpen} onAdd={() => setShowAdd(true)} onRemove={removePlayer}
            onToggleIPlay={toggleIPlay} pending={pending} err={err}
          />

          {team.status === "payment_pending" && paid && (
            <div className="rgt-card">
              <div className="rgt-step-t">Pay the entry fee</div>
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

          {showAdd && (
            <AddPlayerModal teamId={team.id} onClose={() => setShowAdd(false)}
              onAdded={async () => { const r = await getTeamRoster(team.id); if (!isActionError(r)) setRoster(r); }} />
          )}
        </>
      )}
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────
function Stepper({ active, paid }: { active: number; paid: boolean }) {
  const steps = paid ? ["Team", "Roster", "Pay"] : ["Team", "Roster"];
  return (
    <div className="rgt-stepper">
      {steps.map((s, i) => (
        <div key={s} className={`rgt-step ${i < active ? "done" : ""} ${i === active ? "on" : ""}`}>
          <span className="rgt-step-dot">{i < active ? <Check size={12} /> : i + 1}</span>
          <span className="rgt-step-lbl">{s}</span>
        </div>
      ))}
    </div>
  );
}

// ── Roster card ────────────────────────────────────────────────────
function RosterCard({
  team, roster, tournament, managerOnRoster, regOpen, onAdd, onRemove, onToggleIPlay, pending, err,
}: {
  team: TournamentTeam;
  roster: RosterPlayer[];
  tournament: Tournament;
  managerOnRoster: boolean;
  regOpen: boolean;
  onAdd: () => void;
  onRemove: (p: RosterPlayer) => void;
  onToggleIPlay: (next: boolean) => void;
  pending: boolean;
  err: string | null;
}) {
  const full = roster.length >= tournament.max_players_per_team;
  const belowMin = roster.length < tournament.min_players_per_team;
  return (
    <div className="rgt-card">
      <div className="rgt-roster-head">
        <div>
          <div className="rgt-step-t" style={{ marginBottom: 2 }}>Roster</div>
          <div className="rgt-hint" style={{ margin: 0 }}>
            {roster.length} / {tournament.max_players_per_team} players
            {belowMin && <span style={{ color: "#d97706" }}> · need at least {tournament.min_players_per_team}</span>}
          </div>
        </div>
        {regOpen && !full && (
          <button className="rgt-btn primary sm" onClick={onAdd}><UserPlus size={14} /> Add player</button>
        )}
      </div>

      {/* Manager row */}
      <div className="rgt-mgr">
        <span className="rgt-av mgr">{(team.manager_name || "M").charAt(0).toUpperCase()}</span>
        <div style={{ flex: 1 }}>
          <div className="rgt-mgr-name">{team.manager_name || "Team manager"}</div>
          <div className="rgt-mgr-sub">Manager{team.manager_phone ? ` · ${team.manager_phone}` : ""}</div>
        </div>
        {regOpen && (
          <label className="rgt-mini-check" title="Add yourself to the playing roster">
            <input type="checkbox" checked={managerOnRoster} disabled={pending} onChange={(e) => onToggleIPlay(e.target.checked)} />
            <span>Also playing</span>
          </label>
        )}
      </div>

      {roster.length === 0 ? (
        <div className="rgt-roster-empty">No players yet — add your squad above.</div>
      ) : (
        <div className="rgt-roster">
          {roster.map((p) => (
            <div key={p.id} className="rgt-player">
              <span className="rgt-av">{p.name.charAt(0).toUpperCase()}</span>
              <span className="rgt-player-name">
                {p.name}
                {p.user_id === team.captain_id && <span className="rgt-tag">you</span>}
                {p.role === "substitute" && <span className="rgt-tag sub">sub</span>}
              </span>
              {regOpen && p.user_id !== team.captain_id && (
                <button className="rgt-x" onClick={() => onRemove(p)} aria-label={`Remove ${p.name}`}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {err && <div className="rgt-err">{err}</div>}
    </div>
  );
}

// ── Add-player modal (name + optional email/phone) ─────────────────
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
      setTimeout(() => setJustAdded(null), 2500);
    });
  }

  return (
    <div className="rgt-scrim" onClick={onClose}>
      <div className="rgt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rgt-modal-head">
          <h3>Add a player</h3>
          <button aria-label="Close" onClick={onClose} className="rgt-x lg"><X size={18} /></button>
        </div>
        <p className="rgt-hint" style={{ marginTop: 0 }}>
          Only a name is required. Add an email so this player can sign in later and see their own stats.
        </p>
        <input className="rgt-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Player's name" />
        <input className="rgt-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
        <input className="rgt-in" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
        <select className="rgt-in" value={role} onChange={(e) => setRole(e.target.value as "player" | "substitute")}>
          <option value="player">Player</option>
          <option value="substitute">Substitute</option>
        </select>
        {err && <div className="rgt-err">{err}</div>}
        {justAdded && <div className="rgt-ok"><Check size={14} /> Added {justAdded}.</div>}
        <div className="rgt-modal-actions">
          <button className="rgt-btn primary" onClick={add} disabled={pending}>{pending ? "Adding…" : "Add player"}</button>
          <button className="rgt-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const RGT_CSS = `
.rgt { font-family: 'Inter', system-ui, sans-serif; --g: #00875a; --gd: #006241; }
[data-theme="paper"] .rgt { --g: #006241; }

.rgt-hero {
  position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  padding: 20px; border-radius: 20px; margin-bottom: 16px; overflow: hidden;
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(0,135,90,0.22), transparent 60%),
    linear-gradient(135deg, rgba(20,23,30,0.9), rgba(20,23,30,0.6));
  border: 1px solid rgba(242,237,230,0.12);
}
[data-theme="paper"] .rgt-hero {
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(0,98,65,0.14), transparent 55%),
    linear-gradient(135deg, #ffffff, #f4f1ea);
  border-color: rgba(20,23,30,0.08); box-shadow: 0 1px 4px rgba(20,23,30,0.05);
}
.rgt-hero-badge {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  display: grid; place-items: center; color: #fff;
  background: linear-gradient(150deg, var(--gd), #1e3932);
}
.rgt-hero-main { flex: 1; min-width: 180px; }
.rgt-hero-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; opacity: .55; }
.rgt-hero-title { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: -0.4px; margin: 3px 0 0; }
.rgt-hero-facts { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.rgt-fact {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700;
  padding: 7px 11px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(242,237,230,0.1);
}
[data-theme="paper"] .rgt-fact { background: rgba(20,23,30,0.04); border-color: rgba(20,23,30,0.08); }
.rgt-fact svg { color: var(--g); }

.rgt-stepper { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.rgt-step { display: inline-flex; align-items: center; gap: 7px; opacity: .5; }
.rgt-step.on, .rgt-step.done { opacity: 1; }
.rgt-step-dot {
  width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center;
  font-size: 11px; font-weight: 800; border: 1.5px solid currentColor;
}
.rgt-step.on .rgt-step-dot { background: var(--g); border-color: var(--g); color: #fff; }
.rgt-step.done .rgt-step-dot { background: var(--g); border-color: var(--g); color: #fff; }
.rgt-step-lbl { font-size: 12px; font-weight: 700; }
.rgt-step + .rgt-step::before { content: ""; width: 16px; height: 1.5px; background: currentColor; opacity: .4; margin-right: 1px; }

.rgt-card {
  background: rgba(20,23,30,0.55); border: 1px solid rgba(242,237,230,0.1);
  border-radius: 18px; padding: 20px; margin-bottom: 14px;
}
[data-theme="paper"] .rgt-card { background: #fff; border-color: rgba(20,23,30,0.08); box-shadow: 0 1px 4px rgba(20,23,30,0.05); }
.rgt-center { text-align: center; }
.rgt-center h3 { font-family: 'Inter', sans-serif; font-size: 17px; font-weight: 800; margin: 12px 0 6px; }
.rgt-center p { font-size: 13.5px; opacity: .7; margin: 0 auto 16px; max-width: 340px; line-height: 1.55; }
.rgt-lock {
  width: 44px; height: 44px; border-radius: 14px; margin: 0 auto; display: grid; place-items: center;
  background: rgba(0,135,90,0.12); color: var(--g);
}

.rgt-step-t { font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 800; margin-bottom: 12px; }
.rgt-label { display: block; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; opacity: .55; margin: 12px 0 6px; }
.rgt-label:first-of-type { margin-top: 0; }
.rgt-opt { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .7; }
.rgt-in {
  width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 11px; font-size: 14px;
  background: rgba(0,0,0,0.16); border: 1px solid rgba(242,237,230,0.14); color: inherit; font-family: inherit;
}
[data-theme="paper"] .rgt-in { background: #fbfaf7; border-color: rgba(20,23,30,0.14); }
.rgt-in:focus { outline: none; border-color: var(--g); box-shadow: 0 0 0 3px rgba(0,135,90,0.14); }
select.rgt-in { margin-top: 8px; }
.rgt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 520px) { .rgt-row { grid-template-columns: 1fr; } }
.rgt-hint { font-size: 11.5px; opacity: .6; margin: 7px 0 0; line-height: 1.5; }

.rgt-check { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; opacity: .85; margin-top: 14px; cursor: pointer; line-height: 1.4; }
.rgt-check input { margin-top: 2px; accent-color: var(--g); width: 16px; height: 16px; flex-shrink: 0; }

.rgt-err { color: #ef4444; font-size: 12.5px; margin-top: 12px; }
.rgt-ok { display: flex; align-items: center; gap: 6px; color: var(--g); font-weight: 700; font-size: 12.5px; margin-top: 10px; }

.rgt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 18px; border-radius: 12px; font-family: inherit; font-size: 13.5px; font-weight: 700;
  border: 1px solid rgba(242,237,230,0.2); background: transparent; color: inherit; cursor: pointer; text-decoration: none;
}
[data-theme="paper"] .rgt-btn { border-color: rgba(20,23,30,0.16); }
.rgt-btn.primary { background: linear-gradient(150deg, var(--g), var(--gd)); border-color: transparent; color: #fff; }
.rgt-btn.primary:disabled { opacity: .55; cursor: not-allowed; }
.rgt-btn.sm { padding: 8px 12px; font-size: 12.5px; }
.rgt-btn-lg { width: 100%; margin-top: 16px; padding: 14px; font-size: 15px; }

.rgt-done .rgt-done-mark {
  width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 8px; display: grid; place-items: center;
  background: linear-gradient(150deg, var(--g), var(--gd)); color: #fff;
}
.rgt-done-rows { text-align: left; display: flex; flex-direction: column; gap: 2px; max-width: 320px; margin: 4px auto 0; }
.rgt-done-rows > div { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13.5px; border-top: 1px solid rgba(128,128,128,0.14); }
.rgt-done-rows > div:first-child { border-top: none; }
.rgt-done-rows span { opacity: .6; }

.rgt-note {
  display: flex; align-items: center; gap: 8px; font-size: 12.5px; line-height: 1.4;
  padding: 12px 14px; border-radius: 12px; margin-bottom: 14px;
  background: rgba(0,135,90,0.1); border: 1px solid rgba(0,135,90,0.25); color: var(--g);
}

.rgt-roster-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.rgt-mgr {
  display: flex; align-items: center; gap: 11px; padding: 11px 12px; border-radius: 12px; margin-bottom: 10px;
  background: rgba(0,135,90,0.08); border: 1px solid rgba(0,135,90,0.2);
}
.rgt-mgr-name { font-size: 13.5px; font-weight: 800; }
.rgt-mgr-sub { font-size: 11px; opacity: .6; margin-top: 1px; }
.rgt-mini-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; opacity: .8; cursor: pointer; white-space: nowrap; }
.rgt-mini-check input { accent-color: var(--g); }

.rgt-roster { display: flex; flex-direction: column; gap: 6px; }
.rgt-roster-empty { text-align: center; font-size: 12.5px; opacity: .55; padding: 18px 0; }
.rgt-player { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 11px; background: rgba(255,255,255,0.03); }
[data-theme="paper"] .rgt-player { background: rgba(20,23,30,0.03); }
.rgt-player-name { flex: 1; font-size: 13.5px; display: inline-flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.rgt-tag { font-size: 9.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 5px; background: rgba(0,135,90,0.16); color: var(--g); }
.rgt-tag.sub { background: rgba(128,128,128,0.18); color: inherit; opacity: .7; }
.rgt-av {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  font-size: 12px; font-weight: 800; color: #fff; background: linear-gradient(150deg, var(--gd), #1e3932);
}
.rgt-av.mgr { background: linear-gradient(150deg, var(--g), var(--gd)); }
.rgt-x { background: none; border: none; color: #ef4444; opacity: .7; cursor: pointer; padding: 4px; display: flex; }
.rgt-x:hover { opacity: 1; }
.rgt-x.lg { color: inherit; opacity: .6; width: 40px; height: 40px; align-items: center; justify-content: center; }

.rgt-scrim { position: fixed; inset: 0; background: rgba(6,7,10,0.72); backdrop-filter: blur(6px); z-index: 400; display: grid; place-items: center; padding: 20px; }
.rgt-modal { width: 100%; max-width: 420px; background: #14171E; color: #F2EDE6; border: 1px solid rgba(242,237,230,0.12); border-radius: 18px; padding: 22px; }
[data-theme="paper"] .rgt-modal { background: #fff; color: #14171E; border-color: rgba(20,23,30,0.1); }
.rgt-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.rgt-modal-head h3 { font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 800; margin: 0; }
.rgt-modal-actions { display: flex; gap: 8px; margin-top: 16px; }
.rgt-modal-actions .rgt-btn { flex: 1; }
`;
