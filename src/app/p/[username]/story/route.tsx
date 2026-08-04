import { ImageResponse } from "next/og";
import {
  getProfileByUsernameAnon, getPlayerStatsAnon, getPlayerSportsAnon,
  computeBadges, trustLabel,
} from "@/lib/profile/queries";

export const runtime = "nodejs";

const SPORT_COLOR: Record<string, string> = {
  Futsal: "#2E7D5B", Football: "#22c55e", Basketball: "#A78BFA", Cricket: "#f97316",
  Volleyball: "#3b82f6", Badminton: "#a855f7", Tennis: "#ec4899", Running: "#60a5fa",
};

// 9:16 story card — 1080x1920. Rendered by Satori, so: every element with
// more than one child needs display:flex, and only jpeg/png/gif/webp images.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const theme = new URL(req.url).searchParams.get("theme") === "paper" ? "paper" : "glass";

  const profile = await getProfileByUsernameAnon(username).catch(() => null);
  if (!profile || !profile.is_public) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0D11", color: "#F2EDE6", fontSize: 72, fontWeight: 700 }}>
          Khelam Na
        </div>
      ),
      { width: 1080, height: 1920 }
    );
  }

  const [stats, sports] = await Promise.all([
    getPlayerStatsAnon(profile.id),
    getPlayerSportsAnon(profile.id),
  ]);
  const badges = computeBadges(stats, sports);
  const trust = trustLabel(profile.trust_score ?? 50);
  const name = profile.full_name ?? profile.name ?? profile.username;

  // Theme palette
  const C = theme === "paper"
    ? { bg: "#F2EDE6", text: "#14171E", dim: "#6B7280", faint: "#9CA3AF", hair: "#D6CEC0", accent: "#B8860B" }
    : { bg: "#0B0D11", text: "#F2EDE6", dim: "#8A95A3", faint: "#5A6472", hair: "#22262E", accent: "#A78BFA" };

  const safeAvatar =
    profile.avatar_url && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(profile.avatar_url)
      ? profile.avatar_url
      : null;

  const joined = new Date(profile.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const maxGames = Math.max(...sports.map((s) => s.games), 1);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.text, padding: 84 }}>

        {/* eyebrow */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: C.accent, letterSpacing: 6 }}>
          PLAYER CARD
          <div style={{ width: 60, height: 2, background: C.hair, marginLeft: 20, marginRight: 20, display: "flex" }} />
          {(profile.city ?? "KATHMANDU").toUpperCase()}
        </div>

        {/* name + avatar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 44 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
            <div style={{ fontSize: name.length > 14 ? 96 : 124, fontWeight: 800, letterSpacing: -5, lineHeight: 1, display: "flex" }}>
              {name}
            </div>
            <div style={{ fontSize: 30, color: C.faint, marginTop: 24, display: "flex" }}>
              {`@${profile.username} · since ${joined}`}
            </div>
          </div>
          {safeAvatar ? (
            <img src={safeAvatar} width={168} height={168} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ width: 168, height: 168, background: "#DE3163", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 84, fontWeight: 800, color: "#0B0D11" }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* stats: 2x2 */}
        <div style={{ display: "flex", marginTop: 76, borderTop: `2px solid ${C.hair}`, paddingTop: 46 }}>
          <Cell label="GAMES PLAYED" value={String(stats.games_played)} color={C.text} C={C} />
          <Cell label="SHOW-UP RATE" value={stats.reliability !== null ? `${stats.reliability}%` : "—"} color={trust.color} C={C} />
        </div>
        <div style={{ display: "flex", marginTop: 40 }}>
          <Cell label="GAMES HOSTED" value={String(stats.games_hosted)} color={C.text} C={C} />
          <Cell label={`TRUST · ${trust.label.toUpperCase()}`} value={String(profile.trust_score ?? 50)} color={trust.color} C={C} />
        </div>

        {/* sports */}
        {sports.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 76, borderTop: `2px solid ${C.hair}`, paddingTop: 40 }}>
            <div style={{ fontSize: 26, color: C.accent, letterSpacing: 5, display: "flex" }}>SPORTS</div>
            {sports.slice(0, 3).map((s) => (
              <div key={s.sport} style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1, display: "flex" }}>{s.sport}</div>
                  <div style={{ fontSize: 28, color: C.dim, display: "flex" }}>{`${s.games} game${s.games !== 1 ? "s" : ""}`}</div>
                </div>
                <div style={{ display: "flex", height: 4, background: C.hair, marginTop: 14 }}>
                  <div style={{ width: `${(s.games / maxGames) * 100}%`, background: SPORT_COLOR[s.sport] ?? "#2E7D5B", display: "flex" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* badges */}
        {badges.length > 0 && (
          <div style={{ display: "flex", marginTop: 60, flexWrap: "wrap" }}>
            {badges.slice(0, 3).map((b) => (
              <div key={b.key}
                style={{
                  display: "flex", alignItems: "center", fontSize: 26, fontWeight: 700,
                  color: b.color, border: `2px solid ${b.color}66`,
                  padding: "16px 26px", marginRight: 16, marginBottom: 16,
                }}>
                {b.label}
              </div>
            ))}
          </div>
        )}

        {/* footer brand */}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", borderTop: `2px solid ${C.hair}`, paddingTop: 40 }}>
          <div style={{ width: 68, height: 68, background: "#A78BFA", color: "#0B0D11", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 800, marginRight: 24 }}>
            K
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, fontWeight: 800, display: "flex" }}>Khelam Na</div>
            <div style={{ fontSize: 24, color: C.faint, display: "flex" }}>Kathmandu&apos;s sports platform</div>
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
      <div style={{ fontSize: 108, fontWeight: 800, letterSpacing: -5, lineHeight: 1, color, display: "flex" }}>
        {value}
      </div>
      <div style={{ fontSize: 22, color: C.faint, letterSpacing: 3, marginTop: 16, display: "flex" }}>
        {label}
      </div>
    </div>
  );
}
