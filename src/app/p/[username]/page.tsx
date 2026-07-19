import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import {
  getProfileByUsername, getPlayerStats, getPlayerSports, getRecentGames,
  computeBadges, trustLabel,
} from "@/lib/profile/queries";
import ShareButton from "./ShareButton";
import DownloadButton from "./DownloadButton";
import "../profile.css";

export const dynamic = "force-dynamic";

const SPORT_COLOR: Record<string, string> = {
  Futsal: "#2E7D5B", Football: "#22c55e", Basketball: "#FFC93C", Cricket: "#f97316",
  Volleyball: "#3b82f6", Badminton: "#a855f7", Tennis: "#ec4899", Running: "#60a5fa",
};

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const p = await getProfileByUsername(username);
  if (!p || !p.is_public) return { title: "Player · Khelum Na" };

  const stats = await getPlayerStats(p.id);
  const name = p.full_name ?? p.name ?? p.username;
  const desc = stats.games_played > 0
    ? `${stats.games_played} games played · Trust ${p.trust_score}/100 · ${p.city ?? "Kathmandu"}`
    : `Just joined Khelum Na · ${p.city ?? "Kathmandu"}`;

  return {
    title: `${name} · Khelum Na`,
    description: desc,
    openGraph: { title: `${name} · Khelum Na`, description: desc, type: "profile" },
    twitter: { card: "summary_large_image", title: `${name} · Khelum Na`, description: desc },
  };
}

export default async function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const name = profile.full_name ?? profile.name ?? profile.username;

  if (!profile.is_public) {
    return (
      <div className="pf">
        <div className="pf-wrap" style={{ textAlign: "center", paddingTop: 60 }}>
          <Lock size={26} style={{ opacity: 0.5, marginBottom: 18 }} />
          <h1 className="pf-name" style={{ fontSize: "clamp(30px,6vw,44px)" }}>This card is private</h1>
          <p className="pf-lede" style={{ margin: "16px auto 30px" }}>{name} keeps their player card to themselves.</p>
          <Link href="/discover" className="pf-btn ghost">Find a game instead</Link>
        </div>
      </div>
    );
  }

  const [stats, sports, recent] = await Promise.all([
    getPlayerStats(profile.id),
    getPlayerSports(profile.id),
    getRecentGames(profile.id),
  ]);
  const badges = computeBadges(stats, sports);
  const trust = trustLabel(profile.trust_score ?? 50);
  const joined = new Date(profile.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const maxGames = Math.max(...sports.map((s) => s.games), 1);

  let secNum = 0;
  const num = () => String(++secNum).padStart(2, "0");

  return (
    <div className="pf">
      <div className="pf-wrap">
        {/* ── Masthead ── */}
        <div className="pf-eyebrow">
          Player card <span className="sep" /> {profile.city ?? "Kathmandu"} <span className="sep" /> Since {joined}
        </div>

        <div className="pf-hero">
          <h1 className="pf-name">{name}</h1>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pf-avatar" src={profile.avatar_url} alt={name} />
          ) : (
            <div className="pf-avatar">{name.charAt(0).toUpperCase()}</div>
          )}
        </div>

        {profile.bio && <p className="pf-lede">{profile.bio}</p>}

        <div className="pf-meta">
          <span>@{profile.username}</span>
          {(profile.sports ?? []).length > 0 && <span>{(profile.sports ?? []).join(" · ")}</span>}
        </div>

        <div className="pf-actions">
          <ShareButton url={`/p/${profile.username}`} name={name} />
          <DownloadButton username={profile.username} name={name} />
          <Link href="/discover" className="pf-btn ghost">Find a game</Link>
        </div>

        {/* ── Stat strip ── */}
        <div className="pf-stats">
          <div className="pf-stat">
            <div className="pf-stat-v">{stats.games_played}</div>
            <div className="pf-stat-l">Games played</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-v" style={{ color: stats.reliability !== null ? trust.color : undefined }}>
              {stats.reliability !== null ? `${stats.reliability}%` : "—"}
            </div>
            <div className="pf-stat-l">Show-up rate</div>
            {stats.reliability !== null && (
              <div className="pf-stat-bar"><div style={{ width: `${stats.reliability}%`, background: trust.color }} /></div>
            )}
          </div>
          <div className="pf-stat">
            <div className="pf-stat-v">{stats.games_hosted}</div>
            <div className="pf-stat-l">Games hosted</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-v" style={{ color: trust.color }}>{profile.trust_score ?? 50}</div>
            <div className="pf-stat-l">Trust · {trust.label}</div>
            <div className="pf-stat-bar"><div style={{ width: `${profile.trust_score ?? 50}%`, background: trust.color }} /></div>
          </div>
        </div>

        {/* ── Sports ── */}
        {sports.length > 0 && (
          <section className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-num">{num()}</span>
              <h2 className="pf-sec-t">Sports</h2>
              <span className="pf-sec-count">{sports.length} played</span>
            </div>
            {sports.map((s) => (
              <div key={s.sport} className="pf-sport">
                <div className="pf-sport-top">
                  <span className="pf-sport-name">{s.sport}</span>
                  <span className="pf-sport-n">{s.games} game{s.games !== 1 ? "s" : ""}</span>
                </div>
                <div className="pf-bar">
                  <div style={{ width: `${(s.games / maxGames) * 100}%`, background: SPORT_COLOR[s.sport] ?? "#2E7D5B" }} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Badges ── */}
        {badges.length > 0 && (
          <section className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-num">{num()}</span>
              <h2 className="pf-sec-t">Badges</h2>
              <span className="pf-sec-count">{badges.length} earned</span>
            </div>
            <div className="pf-badges">
              {badges.map((b) => (
                <span key={b.key} className="pf-badge"
                  style={{ color: b.color, borderColor: `${b.color}55`, background: `${b.color}10` }}>
                  {b.label} <small>{b.note}</small>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent games ── */}
        <section className="pf-sec">
          <div className="pf-sec-head">
            <span className="pf-sec-num">{num()}</span>
            <h2 className="pf-sec-t">Recent games</h2>
          </div>
          {recent.length === 0 ? (
            <div className="pf-empty">
              No games yet — the first one&apos;s always the hardest.{" "}
              <Link href="/discover" style={{ color: "var(--pf-accent)", fontWeight: 700, textDecoration: "none" }}>Find one →</Link>
            </div>
          ) : (
            recent.map((g) => (
              <div key={g.id} className="pf-game">
                <span className="pf-game-date">
                  {new Date(g.event_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kathmandu" })}
                </span>
                <div>
                  <div className="pf-game-t">{g.title}</div>
                  <div className="pf-game-v">{g.venue}</div>
                </div>
                <span className="pf-dot" style={{ background: g.sport_color ?? SPORT_COLOR[g.sport] ?? "#2E7D5B" }} />
              </div>
            ))
          )}
        </section>

        {/* ── Footnote ── */}
        <div className="pf-trustline">
          <span>Khelum Na · Kathmandu</span>
          <span>Trust is earned one game at a time</span>
        </div>
      </div>
    </div>
  );
}
