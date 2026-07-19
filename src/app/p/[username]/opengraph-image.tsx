import { ImageResponse } from "next/og";
import { getProfileByUsernameAnon, getPlayerStatsAnon, trustLabel } from "@/lib/profile/queries";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Player card";

// Rendered on the fly when a profile link is shared, or when a player taps
// "Download card". Satori (the renderer) requires display:flex on every
// element with more than one child, and single text children per node.
export default async function OG({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  let profile = null;
  try {
    profile = await getProfileByUsernameAnon(username);
  } catch {
    profile = null;
  }

  if (!profile || !profile.is_public) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#0B0D11", color: "#F2EDE6", fontSize: 60, fontWeight: 700,
          }}
        >
          Khelum Na
        </div>
      ),
      size
    );
  }

  const stats = await getPlayerStatsAnon(profile.id);
  const name = profile.full_name ?? profile.name ?? profile.username;
  const trust = trustLabel(profile.trust_score ?? 50);
  const handle = `@${profile.username} · ${profile.city ?? "Kathmandu"}`;

  // Satori can only decode jpeg/png/gif/webp — never avif/svg/heic.
  // If the avatar isn't a safe format, fall back to the initial block.
  const safeAvatar =
    profile.avatar_url && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(profile.avatar_url)
      ? profile.avatar_url
      : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#0B0D11", padding: 64, color: "#F2EDE6",
        }}
      >
        {/* identity */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {safeAvatar ? (
            <img
              src={safeAvatar}
              width={140}
              height={140}
              style={{ borderRadius: 24, objectFit: "cover", marginRight: 32 }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 140, height: 140, borderRadius: 24, marginRight: 32,
                background: "#DE3163", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 68, fontWeight: 700, color: "#0B0D11",
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -2, display: "flex" }}>
              {name}
            </div>
            <div style={{ fontSize: 28, color: "#8A95A3", marginTop: 8, display: "flex" }}>
              {handle}
            </div>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: "flex" }}>
          <Stat label="GAMES PLAYED" value={String(stats.games_played)} color="#FFC93C" />
          <Stat label="SHOW-UP RATE" value={stats.reliability !== null ? `${stats.reliability}%` : "—"} color={trust.color} />
          <Stat label="HOSTED" value={String(stats.games_hosted)} color="#2E7D5B" />
          <Stat label="TRUST" value={String(profile.trust_score ?? 50)} color={trust.color} />
        </div>

        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 10, background: "#FFC93C", color: "#0B0D11",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 700, marginRight: 14,
              }}
            >
              K
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, display: "flex" }}>Khelum Na</div>
          </div>
          <div style={{ fontSize: 24, color: "#5A6472", display: "flex" }}>{trust.label}</div>
        </div>
      </div>
    ),
    size
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", flexGrow: 1,
        background: "#13161C", border: "1px solid #22262e", borderRadius: 18,
        padding: 26, marginRight: 16,
      }}
    >
      <div style={{ fontSize: 54, fontWeight: 700, color, letterSpacing: -2, display: "flex" }}>
        {value}
      </div>
      <div style={{ fontSize: 18, color: "#5A6472", marginTop: 10, letterSpacing: 2, display: "flex" }}>
        {label}
      </div>
    </div>
  );
}
