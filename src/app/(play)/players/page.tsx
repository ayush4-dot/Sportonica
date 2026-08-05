import ChatTabs from "@/components/ChatTabs";
import { listAllPlayers, listPendingRequests } from "@/lib/friends/queries";
import PlayersClient from "./PlayersClient";
import FriendRequestRow from "./FriendRequestRow";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, pending] = await Promise.all([listAllPlayers(), listPendingRequests()]);

  return (
    <div className="play">
      <div className="play-wrap">
        <ChatTabs />
        <div className="play-hero">
          <div className="play-eyebrow">Chat &amp; communities</div>
          <h1>Find people to <em>play</em> with.</h1>
          <p>Send a friend request, then message them once they accept.</p>
        </div>

        {pending.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 8 }}>
              Requests · {pending.length}
            </h2>
            {pending.map((r) => <FriendRequestRow key={r.id} request={r} />)}
          </section>
        )}

        <PlayersClient initial={players} />
      </div>
    </div>
  );
}
