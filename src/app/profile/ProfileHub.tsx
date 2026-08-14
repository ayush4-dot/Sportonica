"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink, ChevronRight, Pencil, Wallet, KeyRound, Bell, SlidersHorizontal,
  ShieldQuestion, LifeBuoy, ScrollText, LogOut, Users, LayoutDashboard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ShareButton from "@/app/p/[username]/ShareButton";
import { sportColor, normalizeSport } from "@/lib/sports";
import type { PlayerProfile, PlayerStats, SportCount, Badge, ActivitySummary } from "@/lib/profile/queries";

export default function ProfileHub({
  profile, stats, sports, activity, badges, trust,
}: {
  profile: PlayerProfile;
  stats: PlayerStats;
  sports: SportCount[];
  activity: ActivitySummary;
  badges: Badge[];
  trust: { label: string; color: string };
}) {
  const name = profile.full_name ?? profile.name ?? profile.username;
  const [activeSport, setActiveSport] = useState<string | null>(sports[0]?.sport ?? null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const activeSportRow = sports.find((s) => s.sport === activeSport);
  const isOwner = profile.role === "venue_owner" || profile.role === "admin";
  const isSuperAdmin = profile.role === "super_admin";

  async function logout() {
    setLoggingOut(true);
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="pf-wrap" style={{ maxWidth: 720 }}>
      {/* ── Profile header ── */}
      <div className="pf-hub-header">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pf-avatar" src={profile.avatar_url} alt={name} style={{ width: 84, height: 84, borderRadius: 20 }} />
        ) : (
          <div className="pf-avatar" style={{ width: 84, height: 84, borderRadius: 20, fontSize: 32 }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="pf-hub-name">{name}</h1>
          <p className="pf-hub-tag" style={{ color: trust.color }}>@{profile.username} · {trust.label}</p>
        </div>
      </div>

      <div className="pf-hub-stat-row">
        <div><b>{stats.games_played}</b><span>Games</span></div>
        <div><b style={{ color: trust.color }}>{profile.trust_score ?? 50}</b><span>Karma</span></div>
        <div><b>{sports.length}</b><span>Sports</span></div>
      </div>

      <Link href={`/p/${profile.username}`} className="pf-btn ghost" style={{ marginTop: 18 }}>
        <ExternalLink size={14} /> View Public Profile
      </Link>

      {/* ── My Sports ── */}
      {sports.length > 0 && (
        <section className="pf-sec">
          <div className="pf-sec-head">
            <span className="pf-sec-num">01</span>
            <h2 className="pf-sec-t">My Sports</h2>
            <Link href="/profile/edit" className="pf-sec-count" style={{ textDecoration: "none" }}>Edit</Link>
          </div>
          <div className="pf-chips">
            {sports.map((s) => (
              <button
                key={s.sport}
                className={`pf-chip ${activeSport === s.sport ? "on" : ""}`}
                style={activeSport === s.sport ? { borderColor: sportColor(normalizeSport(s.sport)), color: sportColor(normalizeSport(s.sport)) } : undefined}
                onClick={() => setActiveSport(s.sport)}
              >
                <span className="pf-dot" style={{ background: sportColor(normalizeSport(s.sport)) }} />
                {s.sport}
              </button>
            ))}
          </div>
          {activeSportRow && (
            <div className="pf-hub-sportdetail">
              <b>{activeSportRow.games}</b> game{activeSportRow.games !== 1 ? "s" : ""} played in {activeSportRow.sport}
            </div>
          )}
        </section>
      )}

      {/* ── Reputation ── */}
      <section className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-num">02</span>
          <h2 className="pf-sec-t">Reputation</h2>
          <Link href={`/p/${profile.username}`} className="pf-sec-count" style={{ textDecoration: "none" }}>View full profile</Link>
        </div>
        <div className="pf-hub-stat-row">
          <div><b style={{ color: trust.color }}>{profile.trust_score ?? 50}</b><span>Trust score</span></div>
          <div><b>{stats.reliability !== null ? `${stats.reliability}%` : "—"}</b><span>Show-up rate</span></div>
          <div><b>{stats.no_shows}</b><span>No-shows</span></div>
        </div>
        {badges.length > 0 && (
          <div className="pf-badges" style={{ marginTop: 18 }}>
            {badges.map((b) => (
              <span key={b.key} className="pf-badge" style={{ color: b.color, borderColor: `${b.color}55`, background: `${b.color}10` }}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── My Activity ── */}
      <section className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-num">03</span>
          <h2 className="pf-sec-t">My Activity</h2>
          <Link href="/my-games" className="pf-sec-count" style={{ textDecoration: "none" }}>See all</Link>
        </div>
        <div className="pf-hub-stat-row">
          <div><b>{activity.upcoming}</b><span>Upcoming</span></div>
          <div><b>{activity.requests}</b><span>Requests</span></div>
          <div><b>{activity.completed}</b><span>Completed</span></div>
        </div>
      </section>

      {/* ── Invite & Earn ── */}
      <div className="pf-hub-promo">
        <div>
          <div className="pf-hub-promo-t"><Users size={15} /> Invite your friends</div>
          <p>Bring your team along. The more people on Khelam Na, the easier it is to fill a game.</p>
        </div>
        <ShareButton url={`/p/${profile.username}`} name={name} />
      </div>

      {/* ── Account & Settings ── */}
      <section className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-num">04</span>
          <h2 className="pf-sec-t">Account &amp; Settings</h2>
        </div>
        <div className="pf-hub-list">
          {isSuperAdmin && (
            <Row href="/platform" icon={<LayoutDashboard size={16} />} label="Platform console" />
          )}
          {isOwner && (
            <Row href="/admin" icon={<LayoutDashboard size={16} />} label="Venue console" />
          )}
          <Row href="/profile/edit" icon={<Pencil size={16} />} label="Edit Profile" />
          <Row href="/profile/payments" icon={<Wallet size={16} />} label="Payments" />
          <Row href="/profile/coming-soon?section=security" icon={<KeyRound size={16} />} label="Login &amp; Security" />
          <Row href="/profile/coming-soon?section=notifications" icon={<Bell size={16} />} label="Notifications" />
          <Row href="/profile/coming-soon?section=preferences" icon={<SlidersHorizontal size={16} />} label="Preferences" />
          <Row href="/profile/coming-soon?section=privacy" icon={<ShieldQuestion size={16} />} label="Privacy" />
        </div>
      </section>

      {/* ── Help & Legal ── */}
      <section className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-num">05</span>
          <h2 className="pf-sec-t">Help &amp; Legal</h2>
        </div>
        <div className="pf-hub-list">
          <Row href="/profile/coming-soon?section=help" icon={<LifeBuoy size={16} />} label="Help &amp; Support" />
          <Row href="/profile/coming-soon?section=legal" icon={<ScrollText size={16} />} label="Legal" />
        </div>
      </section>

      {/* ── Logout ── */}
      <div className="pf-hub-logout-wrap">
        {!confirmingLogout ? (
          <button className="pf-hub-logout" onClick={() => setConfirmingLogout(true)}>
            <LogOut size={14} /> Log out
          </button>
        ) : (
          <div className="pf-hub-logout-confirm">
            <p>Log out of your account?</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="pf-btn ghost" onClick={() => setConfirmingLogout(false)} disabled={loggingOut}>Cancel</button>
              <button className="pf-hub-logout on" onClick={logout} disabled={loggingOut}>
                {loggingOut ? "Logging out…" : "Log Out"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="pf-hub-row">
      <span className="pf-hub-row-icon">{icon}</span>
      <span className="pf-hub-row-label">{label}</span>
      <ChevronRight size={16} className="pf-hub-row-chev" />
    </Link>
  );
}
