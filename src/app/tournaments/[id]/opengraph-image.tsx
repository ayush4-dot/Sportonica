import { ImageResponse } from "next/og";
import { getTournament, getDisplayVenueName } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS } from "@/lib/tournaments/types";
import { sportColor } from "@/lib/sports";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tournament card";

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-IN");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", {
  day: "numeric", month: "short", timeZone: "Asia/Kathmandu",
});

// Rendered on the fly whenever a tournament link is pasted into WhatsApp,
// Facebook, iMessage, Slack, etc — this is the preview card those apps show,
// not something a player has to go generate themselves.
export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await getTournament(id).catch(() => null);
  if (!tournament || isActionError(tournament)) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0D11", color: "#F2EDE6", fontSize: 60, fontWeight: 700 }}>
          Sportonica
        </div>
      ),
      size
    );
  }

  const venueName = await getDisplayVenueName(tournament);
  const accent = sportColor(tournament.sport);
  // Absolute-URL check matters here, not just the extension: banner_url
  // used to be a freeform text field (pre file-upload), so old rows can
  // hold a bare filename like "logo.png" that Satori's <img> then rejects
  // outright ("Image source must be an absolute URL") and 500s the route.
  const safeBanner =
    tournament.banner_url && /^https?:\/\/.+\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(tournament.banner_url)
      ? tournament.banner_url
      : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0D11", color: "#F2EDE6" }}>
        <div style={{ width: 440, height: "100%", display: "flex", background: "#13161C" }}>
          {safeBanner ? (
            <img src={safeBanner} width={440} height={630} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${accent}33, #13161C)`, fontSize: 140 }}>
              🏆
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 56, flexGrow: 1 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: accent, letterSpacing: 4, fontWeight: 700 }}>
              {tournament.sport.toUpperCase()} · {FORMAT_LABELS[tournament.format].toUpperCase()}
            </div>
            <div style={{ display: "flex", fontSize: tournament.name.length > 24 ? 52 : 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1.08, marginTop: 18 }}>
              {tournament.name}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "#8A95A3", marginTop: 16 }}>
              {[venueName, when(tournament.starts_at)].filter(Boolean).join(" · ")}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#006241", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, marginRight: 14 }}>
                S
              </div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>Sportonica</div>
            </div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: accent }}>
              {tournament.fee > 0 ? money(tournament.fee) : "Free"}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
