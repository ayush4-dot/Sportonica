"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X, Users, UserPlus, Pencil } from "lucide-react";
import {
  openTournamentRegistration, closeTournamentRegistration, cancelTournament, approveTournament, completeTournament,
  startSingleEvent, createWalkinTeam, markWalkinTeamPaid,
  getTeamRoster, searchPlayersForTeam, addTeamPlayer, removeTeamPlayerAdmin,
  addWalkinTeamPlayer, updateTeamPlayerGuest,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import {
  STATUS_LABELS, TEAM_STATUS_LABELS, FORMAT_LABELS,
  type Tournament, type TournamentTeam, type TournamentMatch, type TournamentAnnouncement, type WalkinMember,
  type TournamentManager, type TournamentTeamPlayer,
} from "@/lib/tournaments/types";
import type { Payment } from "@/lib/payments/types";
import TournamentForm from "./TournamentForm";
import FixturesTab from "./FixturesTab";
import BracketView from "./BracketView";
import StandingsTab from "./StandingsTab";
import AnnouncementsTab from "./AnnouncementsTab";
import TournamentAccessTab from "./TournamentAccessTab";
import ReviewPaymentModal from "@/app/platform/payments/ReviewPaymentModal";
import "./tournament-console.css";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
});

type TeamRow = TournamentTeam & { roster_count: number };
type PaymentRow = { team_id: string; team_name: string; status: string; payment_method: string | null; expected_amount: number; submitted_at: string | null };
type ReviewPaymentRow = Payment & { customer_name: string; booking_label: string };

