import { browseSquads, myMemberships } from "@/lib/squads/queries";
import SquadsClient from "./SquadsClient";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const [squads, memberships] = await Promise.all([browseSquads(), myMemberships()]);
  return (
    <div className="play">
      <div className="play-wrap">
        <div className="play-hero">
          <div className="play-eyebrow">Squads & communities</div>
          <h1>Find your regular crew.</h1>
          <p>
            The best games come around every week. Start a squad or join one near you —
            build a pool of players you can pull a game together with any time.
          </p>
        </div>
        <SquadsClient
          initialSquads={squads}
          joinedIds={Array.from(memberships)}
        />
      </div>
    </div>
  );
}
