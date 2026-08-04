import { Users } from "lucide-react";
import { listFriends, listPendingRequests } from "@/lib/friends/queries";
import FriendRequestRow from "./FriendRequestRow";
import FriendRow from "./FriendRow";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const [pending, friends] = await Promise.all([listPendingRequests(), listFriends()]);

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 20px 100px" }}>
      <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: "clamp(26px,4vw,34px)", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 28 }}>
        Friends
      </h1>

      {pending.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 8 }}>
            Requests · {pending.length}
          </h2>
          {pending.map((r) => <FriendRequestRow key={r.id} request={r} />)}
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 8 }}>
          Your friends · {friends.length}
        </h2>
        {friends.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", opacity: 0.5 }}>
            <Users size={26} style={{ opacity: 0.5, marginBottom: 10 }} />
            <div style={{ fontSize: 13.5 }}>No friends yet. Add someone from their player card.</div>
          </div>
        ) : (
          friends.map((f) => <FriendRow key={f.id} friend={f} />)
        )}
      </section>
    </div>
  );
}
