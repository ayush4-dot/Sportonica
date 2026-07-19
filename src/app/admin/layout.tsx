<<<<<<< HEAD
import "./admin.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  // Middleware already gates /admin, but defense in depth: re-check here.
  if (!user) redirect("/login");
  const role = user.user_metadata?.role;
  if (role !== "admin" && role !== "venue_owner") redirect("/");

  return (
    <div className="adm">
      <AdminNav />
      <div className="adm-main">{children}</div>
    </div>
=======
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import {
  LayoutDashboard, Building2, CalendarDays, BookOpen,
  BarChart3, Zap, DollarSign, Menu, X, ChevronRight,
  LogOut, Bell, Settings,
} from "lucide-react";

const ink     = "#0B0D11";
const inkSoft = "#13161C";
const inkMid  = "#1C2029";
const paper   = "#F2EDE6";
const pink    = "#DE3163";
const flood   = "#FFC93C";
const turf    = "#2E7D5B";
const slate   = "#8A95A3";

const NAV = [
  { label: "Overview",    href: "/admin",          icon: LayoutDashboard },
  { label: "Venue",       href: "/admin/venue",    icon: Building2 },
  { label: "Slots",       href: "/admin/slots",    icon: CalendarDays },
  { label: "Bookings",    href: "/admin/bookings", icon: BookOpen },
  { label: "Revenue",     href: "/admin/revenue",  icon: DollarSign },
  { label: "Analytics",   href: "/admin/analytics",icon: BarChart3 },
  { label: "Flash Match", href: "/admin/flash",    icon: Zap },
];

const STYLES = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-16px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pulseScale {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.2); opacity: 0.5; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .adm-sidebar {
    width: 240px;
    flex-shrink: 0;
    background: ${inkSoft};
    border-right: 1px solid rgba(255,255,255,0.07);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .adm-sidebar::-webkit-scrollbar { width: 0; }

  .adm-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    color: ${slate};
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
  }
  .adm-nav-item:hover { background: rgba(255,255,255,0.05); color: ${paper}; }
  .adm-nav-item.active {
    background: rgba(222,49,99,0.12);
    color: ${pink};
    border: 1px solid rgba(222,49,99,0.2);
  }
  .adm-nav-item.active svg { color: ${pink}; }

  .adm-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 32px 40px;
  }

  .adm-card {
    background: ${inkSoft};
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  }

  .adm-stat-card {
    background: ${inkSoft};
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 20px 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    transition: border-color 0.2s, transform 0.2s;
  }
  .adm-stat-card:hover { border-color: rgba(255,255,255,0.14); transform: translateY(-2px); }

  .adm-btn-primary {
    background: ${pink};
    color: #fff;
    border: none;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 16px rgba(222,49,99,0.35);
    transition: opacity 0.15s, transform 0.15s;
  }
  .adm-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }

  .adm-btn-secondary {
    background: rgba(255,255,255,0.07);
    color: ${paper};
    border: 1px solid rgba(255,255,255,0.1);
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s;
  }
  .adm-btn-secondary:hover { background: rgba(255,255,255,0.11); }

  .adm-input {
    width: 100%;
    padding: 10px 14px;
    background: rgba(255,255,255,0.05);
    border: 1.5px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    color: ${paper};
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .adm-input:focus {
    border-color: ${pink};
    box-shadow: 0 0 0 3px rgba(222,49,99,0.15);
  }
  .adm-input::placeholder { color: ${slate}; }

  .adm-select {
    width: 100%;
    padding: 10px 14px;
    background: rgba(255,255,255,0.05);
    border: 1.5px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    color: ${paper};
    font-size: 14px;
    font-family: 'Inter', sans-serif;
    outline: none;
    cursor: pointer;
    appearance: none;
    box-sizing: border-box;
  }
  .adm-select:focus { border-color: ${pink}; }
  .adm-select option { background: ${inkMid}; }

  .adm-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: ${slate};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
    font-family: 'Inter', sans-serif;
  }

  .adm-table { width: 100%; border-collapse: collapse; }
  .adm-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: ${slate};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
  }
  .adm-table td {
    padding: 12px 16px;
    font-size: 14px;
    color: ${paper};
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-family: 'Inter', sans-serif;
  }
  .adm-table tr:last-child td { border-bottom: none; }
  .adm-table tbody tr { transition: background 0.12s; }
  .adm-table tbody tr:hover { background: rgba(255,255,255,0.03); }

  .adm-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
  }
  .adm-badge-green  { background: rgba(34,197,94,0.12);  color: #22c55e; }
  .adm-badge-red    { background: rgba(239,68,68,0.12);   color: #ef4444; }
  .adm-badge-yellow { background: rgba(255,201,60,0.12);  color: ${flood}; }
  .adm-badge-blue   { background: rgba(96,165,250,0.12);  color: #60a5fa; }
  .adm-badge-pink   { background: rgba(222,49,99,0.12);   color: ${pink}; }
  .adm-badge-slate  { background: rgba(138,149,163,0.12); color: ${slate}; }

  .adm-toggle-wrap { display: flex; align-items: center; gap: 10px; }
  .adm-toggle {
    position: relative; width: 40px; height: 22px;
    background: rgba(255,255,255,0.1); border-radius: 100px; cursor: pointer;
    transition: background 0.2s; border: none; padding: 0;
  }
  .adm-toggle.on { background: ${turf}; }
  .adm-toggle::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%; background: #fff;
    transition: left 0.2s;
  }
  .adm-toggle.on::after { left: 21px; }

  .adm-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .adm-page-title {
    font-size: 22px;
    font-weight: 800;
    color: ${paper};
    font-family: 'Bricolage Grotesque', sans-serif;
    letter-spacing: -0.5px;
  }
  .adm-page-sub {
    font-size: 14px;
    color: ${slate};
    font-family: 'Inter', sans-serif;
    margin-top: 4px;
  }

  .adm-mobile-bar {
    display: none;
    position: sticky;
    top: 0;
    z-index: 200;
    background: rgba(11,13,17,0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    padding: 14px 20px;
    align-items: center;
    justify-content: space-between;
  }
  .adm-mobile-drawer {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0,0,0,0.7);
  }
  .adm-mobile-drawer.open { display: block; }
  .adm-drawer-panel {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 260px;
    background: ${inkSoft};
    border-right: 1px solid rgba(255,255,255,0.07);
    padding: 24px 16px;
    overflow-y: auto;
    animation: slideIn 0.25s ease;
  }

  @media (max-width: 900px) {
    .adm-sidebar { display: none; }
    .adm-mobile-bar { display: flex; }
    .adm-main { padding: 20px 16px; }
  }
  @media (max-width: 600px) {
    .adm-stat-grid { grid-template-columns: 1fr 1fr !important; }
  }
`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavItems = () => (
    <>
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <a
            key={item.href}
            href={item.href}
            className={`adm-nav-item${active ? " active" : ""}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon size={16} />
            {item.label}
            {active && <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.5 }} />}
          </a>
        );
      })}
    </>
  );

  return (
    <>
      <style>{STYLES}</style>
      <AnimatedBackground accent1="#DE3163" accent2="#FFC93C" accent3="#2E7D5B" opacity={0.6} />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", background: ink, display: "flex" }}>

        {/* ── SIDEBAR (desktop) ── */}
        <aside className="adm-sidebar">
          {/* Logo */}
          <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}>
              <span style={{ fontSize: "20px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>Khelum</span>
              <span style={{ fontSize: "20px", fontWeight: 800, color: pink, fontFamily: "'Bricolage Grotesque',sans-serif" }}> Na.</span>
            </a>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(255,201,60,0.1)", border: "1px solid rgba(255,201,60,0.2)", borderRadius: "100px", padding: "3px 10px", marginTop: "8px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: flood, animation: "pulseScale 2s ease-in-out infinite" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: flood, letterSpacing: "0.04em" }}>ADMIN PANEL</span>
            </div>
          </div>

          {/* Venue quick info */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(46,125,91,0.15)", border: "1px solid rgba(46,125,91,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Building2 size={16} color={turf} />
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: paper }}>My Venue</div>
                <div style={{ fontSize: "11px", color: slate }}>Court Owner</div>
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav style={{ padding: "12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItems />
          </nav>

          {/* Bottom actions */}
          <div style={{ padding: "12px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: "2px" }}>
            <a href="/admin/settings" className="adm-nav-item">
              <Settings size={16} /> Settings
            </a>
            <a href="/" className="adm-nav-item">
              <LogOut size={16} /> Back to app
            </a>
          </div>
        </aside>

        {/* ── MOBILE TOP BAR ── */}
        <div className="adm-mobile-bar" style={{ width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setDrawerOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: paper, display: "flex", padding: "4px" }}>
              <Menu size={22} />
            </button>
            <span style={{ fontSize: "18px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Khelum<span style={{ color: pink }}> Na.</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: slate, display: "flex", padding: "4px" }}>
              <Bell size={18} />
            </button>
          </div>
        </div>

        {/* ── MOBILE DRAWER ── */}
        <div className={`adm-mobile-drawer${drawerOpen ? " open" : ""}`} onClick={() => setDrawerOpen(false)}>
          <div className="adm-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <span style={{ fontSize: "18px", fontWeight: 800, color: paper, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
                Khelum<span style={{ color: pink }}> Na.</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: slate }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <NavItems />
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "16px", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <a href="/" className="adm-nav-item"><LogOut size={16} /> Back to app</a>
            </div>
          </div>
        </div>

        {/* ── PAGE CONTENT ── */}
        <main className="adm-main" style={{ fontFamily: "'Inter',sans-serif", color: paper }}>
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {children}
          </div>
        </main>

      </div>
    </>
>>>>>>> f7ffbe7b879f70291023e1d0f4280bb6ad38dbf8
  );
}
