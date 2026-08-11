"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, ArrowRight, LogOut, LayoutDashboard, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";

const NAV = [
  { label: "Play", href: "/discover" },
  { label: "Host event", href: "/create" },
  { label: "Chat", href: "/league" },
];

export default function SiteNav() {
  const sb = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<SupaUser | null>(null);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const role = user?.user_metadata?.role;
  const isOwner = role === "venue_owner" || role === "admin";
  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Account";

  async function logout() {
    await sb.auth.signOut();
    setUserMenu(false);
    setMenuOpen(false);
    window.location.href = "/";
  }

  return (
    <>
      <style>{`
        .snav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px clamp(20px, 4vw, 56px);
          transition: background 0.4s, padding 0.4s, backdrop-filter 0.4s, border-color 0.4s;
          border-bottom: 1px solid transparent;
        }
        .snav.scrolled {
          background: color-mix(in srgb, var(--ink) 35%, transparent);
          backdrop-filter: blur(18px) saturate(140%);
          border-bottom-color: rgba(255, 255, 255, 0.06);
          padding: 16px clamp(20px, 4vw, 56px);
        }
        .snav-links { display: flex; gap: 40px; }
        .snav-links a {
          color: color-mix(in srgb, var(--chalk) 75%, transparent); text-decoration: none;
          font-size: 14px; font-weight: 600; letter-spacing: 0.04em;
          transition: color 0.2s;
        }
        .snav-links a:hover { color: var(--chalk); }
        .snav-cta-d { display: flex; align-items: center; gap: 12px; }
        .snav-signin {
          color: color-mix(in srgb, var(--chalk) 65%, transparent); text-decoration: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: color 0.2s;
        }
        .snav-signin:hover { color: var(--chalk); }
        .snav-hamburger {
          display: none; background: transparent; border: none;
          cursor: pointer; color: var(--chalk);
        }
        .snav-btn-primary {
          background: var(--pink); color: var(--chalk); border: none;
          padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 700;
          cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Inter', sans-serif; letter-spacing: -0.01em;
        }
        .snav-user {
          position: relative; display: flex; align-items: center; gap: 9px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px; padding: 6px 8px 6px 14px; cursor: pointer;
          color: var(--chalk); font-size: 13.5px; font-weight: 600;
          transition: background 0.2s;
        }
        .snav-user:hover { background: rgba(255,255,255,0.1); }
        .snav-avatar {
          width: 26px; height: 26px; border-radius: 999px;
          background: var(--pink); color: var(--chalk);
          display: grid; place-items: center; font-size: 12px; font-weight: 800;
        }
        .snav-dropdown {
          position: absolute; top: calc(100% + 10px); right: 0;
          background: #14171E; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 7px; min-width: 200px;
          box-shadow: 0 20px 50px -12px rgba(0,0,0,0.6);
        }
        .snav-dropdown a, .snav-dropdown button {
          display: flex; align-items: center; gap: 10px; width: 100%;
          background: transparent; border: none; cursor: pointer;
          color: color-mix(in srgb, var(--chalk) 82%, transparent);
          font-size: 13.5px; font-weight: 500; font-family: inherit;
          text-decoration: none; padding: 10px 11px; border-radius: 8px;
          text-align: left; transition: background 0.15s, color 0.15s;
        }
        .snav-dropdown a:hover, .snav-dropdown button:hover {
          background: rgba(255,255,255,0.06); color: var(--chalk);
        }
        .snav-dropdown .sep { height: 1px; background: rgba(255,255,255,0.08); margin: 5px 0; }
        .snav-mob-menu {
          display: none; flex-direction: column; position: fixed; inset: 0;
          background: rgba(11, 13, 17, 0.98); z-index: 300; padding: 80px 32px 40px;
          overflow-y: auto; max-height: 100vh; align-items: flex-start;
        }
        .snav-mob-menu.open { display: flex; }
        .snav-mob-menu a, .snav-mob-menu button {
          font-size: 32px; font-weight: 800; color: var(--chalk); text-decoration: none;
          font-family: 'Inter', sans-serif;
          padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: block; line-height: 1.05; width: 100%; text-align: left;
          background: none; border-left: none; border-right: none; border-top: none;
          cursor: pointer;
        }
        @media (max-width: 900px) {
          .snav { padding: 20px 24px; }
          .snav.scrolled { padding: 14px 24px; }
          .snav-links { display: none; }
          .snav-cta-d { display: none !important; }
          .snav-hamburger { display: block; }
        }
      `}</style>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="snav-mob-menu open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={() => setMenuOpen(false)}
              style={{ position: "absolute", top: 24, right: 24, background: "none", border: "none", cursor: "pointer", color: "var(--chalk)", width: "auto", padding: 0 }}
              aria-label="Close menu"
            >
              <X size={28} />
            </button>

            {NAV.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
            ))}

            {user ? (
              <>
                <a href={isOwner ? "/admin" : "/discover"} onClick={() => setMenuOpen(false)}>
                  {isOwner ? "Console" : "My games"}
                </a>
                <button onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <a href="/login" onClick={() => setMenuOpen(false)}>Sign in</a>
                <a href="/signup" onClick={() => setMenuOpen(false)}>Sign up</a>
              </>
            )}

            <a href="/discover" style={{ marginTop: "auto" }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="snav-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "18px", fontSize: "17px", marginTop: 24, border: "none" }}
              >
                Find a game <ArrowRight size={18} />
              </motion.button>
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className={`snav${scrolled ? " scrolled" : ""}`}>
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--chalk)", fontFamily: "'Inter',sans-serif" }}>Khelam</span>
          <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--chalk)", fontFamily: "'Inter',sans-serif" }}>{" "}Na.</span>
        </a>

        <div className="snav-links">
          {NAV.map((l) => (
            <a key={l.label} href={l.href}>{l.label}</a>
          ))}
        </div>

        <div className="snav-cta-d">
          {user ? (
            <div className="snav-user" onClick={() => setUserMenu((v) => !v)}>
              <div className="snav-avatar">{firstName.charAt(0).toUpperCase()}</div>
              <span>{firstName}</span>
              <AnimatePresence>
                {userMenu && (
                  <motion.div
                    className="snav-dropdown"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a href={isOwner ? "/admin" : "/discover"}>
                      {isOwner ? <LayoutDashboard size={15} /> : <User size={15} />}
                      {isOwner ? "Venue console" : "My games"}
                    </a>
                    <div className="sep" />
                    <button onClick={logout}><LogOut size={15} /> Log out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <a href="/login" className="snav-signin">Sign in</a>
              <a href="/signup" className="snav-signin" style={{ color: "var(--chalk)" }}>Sign up</a>
            </>
          )}

          <a href="/discover">
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="snav-btn-primary">
              <Search size={14} /> Find a game
            </motion.button>
          </a>
        </div>

        <button className="snav-hamburger" onClick={() => setMenuOpen(true)} aria-label="Menu">
          <Menu size={24} />
        </button>
      </nav>
    </>
  );
}
