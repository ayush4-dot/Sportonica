import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, MapPin, Calendar } from "lucide-react";
import { getSquad, getSquadMembers, myMemberships, getSquadMessages, getSquadPolls } from "@/lib/squads/queries";
import { createClient } from "@/lib/supabase/server";
import SquadJoinButton from "./SquadJoinButton";
import SquadChat from "./SquadChat";
import SquadSettings from "./SquadSettings";
import ReportButton from "@/components/ReportButton";
import MemberManager from "./MemberManager";
import SquadPolls from "./SquadPolls";
import { sportColor, normalizeSport } from "@/lib/sports";

export const dynamic = "force-dynamic";

export default async function SquadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [squad, members, memberships, messages, polls] = await Promise.all([
    getSquad(id), getSquadMembers(id), myMemberships(), getSquadMessages(id), getSquadPolls(id),
  ]);
  if (!squad) notFound();

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const color = squad.color ?? sportColor(normalizeSport(squad.sport));
  const isIn = memberships.has(squad.id);

  return (
    <div className="play">
      <div className="play-wrap" style={{ maxWidth: 720 }}>
        <Link href="/league" className="play-btn ghost" style={{ marginBottom: 22 }}>
          <ArrowLeft size={15} /> All squads
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: `${color}22`, border: `1px solid ${color}55`, display: "grid", placeItems: "center", color }}>
            <Users size={26} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: "clamp(26px, 6vw, 30px)", fontWeight: 800, letterSpacing: "-1px" }}>{squad.name}</h1>
            <span className="venue-tag">{squad.sport}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: "var(--dim)", fontSize: 13.5, margin: "12px 0 18px" }}>
          {squad.area && <span><MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{squad.area}</span>}
          {squad.schedule && <span><Calendar size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{squad.schedule}</span>}
          <span><Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{squad.member_count} member{squad.member_count !== 1 ? "s" : ""}</span>
        </div>

        {squad.description && <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--dim)", marginBottom: 22 }}>{squad.description}</p>}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <SquadJoinButton squadId={squad.id} initialJoined={isIn} />
          {squad.locked && !isIn && (
            <span style={{ fontSize: 12.5, color: "var(--faint)" }}>This squad is locked — no new members.</span>
          )}
          {user && user.id !== squad.creator_id && (
            <ReportButton targetType="squad" targetId={squad.id} label="Report squad" />
          )}
        </div>

        {user?.id === squad.creator_id && (
          <SquadSettings
            squadId={squad.id}
            initialLocked={!!squad.locked}
            initialUnlisted={!!squad.unlisted}
          />
        )}

        <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800, margin: "34px 0 14px" }}>
          Squad chat
        </h2>
        <SquadChat
          squadId={squad.id}
          initialMessages={messages}
          isMember={isIn}
          meId={user?.id ?? null}
        />

        <SquadPolls squadId={squad.id} polls={polls} isMember={isIn} meId={user?.id ?? null} />

        <MemberManager
          squadId={squad.id}
          members={members}
          isCreator={user?.id === squad.creator_id}
          meId={user?.id ?? null}
          accentColor={color}
        />
      </div>
    </div>
  );
}
