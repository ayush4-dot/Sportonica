import { ImageResponse } from "next/og";
import { getTournament, getDisplayVenueName } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS } from "@/lib/tournaments/types";
import { sportColor } from "@/lib/sports";

export const runtime = "nodejs";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kathmandu",
});
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu",
});

// 9:16 story card — 1080x1920, same shape as /p/[username]/story. Built for
// the "Download/share card" button so a tournament can go straight to an
// Instagram/Facebook Story or feed post looking designed, not like a
// screenshot. Satori (the renderer): every element with more than one child
// needs display:flex, and only jpeg/png/gif/webp images decode.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const theme = new URL(req.url).searchParams.get("theme") === "paper" ? "paper" : "glass";

  const tournament = await getTournament(id).catch(() => null);
  if (!tournament || isActionError(tournament)) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0D11", color: "#F2EDE6", fontSize: 72, fontWeight: 700 }}>
          Sportonica
        </div>
      ),
      { width: 1080, height: 1920 }
    );
  }

  const venueName = await getDisplayVenueName(tournament);
  const accent = sportColor(tournament.sport);

  const C = theme === "paper"
    ? { bg: "#F2EDE6", text: "#1e3932", dim: "#5f756d", faint: "#5f756d", hair: "#D6CEC0" }
    : { bg: "#0B0D11", text: "#F2EDE6", dim: "#5f756d", faint: "#5f756d", hair: "#22262E" };

  // Absolute-URL check matters here, not just the extension: banner_url
  // used to be a freeform text field (pre file-upload), so old rows can
  // hold a bare filename like "logo.png" that Satori's <img> then rejects
  // outright ("Image source must be an absolute URL") and 500s the route.
  const safeBanner =
    tournament.banner_url && /^https?:\/\/.+\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(tournament.banner_url)
      ? tournament.banner_url
      : null;

  const isSingleEvent = tournament.format === "single_event";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text }}>

        {/* banner strip */}
        <div style={{ width: "100%", height: 720, display: "flex", position: "relative", background: C.hair }}>
          {safeBanner ? (
            <img src={safeBanner} width={1080} height={720} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${accent}33, ${C.hair})` }}>
              <div style={{ fontSize: 220, display: "flex", color: accent }}>🏆</div>
            </div>
          )}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 260, display: "flex", background: `linear-gradient(to top, ${C.bg}, transparent)` }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "0 84px 84px" }}>

          {/* eyebrow */}
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: accent, letterSpacing: 6, marginTop: -40 }}>
            TOURNAMENT
            <div style={{ width: 60, height: 2, background: C.hair, marginLeft: 20, marginRight: 20, display: "flex" }} />
            {tournament.sport.toUpperCase()}
          </div>

          {/* name */}
          <div style={{ fontSize: tournament.name.length > 22 ? 76 : 100, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05, marginTop: 20, display: "flex" }}>
            {tournament.name}
          </div>

          <div style={{ fontSize: 32, color: C.faint, marginTop: 20, display: "flex" }}>
            {[venueName, FORMAT_LABELS[tournament.format]].filter(Boolean).join(" · ")}
          </div>

          {/* date/time */}
          <div style={{ display: "flex", alignItems: "center", marginTop: 44, borderTop: `2px solid ${C.hair}`, paddingTop: 40 }}>
            <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: -2, color: C.text, display: "flex" }}>
              {when(tournament.starts_at)}
            </div>
            <div style={{ fontSize: 32, color: C.dim, marginLeft: 20, display: "flex" }}>
              {time(tournament.starts_at)}
            </div>
          </div>

          {/* stats: 2x1 */}
          <div style={{ display: "flex", marginTop: 56 }}>
            <Cell label="ENTRY FEE" value={tournament.fee > 0 ? money(tournament.fee) : "Free"} color={accent} C={C} />
            <Cell
              label={isSingleEvent ? "SPOTS" : "MAX TEAMS"}
              value={tournament.max_teams == null ? "Unlimited" : String(tournament.max_teams)}
              color={C.text}
              C={C}
            />
          </div>

          {/* registration window */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 56, borderTop: `2px solid ${C.hair}`, paddingTop: 40 }}>
            <div style={{ fontSize: 26, color: accent, letterSpacing: 5, display: "flex" }}>REGISTRATION CLOSES</div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1, marginTop: 14, display: "flex" }}>
              {when(tournament.registration_closes_at)} · {time(tournament.registration_closes_at)}
            </div>
          </div>

          {/* footer brand */}
          <div style={{ display: "flex", alignItems: "center", marginTop: "auto", paddingTop: 56 }}>
            <div style={{ width: 68, height: 68, background: "#006241", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 800, marginRight: 24 }}>
              S
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 40, fontWeight: 800, display: "flex" }}>Sportonica</div>
              <div style={{ fontSize: 24, color: C.faint, display: "flex" }}>sportonica.com/tournaments</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}

function Cell({
  label, value, color, C,
}: { label: string; value: string; color: string; C: { dim: string; faint: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0 }}>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1, color, display: "flex" }}>
        {value}
      </div>
      <div style={{ fontSize: 22, color: C.faint, letterSpacing: 3, marginTop: 16, display: "flex" }}>
        {label}
      </div>
    </div>
  );
}
