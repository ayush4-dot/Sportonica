"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Trophy, Users, Plus, Trash2, Clock, LogIn, CalendarDays, Wallet, ShieldCheck,
  User, Phone, Mail, Hash, MapPin,
} from "lucide-react";
import {
  registerTeam, setManagerPlays, getTeamRoster, addTeamGuestPlayer, removeTeamGuestPlayer,
  updateTeamPlayerGuest, uploadTeamLogo,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";
import { type Tournament, type TournamentTeam } from "@/lib/tournaments/types";

type RosterPlayer = {
  id: string; user_id: string | null; role: string; name: string; username: string | null;
  avatar_url: string | null; jersey_number: number | null; position: string | null;
  guest_name: string | null; guest_phone: string | null; guest_email: string | null;
};

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
  const [coachName, setCoachName] = useState("");
  const [coachPhone, setCoachPhone] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubAddress, setClubAddress] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [iPlay, setIPlay] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);

  function submitLogo(file: File) {
    setLogoUploading(true);
    setErr(null);
    startTransition(async () => {
      const res = await uploadTeamLogo(file);
      setLogoUploading(false);
      if (isActionError(res)) { setErr(res.message); return; }
      setLogoUrl(res);
    });
  }

  const managerOnRoster = !!team && roster.some((p) => p.user_id === team.captain_id);
  const openSlots = tournament.max_teams == null ? null : Math.max(0, tournament.max_teams - confirmedCount);
  const regOpen = tournament.status === "registration_open";
  const paid = tournament.fee > 0;

  useEffect(() => {
    if (!team) return;
    getTeamRoster(team.id).then((r) => { if (!isActionError(r)) setRoster(r); });
  }, [team]);

  // "Register again" (after a rejection/withdrawal) shows the same form
  // pre-filled from what's on file — falls back to the existing team's
  // stored value wherever the field hasn't been touched this time,
  // same pattern the team-name input already uses (value={teamName ||
  // team.name}), so submitting doesn't silently blank out untouched
  // fields.
  function renderTeamDetailFields(existing: TournamentTeam | null) {
    return (
      <>
        <label className="rgt-label">Team logo <span className="rgt-opt">optional</span></label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(logoUrl || existing?.logo_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl || existing?.logo_url || ""} alt="Team logo" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
          )}
          <input
            className="rgt-in" type="file" accept="image/jpeg,image/png,image/webp"
            disabled={logoUploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) submitLogo(f); }}
          />
        </div>
        {logoUploading && <p className="rgt-hint">Uploading…</p>}

        <div className="rgt-row">
          <div>
            <label className="rgt-label">Club name</label>
            <input className="rgt-in" value={clubName || existing?.club_name || ""} onChange={(e) => setClubName(e.target.value)} placeholder="e.g. Everest Sports Club" />
          </div>
          <div>
            <label className="rgt-label">Club address</label>
            <input className="rgt-in" value={clubAddress || existing?.club_address || ""} onChange={(e) => setClubAddress(e.target.value)} placeholder="City / area" />
          </div>
        </div>

        <div className="rgt-row">
          <div>
            <label className="rgt-label">Contact person name</label>
            <input className="rgt-in" value={contactPersonName || existing?.contact_person_name || ""} onChange={(e) => setContactPersonName(e.target.value)} placeholder="Club's point of contact" />
          </div>
          <div>
            <label className="rgt-label">Contact phone</label>
            <input className="rgt-in" value={contactPhone || existing?.contact_phone || ""} onChange={(e) => setContactPhone(e.target.value)} placeholder="98XXXXXXXX" />
          </div>
        </div>
        <label className="rgt-label">Contact email</label>
        <input className="rgt-in" type="email" value={contactEmail || existing?.contact_email || ""} onChange={(e) => setContactEmail(e.target.value)} placeholder="club@example.com" />

        <div className="rgt-row">
          <div>
            <label className="rgt-label">Team manager name</label>
            <input className="rgt-in" value={managerName || existing?.manager_name || ""} onChange={(e) => setManagerName(e.target.value)} placeholder="Who's running the team" />
          </div>
          <div>
            <label className="rgt-label">Team manager phone</label>
            <input className="rgt-in" value={managerPhone || existing?.manager_phone || ""} onChange={(e) => setManagerPhone(e.target.value)} placeholder="98XXXXXXXX" />
          </div>
        </div>

        <div className="rgt-row">
          <div>
            <label className="rgt-label">Coach name <span className="rgt-opt">optional</span></label>
            <input className="rgt-in" value={coachName || existing?.coach_name || ""} onChange={(e) => setCoachName(e.target.value)} placeholder="Head coach, if any" />
          </div>
          <div>
            <label className="rgt-label">Coach phone <span className="rgt-opt">optional</span></label>
            <input className="rgt-in" value={coachPhone || existing?.coach_phone || ""} onChange={(e) => setCoachPhone(e.target.value)} placeholder="98XXXXXXXX" />
          </div>
        </div>
        <p className="rgt-hint">Shown on the Teams tab so opponents and organisers can reach you.</p>
      </>
    );
  }

  function submitRegister() {
    // Fall back to the existing team's stored value for any field left
    // untouched on a "register again" pass.
    const effName = teamName.trim() || team?.name || "";
    const effManagerName = managerName.trim() || team?.manager_name || "";
    const effManagerPhone = managerPhone.trim() || team?.manager_phone || "";
    const effClubName = clubName.trim() || team?.club_name || "";
    const effClubAddress = clubAddress.trim() || team?.club_address || "";
    const effContactPersonName = contactPersonName.trim() || team?.contact_person_name || "";
    const effContactPhone = contactPhone.trim() || team?.contact_phone || "";
    const effContactEmail = contactEmail.trim() || team?.contact_email || "";
    const effLogoUrl = logoUrl || team?.logo_url || undefined;
    const effCoachName = coachName.trim() || team?.coach_name || "";
    const effCoachPhone = coachPhone.trim() || team?.coach_phone || "";

    if (!effName) { setErr("Give your team a name."); return; }
    if (!effManagerName || !effManagerPhone) { setErr("Enter the team manager's name and phone number."); return; }
    if (!effClubName || !effClubAddress) { setErr("Enter the club's name and address."); return; }
    if (!effContactPersonName || !effContactPhone || !effContactEmail) {
      setErr("Enter a contact person's name, phone and email.");
      return;
    }
    if (!ackTerms) { setErr("Please agree to the tournament rules to register."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await registerTeam(
        tournament.id, effName, ackTerms,
        effManagerName, effManagerPhone, iPlay,
        {
          clubName: effClubName, clubAddress: effClubAddress,
          contactPersonName: effContactPersonName, contactPhone: effContactPhone,
          contactEmail: effContactEmail, logoUrl: effLogoUrl,
          coachName: effCoachName || undefined, coachPhone: effCoachPhone || undefined,
        },
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

  async function refetchRoster() {
    if (!team) return;
    const r = await getTeamRoster(team.id);
    if (!isActionError(r)) setRoster(r);
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
          <span>{paid ? rs(tournament.fee) : "Free"}</span>
        </div>
        <div className="rgt-fact">
          <CalendarDays size={13} />
          <span>Closes {dateLabel(tournament.registration_closes_at)}</span>
        </div>
        <div className="rgt-fact">
          <Users size={13} />
          <span>{openSlots === null ? "Unlimited teams" : openSlots > 0 ? `${openSlots} of ${tournament.max_teams} slots open` : "Full"}</span>
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

            {renderTeamDetailFields(null)}

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
              {paid && <div><span>Registration fee</span><b>{rs(tournament.fee)} · paid</b></div>}
            </div>
          </div>
          <RosterCard
            team={team} roster={roster} tournament={tournament} managerOnRoster={managerOnRoster}
            regOpen={regOpen} onRemove={removePlayer} onRosterChanged={refetchRoster}
            onToggleIPlay={toggleIPlay} pending={pending} err={err}
          />
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

            {renderTeamDetailFields(team)}

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
            regOpen={regOpen} onRemove={removePlayer} onRosterChanged={refetchRoster}
            onToggleIPlay={toggleIPlay} pending={pending} err={err}
          />

          {team.status === "payment_pending" && paid && (
            <div className="rgt-card">
              <div className="rgt-step-t">Pay the registration fee</div>

              <div className="rgt-paysum">
                <div className="rgt-paysum-row"><span>Team</span><b>{team.name}</b></div>
                <div className="rgt-paysum-row"><span>Tournament</span><b>{tournament.name}</b></div>
                <div className="rgt-paysum-row tot"><span>Registration fee</span><b>{rs(tournament.fee)}</b></div>
              </div>

              <PaymentStep
                bookingType="tournament_registration"
                bookingId={team.id}
                amount={tournament.fee}
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

// ── Roster: one editable card per player ───────────────────────────
type PlayerDraft = {
  key: string;
  id: string | null;          // roster row id once saved
  role: "player" | "substitute";
  name: string;
  phone: string;
  email: string;
  jersey: string;
  position: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  dirty: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const draftKey = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `d${Math.random().toString(36).slice(2)}`;

function blankDraft(): PlayerDraft {
  return {
    key: draftKey(), id: null, role: "player",
    name: "", phone: "", email: "", jersey: "", position: "",
    saving: false, saved: false, error: null, dirty: false,
  };
}

function draftFromPlayer(p: RosterPlayer, prev?: PlayerDraft): PlayerDraft {
  return {
    key: prev?.key ?? p.id,
    id: p.id,
    role: p.role === "substitute" ? "substitute" : "player",
    name: p.guest_name ?? (p.name === "Player" ? "" : p.name),
    phone: p.guest_phone ?? "",
    email: p.guest_email ?? "",
    jersey: p.jersey_number != null ? String(p.jersey_number) : "",
    position: p.position ?? "",
    saving: false, saved: false, error: null, dirty: false,
  };
}

// How many blank player cards to show before the captain has added anyone.
const SEED_BLANK_CARDS = 2;

function seedDrafts(guests: RosterPlayer[], maxCards: number, prev?: PlayerDraft[]): PlayerDraft[] {
  const prevById = new Map((prev ?? []).filter((d) => d.id).map((d) => [d.id as string, d]));
  const server = guests.map((p) => {
    const ex = prevById.get(p.id);
    if (ex && (ex.dirty || ex.saving)) return ex;
    const fresh = draftFromPlayer(p, ex);
    return ex ? { ...fresh, saved: ex.saved } : fresh;
  });
  const unsaved = (prev ?? []).filter((d) => !d.id && (d.dirty || d.name.trim() || d.phone.trim()));
  const combined = [...server, ...unsaved];
  // Start with a couple of blank cards as a sample, then always keep one
  // spare blank while there's room for more.
  const target = Math.min(maxCards, Math.max(SEED_BLANK_CARDS, server.length + 1));
  while (combined.length < target) combined.push(blankDraft());
  return combined.slice(0, Math.max(maxCards, server.length + unsaved.length));
}

function RosterCard({
  team, roster, tournament, managerOnRoster, regOpen, onRemove, onRosterChanged, onToggleIPlay, pending, err,
}: {
  team: TournamentTeam;
  roster: RosterPlayer[];
  tournament: Tournament;
  managerOnRoster: boolean;
  regOpen: boolean;
  onRemove: (p: RosterPlayer) => void;
  onRosterChanged: () => Promise<void> | void;
  onToggleIPlay: (next: boolean) => void;
  pending: boolean;
  err: string | null;
}) {
  const guestPlayers = roster.filter((p) => p.user_id === null);
  const linkedPlayers = roster.filter((p) => p.user_id !== null && p.user_id !== team.captain_id);
  const nonGuestCount = roster.length - guestPlayers.length;
  const maxCards = Math.max(0, tournament.max_players_per_team - nonGuestCount);

  const [drafts, setDrafts] = useState<PlayerDraft[]>(() => seedDrafts(guestPlayers, maxCards));

  // Re-sync while rendering whenever the saved roster changes (add / remove /
  // link), keeping any card the user is still typing into. This is React's
  // "adjust state when a prop changes" pattern, not an effect.
  const rosterSig = `${guestPlayers.map((p) => `${p.id}:${p.jersey_number}:${p.position ?? ""}`).join("|")}#${maxCards}`;
  const [prevSig, setPrevSig] = useState(rosterSig);
  if (prevSig !== rosterSig) {
    setPrevSig(rosterSig);
    setDrafts((prev) => seedDrafts(guestPlayers, maxCards, prev));
  }

  const patch = (key: string, p: Partial<PlayerDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const edit = (key: string, field: keyof PlayerDraft, value: string) =>
    patch(key, { [field]: value, dirty: true, saved: false, error: null });

  async function saveDraft(key: string) {
    const d = drafts.find((x) => x.key === key);
    if (!d || d.saving || !d.dirty) return;
    const name = d.name.trim();
    if (!name) return; // nothing to save until it's named
    patch(key, { saving: true, error: null });
    const jersey = d.jersey.trim() ? Number(d.jersey.trim()) : undefined;
    const res = d.id
      ? await updateTeamPlayerGuest(d.id, name, d.phone.trim(), d.email.trim() || undefined, jersey, d.position.trim() || undefined)
      : await addTeamGuestPlayer(team.id, name, d.phone.trim() || undefined, d.email.trim() || undefined, d.role, jersey, d.position.trim() || undefined);
    if (isActionError(res)) { patch(key, { saving: false, error: res.message }); return; }
    patch(key, { saving: false, dirty: false, saved: true, id: res.id });
    await onRosterChanged();
  }

  function addCard() {
    setDrafts((prev) => (prev.length >= maxCards ? prev : [...prev, blankDraft()]));
  }

  function removeCard(d: PlayerDraft) {
    if (!d.id) { setDrafts((prev) => prev.filter((x) => x.key !== d.key)); return; }
    const rp = roster.find((x) => x.id === d.id);
    if (rp) onRemove(rp);
  }

  const filled = roster.length;
  const need = tournament.min_players_per_team;
  const belowMin = filled < need;

  return (
    <div className="rgt-card">
      <div className="rgt-roster-head">
        <div>
          <div className="rgt-step-t" style={{ marginBottom: 2 }}>Players</div>
          <div className="rgt-hint" style={{ margin: 0 }}>
            {filled} of {need} slots filled{belowMin
              ? ` — at least ${need} players with name and phone are required.`
              : " — minimum reached."}
          </div>
        </div>
        {regOpen && drafts.length < maxCards && (
          <button className="rgt-btn primary sm" onClick={addCard}><Plus size={14} /> Add</button>
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

      {/* Players who already have an account — shown read-only here */}
      {linkedPlayers.map((p, i) => (
        <div key={p.id} className="rgt-pcard readonly">
          <div className="rgt-pcard-head">
            <span className="rgt-pnum">{pad2(i + 1)}</span>
            <span className="rgt-pav">{p.name.charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1 }}>
              <div className="rgt-ptitle">{p.name}</div>
              <div className="rgt-pcard-sub">
                Linked account
                {p.jersey_number != null ? ` · #${p.jersey_number}` : ""}
                {p.position ? ` · ${p.position}` : ""}
                {p.role === "substitute" ? " · sub" : ""}
              </div>
            </div>
            {regOpen && (
              <button className="rgt-pdel" onClick={() => onRemove(p)} aria-label={`Remove ${p.name}`}><Trash2 size={15} /></button>
            )}
          </div>
        </div>
      ))}

      {/* One editable card per player */}
      {drafts.map((d, i) => {
        const num = linkedPlayers.length + i + 1;
        const status = d.saving
          ? "Saving…"
          : d.error
            ? d.error
            : d.saved && !d.dirty
              ? "Saved"
              : d.id
                ? "On the roster"
                : "Not saved yet";
        return (
          <div
            key={d.key}
            className="rgt-pcard"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) saveDraft(d.key); }}
          >
            <div className="rgt-pcard-head">
              <span className="rgt-pnum">{pad2(num)}</span>
              <span className="rgt-pav">{d.name.trim() ? d.name.trim().charAt(0).toUpperCase() : <User size={15} />}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rgt-ptitle">{d.name.trim() || `Player ${num}`}</div>
                <div className="rgt-pcard-sub" style={d.error ? { color: "#ef4444" } : d.saved && !d.dirty ? { color: "var(--g)" } : undefined}>
                  {status}
                </div>
              </div>
              {regOpen && (
                <button className="rgt-pdel" onClick={() => removeCard(d)} aria-label={`Remove player ${num}`} disabled={d.saving}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Player name<span className="rgt-req">*</span></label>
              <div className="rgt-ig">
                <User size={16} />
                <input className="rgt-in" value={d.name} disabled={!regOpen}
                  onChange={(e) => edit(d.key, "name", e.target.value)} placeholder="Full name" />
              </div>
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Phone number<span className="rgt-req">*</span></label>
              <div className="rgt-ig">
                <Phone size={16} />
                <input className="rgt-in" inputMode="tel" value={d.phone} disabled={!regOpen}
                  onChange={(e) => edit(d.key, "phone", e.target.value)} placeholder="98XXXXXXXX" />
              </div>
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Email</label>
              <div className="rgt-ig">
                <Mail size={16} />
                <input className="rgt-in" type="email" value={d.email} disabled={!regOpen}
                  onChange={(e) => edit(d.key, "email", e.target.value)} placeholder="player@example.com" />
              </div>
              <p className="rgt-fhint">Lets this player sign in later and see their own stats.</p>
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Jersey no.</label>
              <div className="rgt-ig">
                <Hash size={16} />
                <input className="rgt-in" type="number" min={1} max={99} value={d.jersey} disabled={!regOpen}
                  onChange={(e) => edit(d.key, "jersey", e.target.value)} placeholder="e.g. 10" />
              </div>
              <p className="rgt-fhint">1–99, must be unique in the squad.</p>
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Position</label>
              <div className="rgt-ig">
                <MapPin size={16} />
                <input className="rgt-in" value={d.position} disabled={!regOpen}
                  onChange={(e) => edit(d.key, "position", e.target.value)} placeholder="e.g. Goalkeeper" />
              </div>
            </div>

            <div className="rgt-field">
              <label className="rgt-flabel">Squad role</label>
              <select className="rgt-in" value={d.role} disabled={!regOpen}
                onChange={(e) => edit(d.key, "role", e.target.value)}>
                <option value="player">Player</option>
                <option value="substitute">Substitute</option>
              </select>
            </div>
          </div>
        );
      })}

      {regOpen && drafts.length < maxCards && (
        <button className="rgt-btn rgt-addplayer" onClick={addCard}><Plus size={15} /> Add another player</button>
      )}

      {err && <div className="rgt-err">{err}</div>}
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

.rgt-paysum {
  border: 1px solid rgba(242,237,230,0.12); border-radius: 14px; overflow: hidden; margin-bottom: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
}
[data-theme="paper"] .rgt-paysum { border-color: rgba(20,23,30,0.1); background: linear-gradient(180deg, rgba(20,23,30,0.02), #fff); }
.rgt-paysum-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  padding: 11px 15px; font-size: 13.5px;
}
.rgt-paysum-row + .rgt-paysum-row { border-top: 1px solid rgba(242,237,230,0.06); }
[data-theme="paper"] .rgt-paysum-row + .rgt-paysum-row { border-top-color: rgba(20,23,30,0.055); }
.rgt-paysum-row span { opacity: .6; flex-shrink: 0; }
.rgt-paysum-row b { font-family: 'Inter', sans-serif; font-weight: 700; text-align: right; }
.rgt-paysum-row.tot {
  background: linear-gradient(135deg, rgba(0,135,90,0.16), rgba(0,135,90,0.04));
  border-top: 1px solid rgba(0,135,90,0.25);
}
.rgt-paysum-row.tot span { opacity: .7; font-weight: 700; text-transform: uppercase; font-size: 10.5px; letter-spacing: .08em; }
.rgt-paysum-row.tot b { font-size: 18px; color: var(--g); letter-spacing: -0.3px; }

.rgt-label { display: block; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; opacity: .55; margin: 12px 0 6px; }
.rgt-label:first-of-type { margin-top: 0; }
.rgt-opt { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .7; }
.rgt-in {
  width: 100%; box-sizing: border-box; padding: 12px 13px; border-radius: 11px; font-size: 14px;
  background: rgba(0,0,0,0.16); border: 1px solid rgba(242,237,230,0.14); color: inherit; font-family: inherit;
}
[data-theme="paper"] .rgt-in { background: #fbfaf7; border-color: rgba(20,23,30,0.14); }
.rgt-in:focus { outline: none; border-color: var(--g); box-shadow: 0 0 0 3px rgba(0,135,90,0.14); }
.rgt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 520px) { .rgt-row { grid-template-columns: 1fr; } }
.rgt-hint { font-size: 11.5px; opacity: .6; margin: 7px 0 0; line-height: 1.5; }

/* Labelled field group (icon + uppercase label + helper text) */
.rgt-field { margin-top: 15px; }
.rgt-pcard .rgt-field:first-of-type { margin-top: 0; }
.rgt-flabel {
  display: block; font-size: 11px; font-weight: 800; letter-spacing: .06em;
  text-transform: uppercase; opacity: .58; margin-bottom: 7px;
}
.rgt-req { color: #ef4444; margin-left: 3px; }
.rgt-ig { position: relative; display: flex; align-items: center; }
.rgt-ig > svg {
  position: absolute; left: 13px; color: var(--g); opacity: .85; pointer-events: none;
}
.rgt-ig .rgt-in { padding-left: 40px; }
.rgt-field select.rgt-in { margin-top: 0; }
.rgt-fhint { font-size: 11px; opacity: .55; margin: 6px 0 0; line-height: 1.45; }

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

.rgt-av {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  font-size: 12px; font-weight: 800; color: #fff; background: linear-gradient(150deg, var(--gd), #1e3932);
}
.rgt-av.mgr { background: linear-gradient(150deg, var(--g), var(--gd)); }

/* One card per player */
.rgt-pcard {
  border: 1px solid rgba(242,237,230,0.1); border-radius: 15px; padding: 15px; margin-bottom: 10px;
  background: rgba(255,255,255,0.02);
}
[data-theme="paper"] .rgt-pcard { border-color: rgba(20,23,30,0.09); background: rgba(20,23,30,0.015); }
.rgt-pcard.readonly { opacity: .92; }
.rgt-pcard-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.rgt-pnum {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center;
  font-size: 11px; font-weight: 800; color: #0a1f16;
  background: linear-gradient(150deg, #7bd88f, var(--g));
}
.rgt-pav {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  font-size: 12px; font-weight: 800; color: #fff; background: linear-gradient(150deg, var(--gd), #1e3932);
}
.rgt-ptitle { font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rgt-pcard-sub { font-size: 10.5px; opacity: .6; margin-top: 1px; }
.rgt-pdel {
  flex-shrink: 0; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #ef4444;
  width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; cursor: pointer;
}
.rgt-pdel:disabled { opacity: .4; cursor: not-allowed; }
.rgt-addplayer { width: 100%; margin-top: 2px; border-style: dashed; }
`;
