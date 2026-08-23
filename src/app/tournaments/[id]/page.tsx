import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTournament, getTournamentVenueName, getMyTeamForTournament } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS } from "@/lib/tournaments/types";
import { telHref } from "@/lib/playTogether/types";
import TournamentRegisterPanel from "@/components/tournaments/TournamentRegisterPanel";
import "@/app/(play)/play.css";
import "@/app/platform/events/events.css";

export const dynamic = "force-dynamic";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
});

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) notFound();
  // Draft/pending_approval tournaments are only visible to their vendor
  // or a super_admin (RLS) — getTournament() already enforces that, so
  // reaching this point with a non-published status means the viewer is
  // the owner previewing it before publish.

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const [venueName, myTeam] = await Promise.all([
    getTournamentVenueName(tournament.venue_id),
    user ? getMyTeamForTournament(id) : Promise.resolve(null),
  ]);

  const phoneHref = tournament.contact_phone ? telHref(tournament.contact_phone) : null;
  const prizes = [
    tournament.prize_winner && ["Winner", tournament.prize_winner],
    tournament.prize_runner_up && ["Runner-up", tournament.prize_runner_up],
    tournament.prize_mvp && ["MVP", tournament.prize_mvp],
    tournament.prize_other && ["Other", tournament.prize_other],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="play">
      <div className="play-wrap" style={{ maxWidth: 1040 }}>
        <Link href="/tournaments" className="bk-back"><ChevronLeft size={16} /> All tournaments</Link>

        <div className="bk-hero">
          {tournament.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.banner_url} alt="" />
          ) : (
            <div className="bk-hero-empty"><Trophy size={40} /></div>
          )}
          <div className="bk-hero-grad" />
          <div className="bk-hero-info">
            <span className="bk-sport-pill">{tournament.sport}</span>
            <h1>{tournament.name}</h1>
            <div className="sub">
              <span>{venueName ?? "—"}</span>
              <span>{FORMAT_LABELS[tournament.format]}</span>
              <span>{when(tournament.starts_at)}</span>
            </div>
          </div>
        </div>

        <div className="bk-layout">
          <div>
            {tournament.description && (
              <div className="bk-panel">
                <h3>About</h3>
                <p style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{tournament.description}</p>
              </div>
            )}

            {prizes.length > 0 && (
              <div className="bk-panel">
                <h3>Prizes</h3>
                {prizes.map(([label, value]) => (
                  <div key={label} className="bk-sum-row"><span className="lbl">{label}</span><span className="val">{value}</span></div>
                ))}
              </div>
            )}

            {(tournament.rules_text || tournament.equipment_notes || tournament.venue_rules) && (
              <div className="bk-panel">
                <h3>Rules</h3>
                {tournament.rules_text && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}>{tournament.rules_text}</p>}
                {tournament.equipment_notes && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Equipment:</b> {tournament.equipment_notes}</p>}
                {tournament.venue_rules && <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}><b>Venue rules:</b> {tournament.venue_rules}</p>}
              </div>
            )}

            {tournament.refund_policy && (
              <div className="bk-panel">
                <h3>Refund policy</h3>
                <p style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6, margin: 0 }}>{tournament.refund_policy}</p>
              </div>
            )}
          </div>

          <div className="bk-summary">
            <div className="bk-panel">
              <h3>Tournament details</h3>
              <div className="bk-sum-row"><span className="lbl">Entry fee</span><span className="val">{tournament.fee > 0 ? money(tournament.fee) : "Free"}</span></div>
              <div className="bk-sum-row"><span className="lbl">Team size</span><span className="val">{tournament.min_players_per_team}–{tournament.max_players_per_team} players</span></div>
              <div className="bk-sum-row"><span className="lbl">Max teams</span><span className="val">{tournament.max_teams}</span></div>
              <div className="bk-sum-row"><span className="lbl">Registration closes</span><span className="val">{when(tournament.registration_closes_at)}</span></div>
              {tournament.skill_category && <div className="bk-sum-row"><span className="lbl">Category</span><span className="val">{tournament.skill_category}</span></div>}
              {tournament.gender_rule && <div className="bk-sum-row"><span className="lbl">Eligibility</span><span className="val">{tournament.gender_rule}</span></div>}
              {phoneHref && (
                <div className="bk-sum-row">
                  <span className="lbl">Contact</span>
                  <a href={phoneHref} className="val" style={{ color: "#006241", textDecoration: "none" }}>{tournament.contact_phone}</a>
                </div>
              )}
            </div>

            <TournamentRegisterPanel tournament={tournament} initialTeam={isActionError(myTeam) ? null : myTeam} loggedIn={!!user} />
          </div>
        </div>
      </div>
    </div>
  );
}
