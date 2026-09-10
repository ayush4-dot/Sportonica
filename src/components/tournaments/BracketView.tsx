import BracketBoard from "./BracketBoard";
import type { TournamentMatch, TournamentTeam } from "@/lib/tournaments/types";

// Read-only bracket tree — shared between the vendor/admin console's
// Bracket tab and the public tournament page (see BracketBoard for the
// actual premium multi-round board and its connector-line layout).
export default function BracketView({ matches, teams }: {
  matches: TournamentMatch[];
  teams: TournamentTeam[];
}) {
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  return <BracketBoard matches={matches} team={team} emptyLabel="The bracket hasn't been generated yet." />;
}
