import type { TournamentMatch } from "@/lib/tournaments/types";

// Read-only bracket tree — shared between the vendor/admin console's
// Bracket tab and the public tournament page. No connector lines (no
// canvas/SVG at this scope, per plan) — round columns use even vertical
// spacing so sibling matches land roughly opposite their shared next
// match, which is legible enough without exact geometry.
export default function BracketView({ matches, teamName }: {
  matches: TournamentMatch[];
  teamName: (id: string | null) => string;
}) {
  const knockout = [...matches]
    .filter((m) => m.stage === "knockout")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (knockout.length === 0) {
    return <div className="tc-empty">The bracket hasn&apos;t been generated yet.</div>;
  }

  const rounds = [...new Set(knockout.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", gap: 32, overflowX: "auto", padding: "8px 4px 20px" }}>
      {rounds.map((r) => {
        const ms = knockout.filter((m) => m.round === r);
        return (
          <div key={r} style={{ display: "flex", flexDirection: "column", justifyContent: "space-evenly", minWidth: 200 }}>
            <div className="tc-card-sub" style={{ fontWeight: 700, textAlign: "center", marginBottom: 12, opacity: 0.8 }}>
              {ms[0]?.round_label}
            </div>
            {ms.map((m) => (
              <div key={m.id} className="tc-card" style={{ padding: 12, marginBottom: 18 }}>
                <BracketSlot
                  name={m.team_a_id ? teamName(m.team_a_id) : "TBD"}
                  winner={m.winner_team_id != null && m.winner_team_id === m.team_a_id}
                  score={m.score_a}
                />
                <div style={{ height: 1, background: "rgba(242,237,230,0.1)", margin: "6px 0" }} />
                <BracketSlot
                  name={m.team_b_id ? teamName(m.team_b_id) : m.status === "completed" ? "Bye" : "TBD"}
                  winner={m.winner_team_id != null && m.winner_team_id === m.team_b_id}
                  score={m.score_b}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BracketSlot({ name, winner, score }: { name: string; winner: boolean; score: number | null }) {
  const tbd = name === "TBD";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: winner ? 700 : 500, opacity: tbd ? 0.5 : 1 }}>
      <span>{name}</span>
      {score != null && <span className="tc-num">{score}</span>}
    </div>
  );
}
