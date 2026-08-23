"use client";

import { useEffect, useState } from "react";
import { getTournamentStandings } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import type { Tournament, TournamentTeam, TournamentStanding } from "@/lib/tournaments/types";

const ALL = "__all__";

// Read-only, derived from tournament_standings() on the server — used
// both embedded in the vendor/admin console and on the public tournament
// page, since standings carry no write actions either way.
export default function StandingsTab({ tournament, teams }: {
  tournament: Tournament;
  teams: Pick<TournamentTeam, "group_name">[];
}) {
  const groups = tournament.format === "group_knockout"
    ? [...new Set(teams.map((t) => t.group_name).filter((g): g is string => !!g))].sort()
    : [null];

  const [data, setData] = useState<Record<string, TournamentStanding[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const entries = await Promise.all(groups.map(async (g) => {
        const res = await getTournamentStandings(tournament.id, g ?? undefined);
        return [g ?? ALL, isActionError(res) ? [] : res] as const;
      }));
      if (!cancelled) setData(Object.fromEntries(entries));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, tournament.format, groups.join("|")]);

  if (tournament.format === "knockout") {
    return <div className="tc-empty">Knockout tournaments don&apos;t track standings — see the Bracket tab.</div>;
  }
  if (loading) return <div className="tc-empty">Loading standings…</div>;

  return (
    <div className="tc-card">
      <div className="tc-card-t">Standings</div>
      {groups.map((g) => {
        const rows = data[g ?? ALL] ?? [];
        return (
          <div key={g ?? ALL} style={{ marginTop: 16 }}>
            {g && <div className="tc-card-sub" style={{ fontWeight: 700, opacity: 0.8, marginBottom: 8 }}>Group {g}</div>}
            {rows.length === 0 ? (
              <div className="tc-empty">No results yet.</div>
            ) : (
              <table className="tc-table">
                <thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.team_id}>
                      <td style={{ fontWeight: 600 }}>{r.team_name}</td>
                      <td className="tc-num">{r.played}</td>
                      <td className="tc-num">{r.won}</td>
                      <td className="tc-num">{r.drawn}</td>
                      <td className="tc-num">{r.lost}</td>
                      <td className="tc-num" style={{ fontWeight: 700 }}>{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
