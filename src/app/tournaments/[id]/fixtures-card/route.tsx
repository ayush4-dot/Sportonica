import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { getTournament, getTournamentMatches, getTeamNames, getDisplayVenueName } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { sportColor } from "@/lib/sports";
import type { TournamentMatch } from "@/lib/tournaments/types";

export const runtime = "nodejs";

const KTM_TZ = "Asia/Kathmandu";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: KTM_TZ });
const rowTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KTM_TZ });

function roundShortCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("final") && !l.includes("semi") && !l.includes("quarter")) return "F";
  if (l.includes("semi")) return "SF";
  if (l.includes("quarter")) return "QF";
  const roundOf = l.match(/round of\s*(\d+)/);
  if (roundOf) return `R${roundOf[1]}`;
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

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

const MAX_ROWS = 14;

// 4:5 "matchday" card — every fixture on one day, in one compact list,
// rather than one poster per match (that read as an oversized, mostly
// empty card for a single 1v1 — this is what actually gets shared:
// "here's the whole day's schedule"). Satori (the renderer): every
// element with more than one child needs display:flex, and only
// jpeg/png/gif/webp images decode.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const theme = url.searchParams.get("theme") === "paper" ? "paper" : "glass";
  const date = url.searchParams.get("date");

  const tournament = await getTournament(id).catch(() => null);
  if (!date || !tournament || isActionError(tournament)) return errorCard();

  const matchesRes = await getTournamentMatches(id);
  const allMatches = isActionError(matchesRes) ? [] : matchesRes;
  const dayMatches = allMatches
    .filter((m) => m.starts_at && dayKey(m.starts_at) === date)
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!));
  if (dayMatches.length === 0) return errorCard();

  const teamIds = [...new Set(dayMatches.flatMap((m) => [m.team_a_id, m.team_b_id]).filter((t): t is string => !!t))];
  const [venueName, teamNamesRes] = await Promise.all([getDisplayVenueName(tournament), getTeamNames(teamIds)]);
  const names = isActionError(teamNamesRes) ? {} : teamNamesRes;
  const teamName = (m: TournamentMatch, side: "a" | "b") => {
    const tid = side === "a" ? m.team_a_id : m.team_b_id;
    if (tid) return names[tid] ?? "TBD";
    return side === "b" && m.status === "completed" ? "Bye" : "TBD";
  };

  const accent = sportColor(tournament.sport);
  const C = theme === "paper"
    ? { bg: "#F2EDE6", text: "#1e3932", dim: "#5f756d", hair: "#D6CEC0" }
    : { bg: "#0B0D11", text: "#F2EDE6", dim: "#8b93a1", hair: "#22262E" };

  const dateHeading = new Date(`${date}T12:00:00+05:45`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: KTM_TZ,
  });

  const overflow = dayMatches.length > MAX_ROWS;
  const shown = overflow ? dayMatches.slice(0, MAX_ROWS - 1) : dayMatches;
  const rowSlots = overflow ? MAX_ROWS : dayMatches.length;

  // Available list height is fixed regardless of row count — rows shrink
  // to fit a busy day, but are capped well below that ceiling so a quiet
  // day (1-2 matches) doesn't stretch into a few giant rows floating in
  // an otherwise empty card; the list is top-anchored (see justifyContent
  // below) so any leftover room falls as a plain gap above the footer,
  // not as padding squeezed around the rows themselves.
  const AVAILABLE = 802;
  const rowHeight = Math.max(56, Math.min(84, AVAILABLE / rowSlots));
  const size = rowHeight >= 78 ? { time: 21, team: 25, round: 15, score: 24 }
    : rowHeight >= 66 ? { time: 19, team: 22, round: 13, score: 22 }
    : { time: 17, team: 19, round: 12, score: 19 };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sportonica.com";
  const qrTarget = `${siteUrl}/tournaments/${tournament.id}?tab=fixtures`;
  const qrDataUrl = await QRCode.toDataURL(qrTarget, {
    margin: 2, width: 400, errorCorrectionLevel: "M", color: { dark: "#0B0D11", light: "#FFFFFF" },
  });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, padding: "64px 72px" }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 22, color: accent, letterSpacing: 5, fontWeight: 700 }}>
          {tournament.sport.toUpperCase()}
          <div style={{ width: 40, height: 2, background: C.hair, marginLeft: 16, marginRight: 16, display: "flex" }} />
          FIXTURES
        </div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1, marginTop: 10, display: "flex" }}>
          {dateHeading}
        </div>
        <div style={{ fontSize: 24, color: C.dim, marginTop: 8, display: "flex" }}>
          {trim(tournament.name, 46)}{venueName && venueName !== "—" ? ` · ${venueName}` : ""}
        </div>

        {/* list — top-anchored, not centered: a quiet day with only a
            couple of matches should read as "a couple of matches, then
            the brand footer", not as a couple of rows floating in the
            middle of a mostly-empty card. */}
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "flex-start", marginTop: 32 }}>
          {shown.map((m, i) => {
            const teamA = teamName(m, "a");
            const teamB = teamName(m, "b");
            const showScore = m.status === "completed" && m.score_a !== null && m.score_b !== null;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", height: rowHeight,
                  borderTop: i === 0 ? "none" : `1px solid ${C.hair}`,
                }}
              >
                <div style={{ width: 96, flexShrink: 0, fontSize: size.time, fontWeight: 700, color: C.dim, display: "flex" }}>
                  {rowTime(m.starts_at!)}
                </div>
                <div style={{ display: "flex", alignItems: "center", flexGrow: 1, minWidth: 0, fontSize: size.team, fontWeight: 700, gap: 10 }}>
                  <span style={{ display: "flex" }}>{trim(teamA, 20)}</span>
                  {showScore ? (
                    <span style={{ display: "flex", fontSize: size.score, fontWeight: 800, color: accent }}>
                      {m.score_a}–{m.score_b}
                    </span>
                  ) : m.status === "walkover" ? (
                    <span style={{ display: "flex", fontSize: size.round, color: accent, fontWeight: 700 }}>w/o</span>
                  ) : (
                    <span style={{ display: "flex", color: C.dim, opacity: 0.6 }}>vs</span>
                  )}
                  <span style={{ display: "flex" }}>{trim(teamB, 20)}</span>
                </div>
                <div style={{ width: 70, flexShrink: 0, textAlign: "right", justifyContent: "flex-end", fontSize: size.round, color: C.dim, fontWeight: 700, display: "flex" }}>
                  {roundShortCode(m.round_label)}
                </div>
              </div>
            );
          })}
          {overflow && (
            <div style={{ display: "flex", alignItems: "center", height: rowHeight, borderTop: `1px solid ${C.hair}`, fontSize: size.team, fontWeight: 700, color: C.dim }}>
              +{dayMatches.length - shown.length} more matches
            </div>
          )}
        </div>

        {/* footer brand */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${C.hair}`, paddingTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${siteUrl}/icons/icon-512.png`}
              width={52} height={52}
              style={{ borderRadius: 13, marginRight: 16 }}
              alt=""
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 29, fontWeight: 800, display: "flex" }}>Sportonica</div>
              <div style={{ fontSize: 17, color: C.dim, display: "flex" }}>sportonica.com/tournaments</div>
            </div>
          </div>
          <div style={{ display: "flex", padding: 9, background: "#FFFFFF", borderRadius: 13 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} width={96} height={96} alt="" />
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}