const TABS = ["Overview", "Registrations", "Payments", "Settings", "Fixtures", "Bracket", "Standings", "Announcements", "Access"] as const;
// A single_event tournament is captain-only, no bracket — those three tabs
// don't apply and are dropped rather than shown locked.
const NOT_FOR_SINGLE_EVENT = new Set<(typeof TABS)[number]>(["Fixtures", "Bracket", "Standings"]);
export default function TournamentControlCenter({
  tournament, venueName, teams, payments, matches, announcements, viewer, backHref, reviewPayments, teamFines, managers,
}: {
  tournament: Tournament;
  venueName: string;
  teams: TeamRow[];
  payments: PaymentRow[];
  matches: TournamentMatch[];
  announcements: TournamentAnnouncement[];
  viewer: "vendor" | "organizer" | "super_admin";
  backHref: string;
  // Only fetched (and only usable) for viewer === "super_admin" — approving
  // a tournament payment is the same Sportonica-only action as any other
  // booking type, just reachable from here too instead of only
  // /platform/payments.
  reviewPayments?: ReviewPaymentRow[];
  teamFines?: { team_id: string; total_fine: number }[];
  // Same story — granting per-tournament access is a super-admin-only
  // action, so this is only fetched/passed for viewer === "super_admin".
  managers?: TournamentManager[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [err, setErr] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ReviewPaymentRow | null>(null);
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [managingRoster, setManagingRoster] = useState<TeamRow | null>(null);

  const confirmedTeams = teams.filter((t) => t.status === "confirmed").length;
  const finesByTeam = new Map((teamFines ?? []).map((f) => [f.team_id, f.total_fine]));
  const trackingFines = tournament.yellow_card_fine > 0 || tournament.red_card_fine > 0;
  const visibleTabs = (tournament.format === "single_event" ? TABS.filter((t) => !NOT_FOR_SINGLE_EVENT.has(t)) : TABS)
    .filter((t) => t !== "Access" || viewer === "super_admin");

  // Every state-changing button passes its own confirmation text, in the
  // same verb as the button — "Open registration" confirms "Registration
  // is open.", not a generic "Done."
  function run(action: () => Promise<unknown>, successMsg?: string) {
    setErr(null);
    setConfirmMsg(null);
    startTransition(async () => {
      const res = await action();
      if (isActionError(res)) { setErr(res.message); return; }
      if (successMsg) { setConfirmMsg(successMsg); setTimeout(() => setConfirmMsg(null), 4000); }
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href={backHref} className="tc-dim" style={{ fontSize: 12.5, textDecoration: "none" }}>← All tournaments</Link>
          <h1 style={{ fontFamily: "'Inter',sans-serif", fontSize: 24, fontWeight: 800, margin: "4px 0 2px" }}>{tournament.name}</h1>
          <div className="tc-dim" style={{ fontSize: 13 }}>
            {tournament.sport} · {venueName} · {FORMAT_LABELS[tournament.format]}
          </div>
        </div>
        <span className={`tc-badge ${badgeClass(tournament.status)}`}>{STATUS_LABELS[tournament.status]}</span>
      </div>

      <div className="tc-stats">
        <div className="tc-stat"><div className="tc-stat-l">Teams registered</div><div className="tc-stat-v">{teams.length}<small> / {tournament.max_teams}</small></div></div>
        <div className="tc-stat"><div className="tc-stat-l">Confirmed</div><div className="tc-stat-v">{confirmedTeams}</div></div>
        <div className="tc-stat"><div className="tc-stat-l">Entry fee</div><div className="tc-stat-v">{tournament.fee > 0 ? money(tournament.fee) : "Free"}</div></div>
        <div className="tc-stat"><div className="tc-stat-l">Starts</div><div className="tc-stat-v" style={{ fontSize: 15 }}>{when(tournament.starts_at)}</div></div>
      </div>

      <div className="tc-chips">
        {visibleTabs.map((t) => (
          <button key={t} className={`tc-chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {err && <div className="tc-err" role="alert">{err}</div>}
      {confirmMsg && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 6, color: "#006241", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>
          <Check size={14} /> {confirmMsg}
        </div>
      )}

      {tab === "Overview" && (
        <div className="tc-card">
          <div className="tc-card-t">Lifecycle</div>
          <div className="tc-card-sub">Registration window: {when(tournament.registration_opens_at)} → {when(tournament.registration_closes_at)}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            {tournament.status === "pending_approval" && viewer === "super_admin" && (
              <>
                <button className="tc-btn primary" disabled={pending} onClick={() => run(() => approveTournament(tournament.id, true), "Published — this tournament is now public.")}>Approve & publish</button>
                <button
                  className="tc-btn danger" disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Send "${tournament.name}" back to draft? Its organizer will need to fix it and resubmit.`)) return;
                    run(() => approveTournament(tournament.id, false, "Needs changes"), "Sent back to draft.");
                  }}
                >
                  Send back to draft
                </button>
              </>
            )}
            {tournament.status === "pending_approval" && viewer !== "super_admin" && (
              <div className="tc-dim" style={{ fontSize: 13 }}>Waiting for Sportonica to review and publish this tournament.</div>
            )}
            {tournament.status === "published" && (
              <button className="tc-btn primary" disabled={pending} onClick={() => run(() => openTournamentRegistration(tournament.id), "Registration is open.")}>Open registration</button>
            )}
            {tournament.status === "registration_open" && (
              <button className="tc-btn" disabled={pending} onClick={() => run(() => closeTournamentRegistration(tournament.id), "Registration is closed.")}>Close registration</button>
            )}
            {tournament.format === "single_event" && tournament.status === "registration_closed" && (
              <button className="tc-btn primary" disabled={pending} onClick={() => run(() => startSingleEvent(tournament.id), "The event has started.")}>Start event</button>
            )}
            {tournament.status === "live" && (
              <button
                className="tc-btn primary" disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Complete "${tournament.name}"? This locks in the final results — you won't be able to record any more scores.`)) return;
                  run(() => completeTournament(tournament.id), "Tournament completed.");
                }}
              >
                Complete tournament
              </button>
            )}
            {!["completed", "cancelled"].includes(tournament.status) && (
              <button
                className="tc-btn danger" disabled={pending}
                onClick={() => {
                  const consequence = confirmedTeams > 0
                    ? `${confirmedTeams} confirmed team${confirmedTeams === 1 ? "" : "s"} will be notified and any payments already made will need refunding separately.`
                    : "This can't be undone.";
                  if (!window.confirm(`Cancel "${tournament.name}"? ${consequence}`)) return;
                  run(
                    () => cancelTournament(tournament.id, viewer === "super_admin" ? "Cancelled by Sportonica" : "Cancelled by organizer"),
                    "Tournament cancelled."
                  );
                }}
              >
                Cancel tournament
              </button>
            )}
          </div>
          {tournament.description && <p style={{ fontSize: 13.5, opacity: 0.75, marginTop: 18, maxWidth: 560 }}>{tournament.description}</p>}
        </div>
      )}

      {tab === "Registrations" && (
        <div className="tc-card">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="tc-card-t">Registered teams</div>
              <div className="tc-card-sub">Payment approval happens in Payments — Payouts &amp; Verification, same as every other booking.</div>
            </div>
            {tournament.status === "registration_open" && (
              <button className="tc-btn" style={{ padding: "8px 12px", whiteSpace: "nowrap" }} onClick={() => setShowWalkinModal(true)}>
                <Plus size={14} /> Add walk-in team
              </button>
            )}
          </div>
          {teams.length === 0 ? (
            <div className="tc-empty">No teams have registered yet.</div>
          ) : (
            <table className="tc-table">
              <thead><tr><th>Team</th><th>Roster</th><th>Status</th>{trackingFines && <th>Fines</th>}<th></th></tr></thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>
                      {t.name}
                      {t.is_walkin && <span className="tc-badge" style={{ marginLeft: 8, background: "rgba(128,128,128,.14)", color: "inherit" }}>Walk-in</span>}
                    </td>
                    <td className="tc-num">{t.roster_count}</td>
                    <td><span className={`tc-badge ${teamBadgeClass(t.status)}`}>{TEAM_STATUS_LABELS[t.status]}</span></td>
                    {trackingFines && (
                      <td className="tc-num">{(finesByTeam.get(t.id) ?? 0) > 0 ? money(finesByTeam.get(t.id) ?? 0) : "—"}</td>
                    )}
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.is_walkin && t.status === "payment_pending" && (
                        <button
                          className="tc-btn" style={{ padding: "6px 10px" }} disabled={pending}
                          onClick={() => run(() => markWalkinTeamPaid(t.id, tournament.id), `${t.name} marked as paid.`)}
                        >
                          Mark paid
                        </button>
                      )}
                      {t.status !== "rejected" && t.status !== "withdrawn" && (
                        <button className="tc-btn" style={{ padding: "6px 10px" }} onClick={() => setManagingRoster(t)}>
                          <Users size={13} /> Roster
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {showWalkinModal && (
            <WalkinTeamModal
              tournamentId={tournament.id}
              maxMembers={tournament.max_players_per_team + tournament.substitute_limit}
              onClose={() => setShowWalkinModal(false)}
              onCreated={(msg) => {
                setShowWalkinModal(false);
                setConfirmMsg(msg);
                setTimeout(() => setConfirmMsg(null), 4000);
                router.refresh();
              }}
            />
          )}
          {managingRoster && (
            <TeamRosterModal
              team={managingRoster}
              onClose={() => setManagingRoster(null)}
              onChanged={() => router.refresh()}
            />
          )}
        </div>
      )}

      {tab === "Payments" && viewer === "super_admin" && (
        <div className="tc-card">
          <div className="tc-card-t">Payments</div>
          <div className="tc-card-sub">Approve or reject right here — same review as /platform/payments, scoped to this tournament.</div>
          {(reviewPayments ?? []).length === 0 ? (
            <div className="tc-empty">No payments submitted yet.</div>
          ) : (
            <table className="tc-table">
              <thead><tr><th>Team</th><th>Method</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(reviewPayments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.booking_label}</td>
                    <td className="tc-dim" style={{ textTransform: "capitalize" }}>{p.payment_method ?? "—"}</td>
                    <td className="tc-num">{money(p.expected_amount)}</td>
                    <td><span className={`tc-badge ${paymentBadgeClass(p.status)}`}>{p.status.replace("_", " ").toLowerCase()}</span></td>
                    <td>
                      {p.status === "PENDING_VERIFICATION" && (
                        <button className="tc-btn" style={{ padding: "6px 10px" }} onClick={() => setReviewing(p)}>Review</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {reviewing && (
            <ReviewPaymentModal
              payment={reviewing}
              onClose={() => setReviewing(null)}
              onReviewed={() => { setReviewing(null); setConfirmMsg("Payment reviewed."); setTimeout(() => setConfirmMsg(null), 4000); router.refresh(); }}
            />
          )}
        </div>
      )}

      {tab === "Payments" && viewer !== "super_admin" && (
        <div className="tc-card">
          <div className="tc-card-t">Payments</div>
          <div className="tc-card-sub">View-only here — approve or reject from Sportonica&apos;s payment console.</div>
          {payments.length === 0 ? (
            <div className="tc-empty">No payments submitted yet.</div>
          ) : (
            <table className="tc-table">
              <thead><tr><th>Team</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.team_id}>
                    <td style={{ fontWeight: 600 }}>{p.team_name}</td>
                    <td className="tc-dim" style={{ textTransform: "capitalize" }}>{p.payment_method ?? "—"}</td>
                    <td className="tc-num">{money(p.expected_amount)}</td>
                    <td><span className={`tc-badge ${paymentBadgeClass(p.status)}`}>{p.status.replace("_", " ").toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Settings" && (
        editingDetails ? (
          <TournamentForm
            existing={tournament}
            venues={[]}
            mode={viewer === "super_admin" ? "platform" : viewer === "organizer" ? "organizer" : "venue"}
            onSaved={() => { setEditingDetails(false); router.refresh(); }}
          />
        ) : (
          <div className="tc-card">
            <div className="tc-card-t">Settings</div>
            {tournament.status === "draft" ? (
              <p style={{ fontSize: 13.5, opacity: 0.7 }}>This tournament is still a draft — edit it from the tournaments list.</p>
            ) : (
              <>
                <p style={{ fontSize: 13.5, opacity: 0.7, marginBottom: 14 }}>
                  Name, dates, fees, rules, and everything else except the venue can be edited any time — it just won&apos;t retroactively change anything already locked in (existing team payments, results, etc).
                </p>
                <button className="tc-btn primary" onClick={() => setEditingDetails(true)}>Edit details</button>
              </>
            )}
          </div>
        )
      )}

      {tab === "Fixtures" && (
        <FixturesTab
          tournament={tournament}
          teams={teams.filter((t) => t.status === "confirmed")}
          matches={matches}
        />
      )}

      {tab === "Bracket" && (
        <div className="tc-card">
          <div className="tc-card-t">Bracket</div>
          <BracketView matches={matches} teamName={(id) => teams.find((t) => t.id === id)?.name ?? "Unknown"} />
        </div>
      )}

      {tab === "Standings" && (
        <StandingsTab tournament={tournament} teams={teams} />
      )}

      {tab === "Announcements" && (
        <AnnouncementsTab tournamentId={tournament.id} announcements={announcements} />
      )}

      {tab === "Access" && viewer === "super_admin" && (
        <TournamentAccessTab tournamentId={tournament.id} managers={managers ?? []} />
      )}
    </div>
  );
}

function badgeClass(status: Tournament["status"]) {
  if (status === "cancelled") return "danger";
  if (status === "pending_approval" || status === "registration_closed") return "warn";
  if (status === "draft") return "neutral";
  return "ok";
}
function teamBadgeClass(status: TournamentTeam["status"]) {
  if (status === "rejected" || status === "withdrawn") return "danger";
  if (status === "confirmed") return "ok";
  return "warn";
}
function paymentBadgeClass(status: string) {
  if (status === "APPROVED") return "ok";
  if (status === "REJECTED") return "danger";
  return "warn";
}

function WalkinTeamModal({
  tournamentId, maxMembers, onClose, onCreated,
}: {
  tournamentId: string;
  maxMembers: number;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<WalkinMember[]>([{ name: "", phone: "", email: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateMember(i: number, field: keyof WalkinMember, value: string) {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }
  function addMember() {
    if (members.length >= maxMembers) return;
    setMembers((prev) => [...prev, { name: "", phone: "", email: "" }]);
  }
  function removeMember(i: number) {
    setMembers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (!teamName.trim()) { setErr("Enter a team name."); return; }
    if (members.some((m) => !m.name.trim() || !m.phone.trim())) {
      setErr("Enter a name and phone number for every team member.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await createWalkinTeam(tournamentId, teamName.trim(), members);
      if (isActionError(res)) { setErr(res.message); return; }
      onCreated(`${res.name} added as a walk-in team.`);
    });
  }

  return (
    <div className="tc-scrim" onClick={onClose}>
      <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800 }}>Add walk-in team</h3>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>

        <div className="tc-member-row" style={{ gridTemplateColumns: "1fr" }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".04em", margin: "16px 0 8px" }}>
          Members ({members.length}/{maxMembers})
        </div>
        {members.map((m, i) => (
          <div className="tc-member-row" key={i}>
            <input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" />
            <input value={m.phone} onChange={(e) => updateMember(i, "phone", e.target.value)} placeholder="Phone" />
            <input value={m.email ?? ""} onChange={(e) => updateMember(i, "email", e.target.value)} placeholder="Email (optional)" />
            <button onClick={() => removeMember(i)} disabled={members.length <= 1} aria-label={`Remove member ${i + 1}`} style={{ opacity: members.length <= 1 ? 0.3 : 0.7 }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {members.length < maxMembers && (
          <button className="tc-btn" style={{ padding: "8px 12px", marginTop: 4 }} onClick={addMember}>
            <Plus size={13} /> Add member
          </button>
        )}

        {err && <div className="tc-err" style={{ marginTop: 14 }}>{err}</div>}
        <button className="tc-btn primary" style={{ marginTop: 18, width: "100%", justifyContent: "center" }} disabled={pending} onClick={submit}>
          {pending ? "Adding…" : "Add team"}
        </button>
      </div>
    </div>
  );
}

const modalInputStyle: React.CSSProperties = {
  padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

// Add/remove players on an already-confirmed team, any time — not just
// the captain, not just during the registration window. See
// tournament_admin_roster.sql for the backend side of this.
function TeamRosterModal({ team, onClose, onChanged }: {
  team: TeamRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  type RosterRow = TournamentTeamPlayer & { name: string; username: string | null; avatar_url: string | null };
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addMode, setAddMode] = useState<"registered" | "walkin">("registered");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; username: string | null; avatar_url: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [addRole, setAddRole] = useState<"player" | "substitute">("player");
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wEmail, setWEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Used from remove()/add() below (event handlers, not effects) to
  // refetch after a mutation — the mount effect has its own inline
  // fetch instead of calling this, since a synchronous setState call
  // directly in an effect body (as opposed to inside its async
  // continuation) trips react-hooks/set-state-in-effect.
  function load() {
    setLoading(true);
    getTeamRoster(team.id).then((res) => {
      if (!isActionError(res)) setRoster(res);
      setLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    getTeamRoster(team.id).then((res) => {
      if (cancelled) return;
      if (!isActionError(res)) setRoster(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [team.id]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const t = setTimeout(() => {
      setSearching(true);
      searchPlayersForTeam(query, team.id).then((res) => {
        setSearching(false);
        if (!isActionError(res)) setResults(res);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, team.id]);

  function remove(playerId: string, name: string) {
    if (!window.confirm(`Remove ${name} from ${team.name}?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await removeTeamPlayerAdmin(playerId);
      if (isActionError(res)) { setErr(res.message); return; }
      load();
      onChanged();
    });
  }

  function add(userId: string) {
    setErr(null);
    startTransition(async () => {
      const res = await addTeamPlayer(team.id, userId, addRole);
      if (isActionError(res)) { setErr(res.message); return; }
      setQuery(""); setResults([]);
      load();
      onChanged();
    });
  }

  function addWalkin() {
    if (!wName.trim() || !wPhone.trim()) { setErr("Enter a name and phone number."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await addWalkinTeamPlayer(team.id, wName.trim(), wPhone.trim(), wEmail.trim() || undefined, addRole);
      if (isActionError(res)) { setErr(res.message); return; }
      setWName(""); setWPhone(""); setWEmail("");
      load();
      onChanged();
    });
  }

  function startEdit(p: RosterRow) {
    setEditingId(p.id);
    setEditName(p.guest_name ?? "");
    setEditPhone(p.guest_phone ?? "");
    setEditEmail(p.guest_email ?? "");
  }

  function saveEdit(playerId: string) {
    if (!editName.trim() || !editPhone.trim()) { setErr("Enter a name and phone number."); return; }
    setErr(null);
    startTransition(async () => {
      const res = await updateTeamPlayerGuest(playerId, editName.trim(), editPhone.trim(), editEmail.trim() || undefined);
      if (isActionError(res)) { setErr(res.message); return; }
      setEditingId(null);
      load();
      onChanged();
    });
  }

  return (
    <div className="tc-scrim" onClick={onClose}>
      <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800 }}>{team.name} — Roster</h3>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center" }}><X size={18} /></button>
        </div>

        {loading ? (
          <div className="tc-empty">Loading roster…</div>
        ) : roster.length === 0 ? (
          <div className="tc-empty">No roster on file yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {roster.map((p) => (
              editingId === p.id ? (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px", borderRadius: 10, background: "rgba(0,98,65,0.06)" }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" style={modalInputStyle} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" style={{ ...modalInputStyle, flex: 1, minWidth: 120 }} />
                    <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email (optional)" style={{ ...modalInputStyle, flex: 1, minWidth: 120 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="tc-btn primary" style={{ padding: "6px 10px", fontSize: 12 }} disabled={pending} onClick={() => saveEdit(p.id)}>Save</button>
                    <button className="tc-btn" style={{ padding: "6px 10px", fontSize: 12 }} disabled={pending} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(242,237,230,0.04)" }}>
                  <span style={{ flex: 1, fontSize: 13.5 }}>
                    {p.name}
                    {!p.user_id && <span className="tc-dim" style={{ marginLeft: 6, fontSize: 11 }}>Walk-in</span>}
                  </span>
                  <span className="tc-dim" style={{ fontSize: 11.5, textTransform: "capitalize" }}>{p.role}</span>
                  {!p.user_id && (
                    <button
                      aria-label={`Edit ${p.name}`} disabled={pending} onClick={() => startEdit(p)}
                      style={{ background: "none", border: "none", color: "inherit", opacity: 0.5, cursor: "pointer", padding: 4, display: "flex" }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {p.role !== "captain" && (
                    <button
                      aria-label={`Remove ${p.name}`} disabled={pending} onClick={() => remove(p.id, p.name)}
                      style={{ background: "none", border: "none", color: "#ef4444", opacity: 0.75, cursor: "pointer", padding: 4, display: "flex" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid rgba(242,237,230,0.1)", paddingTop: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button
              className={`tc-btn ${addMode === "registered" ? "primary" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => setAddMode("registered")}
            >
              Registered player
            </button>
            <button
              className={`tc-btn ${addMode === "walkin" ? "primary" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => setAddMode("walkin")}
            >
              Walk-in member
            </button>
          </div>

          {addMode === "registered" ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or username"
                  style={{ ...modalInputStyle, flex: 1, minWidth: 160 }}
                />
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as "player" | "substitute")} style={modalInputStyle}>
                  <option value="player">Player</option>
                  <option value="substitute">Substitute</option>
                </select>
              </div>
              {searching && <div className="tc-dim" style={{ fontSize: 12 }}>Searching…</div>}
              {query.trim().length >= 2 && results.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {results.map((r) => (
                    <button
                      key={r.id} className="tc-btn" style={{ padding: "8px 10px", justifyContent: "space-between" }}
                      disabled={pending} onClick={() => add(r.id)}
                    >
                      <span>{r.name}{r.username && <span className="tc-dim"> @{r.username}</span>}</span>
                      <UserPlus size={14} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={wName} onChange={(e) => setWName(e.target.value)} placeholder="Name" style={modalInputStyle} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={wPhone} onChange={(e) => setWPhone(e.target.value)} placeholder="Phone" style={{ ...modalInputStyle, flex: 1, minWidth: 120 }} />
                <input value={wEmail} onChange={(e) => setWEmail(e.target.value)} placeholder="Email (optional)" style={{ ...modalInputStyle, flex: 1, minWidth: 120 }} />
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as "player" | "substitute")} style={modalInputStyle}>
                  <option value="player">Player</option>
                  <option value="substitute">Substitute</option>
                </select>
              </div>
              <button className="tc-btn primary" style={{ padding: "8px 12px", alignSelf: "flex-start" }} disabled={pending} onClick={addWalkin}>
                <UserPlus size={14} /> Add member
              </button>
            </div>
          )}
        </div>

        {err && <div className="tc-err" style={{ marginTop: 14 }}>{err}</div>}
      </div>
    </div>
  );
}
