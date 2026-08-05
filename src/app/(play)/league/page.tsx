import { browseSquads, myMemberships } from "@/lib/squads/queries";
import SquadsClient from "./SquadsClient";
import ChatTabs from "@/components/ChatTabs";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const [squads, memberships] = await Promise.all([browseSquads(), myMemberships()]);
  return (
    <div className="play">
      <div className="play-wrap">
        <ChatTabs />
        <div className="play-hero">
          <div className="play-eyebrow">Chat &amp; communities</div>
          <h1>Find your regular <em>crew.</em></h1>
          <p>
            The best games come around every week. Make a group or join one near you —
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
