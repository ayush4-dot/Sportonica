import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { getTournament, getMatch, getTeamNames, getDisplayVenueName } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { sportColor } from "@/lib/sports";

export const runtime = "nodejs";

const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", {
  weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kathmandu",
}) : "Date TBD";
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
}) : null;

function errorCard() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0D11", color: "#F2EDE6", fontSize: 56, fontWeight: 700 }}>
        Sportonica
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}

// 4:5 feed card — 1080x1350, the tallest ratio Instagram/Facebook feed
// won't crop. Sibling to /tournaments/[id]/story (9:16, built for the
// Story sheet); this one is built for a single fixture shared straight
// into a feed post. Satori (the renderer): every element with more than
// one child needs display:flex, and only jpeg/png/gif/webp images decode.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await params;
  const theme = new URL(req.url).searchParams.get("theme") === "paper" ? "paper" : "glass";

  const [tournament, match] = await Promise.all([getTournament(id), getMatch(matchId)]);
  if (!tournament || isActionError(tournament) || !match || isActionError(match) || match.tournament_id !== id) {
    return errorCard();
  }

  const teamIds = [match.team_a_id, match.team_b_id].filter((t): t is string => !!t);
  const [venueName, teamNames] = await Promise.all([getDisplayVenueName(tournament), getTeamNames(teamIds)]);
  const names = isActionError(teamNames) ? {} : teamNames;
  const teamAName = match.team_a_id ? (names[match.team_a_id] ?? "TBD") : "TBD";
  const teamBName = match.team_b_id
    ? (names[match.team_b_id] ?? "TBD")
    : match.status === "completed" ? "Bye" : "TBD";

  const accent = sportColor(tournament.sport);
  const C = theme === "paper"
    ? { bg: "#F2EDE6", text: "#1e3932", dim: "#5f756d", hair: "#D6CEC0", panel: "#FFFFFF" }
    : { bg: "#0B0D11", text: "#F2EDE6", dim: "#8b93a1", hair: "#22262E", panel: "rgba(242,237,230,0.05)" };

  const isCompleted = match.status === "completed";
  const isWalkover = match.status === "walkover";
  const aWon = match.winner_team_id != null && match.winner_team_id === match.team_a_id;
  const bWon = match.winner_team_id != null && match.winner_team_id === match.team_b_id;
  const venueLabel = match.court_label || venueName;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sportonica.com";
  const qrTarget = `${siteUrl}/tournaments/${tournament.id}?tab=fixtures`;
  const qrDataUrl = await QRCode.toDataURL(qrTarget, {
    margin: 2, width: 400, errorCorrectionLevel: "M", color: { dark: "#0B0D11", light: "#FFFFFF" },
  });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, padding: "72px 76px" }}>

        {/* eyebrow */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: accent, letterSpacing: 5, fontWeight: 700 }}>
          {tournament.sport.toUpperCase()}
          <div style={{ width: 46, height: 2, background: C.hair, marginLeft: 18, marginRight: 18, display: "flex" }} />
          {match.round_label.toUpperCase()}
        </div>

        {/* tournament name */}
        <div style={{ fontSize: tournament.name.length > 28 ? 40 : 48, fontWeight: 800, letterSpacing: -1, lineHeight: 1.15, marginTop: 14, display: "flex", color: C.dim }}>
          {tournament.name}
        </div>

        {/* matchup */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 0 }}>
          <TeamRow name={teamAName} winner={aWon} score={isCompleted || isWalkover ? match.score_a : null} accent={accent} C={C} />
          <div style={{ display: "flex", alignItems: "center", margin: "18px 0" }}>
            <div style={{ flexGrow: 1, height: 1, background: C.hair, display: "flex" }} />
            <div style={{ fontSize: 26, fontWeight: 800, color: C.dim, letterSpacing: 3, margin: "0 24px", display: "flex" }}>VS</div>
            <div style={{ flexGrow: 1, height: 1, background: C.hair, display: "flex" }} />
          </div>
          <TeamRow name={teamBName} winner={bWon} score={isCompleted ? match.score_b : null} accent={accent} C={C} />

          {isWalkover && (
            <div style={{ fontSize: 26, fontWeight: 700, color: accent, marginTop: 32, display: "flex" }}>
              Walkover — {match.winner_team_id === match.team_a_id ? teamAName : teamBName} win
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", marginTop: isCompleted ? 32 : 44, gap: 8 }}>
            <div style={{ fontSize: isCompleted ? 28 : 46, fontWeight: 800, letterSpacing: -1, color: isCompleted ? C.dim : C.text, display: "flex" }}>
              {when(match.starts_at)}{time(match.starts_at) ? ` · ${time(match.starts_at)}` : ""}
            </div>
            {venueLabel && venueLabel !== "—" && (
              <div style={{ fontSize: isCompleted ? 22 : 26, color: C.dim, display: "flex" }}>{venueLabel}</div>
            )}
          </div>
        </div>

        {/* footer brand */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${C.hair}`, paddingTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${siteUrl}/icons/icon-512.png`}
              width={56} height={56}
              style={{ borderRadius: 14, marginRight: 18 }}
              alt=""
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 32, fontWeight: 800, display: "flex" }}>Sportonica</div>
              <div style={{ fontSize: 19, color: C.dim, display: "flex" }}>sportonica.com/tournaments</div>
            </div>
          </div>
          <div style={{ display: "flex", padding: 10, background: "#FFFFFF", borderRadius: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} width={110} height={110} alt="" />
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}

function TeamRow({ name, winner, score, accent, C }: {
  name: string; winner: boolean; score: number | null; accent: string;
  C: { text: string; dim: string; panel: string };
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        {winner && <div style={{ width: 10, height: 56, background: accent, borderRadius: 5, marginRight: 22, display: "flex" }} />}
        <div style={{
          fontSize: name.length > 16 ? 48 : 64, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05,
          color: winner ? C.text : C.dim, display: "flex",
        }}>
          {name}
        </div>
      </div>
      {score !== null && (
        <div style={{ fontSize: 68, fontWeight: 800, color: winner ? accent : C.dim, display: "flex", marginLeft: 20 }}>
          {score}
        </div>
      )}
    </div>
  );
}
