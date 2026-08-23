"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import {
  openTournamentRegistration, closeTournamentRegistration, cancelTournament, approveTournament,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { STATUS_LABELS, TEAM_STATUS_LABELS, FORMAT_LABELS, type Tournament, type TournamentTeam } from "@/lib/tournaments/types";
import "./tournament-console.css";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
});

type TeamRow = TournamentTeam & { roster_count: number };
type PaymentRow = { team_id: string; team_name: string; status: string; payment_method: string | null; expected_amount: number; submitted_at: string | null };

const TABS = ["Overview", "Registrations", "Payments", "Settings", "Fixtures", "Bracket", "Standings", "Results", "Announcements"] as const;
const LIVE_TABS = new Set<(typeof TABS)[number]>(["Overview", "Registrations", "Payments", "Settings"]);

export default function TournamentControlCenter({
  tournament, venueName, teams, payments, viewer, backHref,
}: {
  tournament: Tournament;
  venueName: string;
  teams: TeamRow[];
  payments: PaymentRow[];
  viewer: "vendor" | "super_admin";
  backHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [err, setErr] = useState<string | null>(null);

  const confirmedTeams = teams.filter((t) => t.status === "confirmed").length;

  function run(action: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      const res = await action();
      if (isActionError(res)) { setErr(res.message); return; }
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
        {TABS.map((t) => (
          <button key={t} className={`tc-chip ${tab === t ? "on" : ""}`} onClick={() => LIVE_TABS.has(t) && setTab(t)} disabled={!LIVE_TABS.has(t)} style={!LIVE_TABS.has(t) ? { opacity: 0.35 } : undefined}>
            {!LIVE_TABS.has(t) && <Lock size={10} style={{ marginRight: 4, verticalAlign: -1 }} />}
            {t}
          </button>
        ))}
      </div>

      {err && <div className="tc-err">{err}</div>}

      {tab === "Overview" && (
        <div className="tc-card">
          <div className="tc-card-t">Lifecycle</div>
          <div className="tc-card-sub">Registration window: {when(tournament.registration_opens_at)} → {when(tournament.registration_closes_at)}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            {tournament.status === "pending_approval" && viewer === "super_admin" && (
              <>
                <button className="tc-btn primary" disabled={pending} onClick={() => run(() => approveTournament(tournament.id, true))}>Approve & publish</button>
                <button className="tc-btn danger" disabled={pending} onClick={() => run(() => approveTournament(tournament.id, false, "Needs changes"))}>Send back to draft</button>
              </>
            )}
            {tournament.status === "pending_approval" && viewer === "vendor" && (
              <div className="tc-dim" style={{ fontSize: 13 }}>Waiting for Sportonica to review and publish this tournament.</div>
            )}
            {tournament.status === "published" && (
              <button className="tc-btn primary" disabled={pending} onClick={() => run(() => openTournamentRegistration(tournament.id))}>Open registration</button>
            )}
            {tournament.status === "registration_open" && (
              <button className="tc-btn" disabled={pending} onClick={() => run(() => closeTournamentRegistration(tournament.id))}>Close registration</button>
            )}
            {viewer === "super_admin" && !["completed", "cancelled"].includes(tournament.status) && (
              <button className="tc-btn danger" disabled={pending} onClick={() => run(() => cancelTournament(tournament.id, "Cancelled by Sportonica"))}>Cancel tournament</button>
            )}
          </div>
          {tournament.description && <p style={{ fontSize: 13.5, opacity: 0.75, marginTop: 18, maxWidth: 560 }}>{tournament.description}</p>}
        </div>
      )}

      {tab === "Registrations" && (
        <div className="tc-card">
          <div className="tc-card-t">Registered teams</div>
          <div className="tc-card-sub">Payment approval happens in Payments — Payouts &amp; Verification, same as every other booking.</div>
          {teams.length === 0 ? (
            <div className="tc-empty">No teams have registered yet.</div>
          ) : (
            <table className="tc-table">
              <thead><tr><th>Team</th><th>Roster</th><th>Status</th></tr></thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="tc-num">{t.roster_count}</td>
                    <td><span className={`tc-badge ${teamBadgeClass(t.status)}`}>{TEAM_STATUS_LABELS[t.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Payments" && (
        <div className="tc-card">
          <div className="tc-card-t">Payments</div>
          <div className="tc-card-sub">
            {viewer === "vendor"
              ? "View-only here — approve or reject from Sportonica's payment console."
              : <Link href="/platform/payments">Go to Payment Verification →</Link>}
          </div>
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
        <div className="tc-card">
          <div className="tc-card-t">Settings</div>
          {tournament.status === "draft" ? (
            <p style={{ fontSize: 13.5, opacity: 0.7 }}>This tournament is still a draft — edit it from the tournaments list.</p>
          ) : (
            <p style={{ fontSize: 13.5, opacity: 0.7 }}>
              This tournament has been submitted — its details are locked. Cancel and recreate it as a new draft to change anything structural.
            </p>
          )}
        </div>
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
