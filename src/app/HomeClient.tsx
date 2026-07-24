"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Search, PlusCircle, MapPin, Calendar, ArrowRight, ChevronDown, Zap, Users, Trophy, CircleDot, Target, Wind, Activity } from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import { EventsRail, VenuesRail, GamesRail } from "@/components/home/Rails";
import "@/components/home/rails.css";
import type { getHomeRails } from "@/lib/play/homeRails";
import SiteNav from "@/components/layout/SiteNav";

import { useEvents, bookEvent, SPORT_COLOR } from "@/lib/hooks/useEvents";
import { useProfile } from "@/lib/hooks/useProfile";

type HomeRails = Awaited<ReturnType<typeof getHomeRails>>;

const SPORT_FACT: Record<string, { big: string; small: string }> = {
  Football:   { big: "7-a-side is the Kathmandu default", small: "Most turf grounds run 7v7 — grab six friends and you've got a match." },
  Cricket:    { big: "Box cricket, any evening", small: "Short-format indoor cricket is booming across the valley's cages." },
  Basketball: { big: "3-on-3 runs all week", small: "Half-court hoops fill up fast after 5 PM. Show up and get next." },
  Futsal:     { big: "Floodlit till late", small: "Futsal courts stay open past 10 PM — the city's favourite night game." },
  Volleyball: { big: "Co-ed and casual", small: "Six-a-side, beach or indoor. Easiest sport to join as a newcomer." },
  Badminton:  { big: "Doubles before work", small: "Indoor halls open at 6 AM — a quick game before the day starts." },
};

const SPORTS_PANELS = [
  { sport:"Futsal",     label:"FUTSAL",     color:"#2E7D5B", emoji:"⚽", desc:"Book floodlit courts by the hour. Kathmandu's favourite night game." },
  { sport:"Cricket",    label:"CRICKET",    color:"#f97316", emoji:"🏏", desc:"Weekend box cricket cups, pitch bookings, and tournaments." },
  { sport:"Basketball", label:"BASKETBALL", color:"#FFC93C", emoji:"🏀", desc:"Find courts, join runs, and compete in 3-on-3 leagues." },
  { sport:"Volleyball", label:"VOLLEYBALL", color:"#3b82f6", emoji:"🏐", desc:"Co-ed games, beach courts, and organised leagues." },
  { sport:"Badminton",  label:"BADMINTON",  color:"#a855f7", emoji:"🏸", desc:"Indoor halls, coaching sessions, and weekly round-robins." },
  { sport:"Pickleball", label:"PICKLEBALL", color:"#84cc16", emoji:"🥒", desc:"The fastest-growing game in town. Easy to learn, hard to stop." },
  { sport:"Swimming",   label:"SWIMMING",   color:"#06b6d4", emoji:"🏊", desc:"Lane bookings, early-morning laps, and coached sessions." },
];

const STATS = [
  { value:"1,200+", label:"Players" },
  { value:"500+",   label:"Games" },
  { value:"30+",    label:"Venues" },
  { value:"9",      label:"Sports" },
];

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; }

  /* ── hero ── */
  .p-hero { position:relative; height:100dvh; min-height:560px; overflow:hidden; display:flex; align-items:flex-end; }
  .p-hero video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; }
  .p-hero-overlay { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.15) 100%); }
  .p-hero-content { position:relative; z-index:2; padding:0 56px 72px; width:100%; }
  .p-hero-eyebrow { font-size:11px; font-weight:700; letter-spacing:0.2em; color:rgba(255,255,255,0.6); text-transform:uppercase; margin-bottom:20px; }
  .p-hero-h1 { font-size:clamp(52px,8vw,108px); font-weight:800; line-height:0.95; letter-spacing:-3px; color:#fff; font-family:'Bricolage Grotesque',sans-serif; margin-bottom:32px; }
  .p-hero-h1 em { font-style:normal; color:#FFC93C; }
  .p-hero-ctas { display:flex; gap:14px; flex-wrap:wrap; }
  .p-scroll-hint { position:absolute; bottom:28px; right:56px; z-index:2; display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.5); font-size:11px; font-weight:700; letter-spacing:0.15em; text-transform:uppercase; animation:scrollBounce 2s ease-in-out infinite; }
  @keyframes scrollBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(5px)} }

  /* ── sport panels ── */
  .p-rails {
    background: linear-gradient(180deg, rgba(255,255,255,0.035), transparent 60%);
    padding-bottom: 56px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  [data-theme="paper"] .p-rails {
    background: linear-gradient(180deg, rgba(20,23,30,0.04), transparent 60%);
    border-bottom-color: rgba(20,23,30,0.1);
  }
  .p-panel { position:relative; min-height:auto; overflow:hidden; padding:52px 0; }
  .p-panel-bg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:24vw; line-height:1; opacity:0.045; pointer-events:none; user-select:none; }
  .p-panel-content { position:relative; z-index:2; padding:0 56px; max-width:700px; }
  .p-panel-num { font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:20px; opacity:0.5; }
  .p-panel-title { font-size:clamp(36px,5.5vw,64px); font-weight:800; line-height:0.95; letter-spacing:-2px; font-family:'Bricolage Grotesque',sans-serif; margin-bottom:14px; }
  .p-panel-desc { font-size:15px; line-height:1.55; color:rgba(255,255,255,0.6); max-width:440px; margin-bottom:20px; }
  .p-panel-accent { position:absolute; right:0; top:0; bottom:0; width:40%; display:flex; align-items:center; justify-content:center; font-size:28vw; opacity:0.1; pointer-events:none; }

  /* game cards inside each sport panel */
  .p-games { position:relative; z-index:2; padding:24px 56px 0; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:16px; }
  .p-gcard { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:18px; transition:transform 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s, background 0.4s; }
  .p-gcard.link { cursor:pointer; text-decoration:none; color:inherit; display:block; }
  .p-gcard.link:hover { transform:translateY(-5px); border-color:rgba(255,255,255,0.25); background:rgba(255,255,255,0.05); }
  .p-gcard-title { font-family:'Bricolage Grotesque',sans-serif; font-size:16px; font-weight:700; color:#fff; margin:0 0 4px; letter-spacing:-0.3px; }
  .p-gcard-venue { font-size:12.5px; color:rgba(255,255,255,0.55); margin:0 0 14px; display:flex; align-items:center; gap:5px; }
  .p-gcard-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .p-gcard-when { font-family:'JetBrains Mono',monospace; font-size:11.5px; color:rgba(255,255,255,0.7); }
  .p-gcard-fee { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; }
  .p-gcard-bar { height:4px; border-radius:2px; background:rgba(255,255,255,0.1); overflow:hidden; margin-bottom:8px; }
  .p-gcard-slots { font-size:11px; color:rgba(255,255,255,0.5); font-family:'JetBrains Mono',monospace; }
  /* fact card (untouchable) */
  .p-gcard.fact { display:flex; flex-direction:column; justify-content:space-between; background:linear-gradient(150deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01)); }
  .p-gcard.fact .big { font-family:'Bricolage Grotesque',sans-serif; font-size:19px; font-weight:800; line-height:1.15; letter-spacing:-0.5px; margin-bottom:8px; }
  .p-gcard.fact .small { font-size:12.5px; color:rgba(255,255,255,0.6); line-height:1.5; }
  /* host-a-game card (empty state) */
  .p-gcard.host { display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:12px; min-height:150px; border-style:dashed; }
  .p-gcard.host .big { font-family:'Bricolage Grotesque',sans-serif; font-size:18px; font-weight:800; line-height:1.2; }
  .p-gcard.host .small { font-size:12.5px; color:rgba(255,255,255,0.55); line-height:1.5; }
  @media (max-width:640px){ .p-games { padding:28px 24px 0; grid-template-columns:1fr; } }

  /* ── editorial grid ── */
  .p-editorial { display:grid; grid-template-columns:1fr 1fr; min-height:100vh; }
  .p-editorial-left { display:flex; flex-direction:column; justify-content:center; padding:80px 64px; border-right:1px solid rgba(255,255,255,0.08); }
  .p-editorial-right { display:flex; flex-direction:column; justify-content:center; padding:80px 64px; }
  .p-editorial-label { font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; opacity:0.4; margin-bottom:24px; }
  .p-editorial-big { font-size:clamp(36px,5vw,64px); font-weight:800; line-height:1.0; letter-spacing:-2px; font-family:'Bricolage Grotesque',sans-serif; margin-bottom:24px; }
  .p-editorial-body { font-size:17px; line-height:1.7; color:rgba(255,255,255,0.6); max-width:480px; }

  /* ── stat strip ── */
  .p-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid rgba(255,255,255,0.08); border-bottom:1px solid rgba(255,255,255,0.08); }
  .p-stat { padding:48px 40px; border-right:1px solid rgba(255,255,255,0.08); }
  .p-stat:last-child { border-right:none; }
  .p-stat-val { font-size:clamp(36px,4vw,56px); font-weight:800; letter-spacing:-2px; font-family:'JetBrains Mono',monospace; color:#FFC93C; line-height:1; margin-bottom:8px; }
  .p-stat-label { font-size:12px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.4); }

  /* ── featured ── */
  .p-card { background:#111; border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; }
  .p-card-banner { aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
  .p-card-body { padding:20px 22px 24px; }
  .p-card-sport { font-size:10px; font-weight:800; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:8px; }
  .p-card-title { font-size:17px; font-weight:700; margin-bottom:10px; font-family:'Bricolage Grotesque',sans-serif; line-height:1.25; color:#fff; }
  .p-card-meta { font-size:12px; color:rgba(255,255,255,0.45); display:flex; flex-direction:column; gap:4px; margin-bottom:16px; }
  .p-card-footer { display:flex; align-items:center; justify-content:space-between; }
  .p-fill-bar { height:3px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-bottom:14px; }

  /* ── CTA section ── */
  .p-cta-section { min-height:80vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:80px 40px; }
  .p-cta-h2 { font-size:clamp(40px,7vw,88px); font-weight:800; line-height:0.95; letter-spacing:-3px; font-family:'Bricolage Grotesque',sans-serif; margin-bottom:32px; }
  .p-cta-h2 em { font-style:normal; color:#DE3163; }

  /* ── footer ── */
  .p-footer { border-top:1px solid rgba(255,255,255,0.08); padding:40px 56px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }

  /* ── buttons ── */
  .btn-primary { background:#DE3163; color:#fff; border:none; padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; letter-spacing:-0.01em; }
  .btn-ghost { background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.15); padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; backdrop-filter:blur(8px); }
  .btn-white { background:#fff; color:#000; border:none; padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; }

  /* ── mobile ── */
  @media(max-width:900px){
    .p-hero-content { padding:0 24px calc(130px + env(safe-area-inset-bottom, 0px)); }
    .p-hero-h1 { letter-spacing:-1.5px; }
    .p-panel-content { padding:0 24px; }
    .p-panel-accent { display:none; }
    .p-editorial { grid-template-columns:1fr; }
    .p-editorial-left { border-right:none; border-bottom:1px solid rgba(255,255,255,0.08); padding:56px 24px; }
    .p-editorial-right { padding:56px 24px; }
    .p-stats { grid-template-columns:repeat(2,1fr); }
    .p-stat { border-right:none; border-bottom:1px solid rgba(255,255,255,0.08); }
    .p-stat:nth-child(odd) { border-right:1px solid rgba(255,255,255,0.08); }
    .p-stat:last-child { border-bottom:none; }
    .p-cta-section { min-height:60vh; padding:60px 24px; }
    .p-footer { padding:32px 24px; }
    .p-match-grid { grid-template-columns:1fr !important; }
  }

  /* ══ Paper theme — flip the homepage's dark class styles ══ */
  [data-theme="paper"] .p-panel-desc { color: rgba(20,23,30,0.65); }
  [data-theme="paper"] .p-editorial-body { color: rgba(20,23,30,0.65); }
  [data-theme="paper"] .p-panel { border-top-color: rgba(20,23,30,0.1) !important; }
  [data-theme="paper"] .p-gcard { background: #ffffff; border-color: rgba(20,23,30,0.12); }
  [data-theme="paper"] .p-gcard.link:hover { background: #fff; border-color: rgba(20,23,30,0.3); }
  [data-theme="paper"] .p-gcard-title { color: #14171E; }
  [data-theme="paper"] .p-gcard-venue { color: rgba(20,23,30,0.55); }
  [data-theme="paper"] .p-gcard-when { color: rgba(20,23,30,0.7); }
  [data-theme="paper"] .p-gcard-bar { background: rgba(20,23,30,0.1); }
  [data-theme="paper"] .p-gcard-slots { color: rgba(20,23,30,0.5); }
  [data-theme="paper"] .p-gcard.fact { background: linear-gradient(150deg, #ffffff, #f1ebdf); }
  [data-theme="paper"] .p-gcard.fact .small { color: rgba(20,23,30,0.6); }
  [data-theme="paper"] .p-gcard.host .small { color: rgba(20,23,30,0.55); }
  [data-theme="paper"] .btn-ghost { color: #14171E; border-color: rgba(20,23,30,0.25); }
  [data-theme="paper"] .p-card-title { color: #14171E; }
  [data-theme="paper"] .p-fill-bar { background: rgba(20,23,30,0.1); }
`;

export default function HomeClient({ rails }: { rails?: HomeRails }) {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useProfile();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroTextY = useTransform(scrollY, [0, 500], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  const { events: featured, loading: evLoading } = useEvents({ limit: 3, onlyUpcoming: true });
  // All upcoming games, grouped by sport, to fill each sport panel.
  const { events: allGames } = useEvents({ limit: 60, onlyUpcoming: true });
  const gamesBySport = allGames.reduce((acc, g) => {
    (acc[g.sport] ??= []).push(g);
    return acc;
  }, {} as Record<string, typeof allGames>);
  const [counts, setCounts] = useState({ players:"1,200+", games:"500+", sports:"7" });

  useEffect(() => {
    (async () => {
      const raw = sessionStorage.getItem("khelamna_pending_intent");
      if (!raw) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      sessionStorage.removeItem("khelamna_pending_intent");
      const intent = JSON.parse(raw) as { type:"join"|"host"; eventId?:string };
      if (intent.type === "host") { router.push("/create"); return; }
      if (intent.type === "join" && intent.eventId) {
        await supabase.from("bookings").insert({ event_id: intent.eventId, user_id: user.id, status:"confirmed" });
        router.push("/discover");
      }
    })();
    (async () => {
      const [{ count: p }, { count: g }, { data: sd }] = await Promise.all([
        supabase.from("profiles").select("*", { count:"exact", head:true }),
        supabase.from("events").select("*",   { count:"exact", head:true }),
        supabase.from("events").select("sport").gte("event_date", new Date().toISOString()),
      ]);
      const sp = new Set((sd ?? []).map((e: { sport:string }) => e.sport)).size;
      setCounts({
        players: p ? `${p.toLocaleString()}+` : "1,200+",
        games:   g ? `${g.toLocaleString()}+` : "500+",
        sports:  sp ? String(sp) : "7",
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <AnimatedBackground accent1="#DE3163" accent2="#FFC93C" accent3="#2E7D5B" opacity={0.4} />

      <div style={{ background:"var(--ink)", color:"var(--chalk)", fontFamily:"'Inter',sans-serif" }}>

        {/* ══════════════════════════════════
            HERO — full-viewport video
        ══════════════════════════════════ */}
        <div className="p-hero" ref={heroRef}>
          <video autoPlay muted loop playsInline style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}>
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <div className="p-hero-overlay" />

          <motion.div className="p-hero-content" style={{ y: heroTextY, opacity: heroOpacity }}>
            <motion.p className="p-hero-eyebrow"
              initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.7, delay:0.2 }}>
              Kathmandu&apos;s sports platform
            </motion.p>
            <motion.h1 className="p-hero-h1"
              initial={{ opacity:0, y:32 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.9, delay:0.35, ease:[0.22,1,0.36,1] }}>
              Find.<br />Book.<br /><em>Play.</em>
            </motion.h1>
            <motion.div className="p-hero-ctas"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.7, delay:0.6 }}>
              <a href="/discover">
                <motion.button className="btn-white" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
                  Book now <ArrowRight size={17} />
                </motion.button>
              </a>
              <a href="#sports">
                <motion.button className="btn-ghost" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
                  Explore sports
                </motion.button>
              </a>
            </motion.div>
          </motion.div>

          <div className="p-scroll-hint">
            <ChevronDown size={16} /> Scroll to explore
          </div>
        </div>

        {/* ══════════════════════════════════
            STAT STRIP
        ══════════════════════════════════ */}
        <div className="p-stats">
          {[
            { val: counts.players, label: "Players" },
            { val: counts.games,   label: "Games hosted" },
            { val: "30+",          label: "Venues" },
            { val: counts.sports,  label: "Sports" },
          ].map((s, i) => (
            <motion.div key={i} className="p-stat"
              initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
              transition={{ duration:0.5, delay:i*0.08 }}>
              <div className="p-stat-val">{s.val}</div>
              <div className="p-stat-label">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ══════════════════════════════════
            RAILS — the actionable stuff, up top
        ══════════════════════════════════ */}
        {rails && (
          <div className="p-rails">
            <EventsRail events={rails.official} />
            <VenuesRail venues={rails.venues} />
            <GamesRail games={rails.games} />
          </div>
        )}

        {/* ══════════════════════════════════
            EDITORIAL — what we do
        ══════════════════════════════════ */}
        <div className="p-editorial">
          <motion.div className="p-editorial-left"
            initial={{ opacity:0, x:-32 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true, amount:0.4 }}
            transition={{ duration:0.7, ease:[0.22,1,0.36,1] }}>
            <p className="p-editorial-label">What is Khelamna</p>
            <h2 className="p-editorial-big">
              The court is open.<br />Someone&apos;s waiting<br />to play.
            </h2>
            <a href="/discover" style={{ display:"inline-flex", marginTop:8 }}>
              <motion.button className="btn-primary" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
                Find a game <ArrowRight size={16} />
              </motion.button>
            </a>
          </motion.div>
          <motion.div className="p-editorial-right"
            initial={{ opacity:0, x:32 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true, amount:0.4 }}
            transition={{ duration:0.7, delay:0.15, ease:[0.22,1,0.36,1] }}>
            <p className="p-editorial-label">How it works</p>
            <div style={{ display:"flex", flexDirection:"column", gap:"32px" }}>
              {[
                { n:"01", title:"Find your court",   desc:"Search by sport, time and neighbourhood. See who else is already in.",      icon:<Search size={20} color="#DE3163" /> },
                { n:"02", title:"Lock your slot",    desc:"Join with one tap, or host your own event and set the headcount.",          icon:<PlusCircle size={20} color="#FFC93C" /> },
                { n:"03", title:"Show up and play",  desc:"Cost splits automatically. Rate the game after. Build your record.",       icon:<Trophy size={20} color="#2E7D5B" /> },
              ].map((item) => (
                <motion.div key={item.n}
                  initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
                  transition={{ duration:0.5 }}
                  style={{ display:"flex", gap:"20px", alignItems:"flex-start" }}>
                  <div style={{ width:"40px", height:"40px", borderRadius:"10px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"6px" }}>
                      <span style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.15em", color:"rgba(255,255,255,0.35)" }}>{item.n}</span>
                      <span style={{ fontSize:"16px", fontWeight:700, color:"#fff", fontFamily:"'Bricolage Grotesque',sans-serif" }}>{item.title}</span>
                    </div>
                    <p style={{ fontSize:"14px", lineHeight:1.6, color:"rgba(255,255,255,0.5)" }}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ══════════════════════════════════
            SPORTS PANELS
        ══════════════════════════════════ */}
        <div id="sports">
          {SPORTS_PANELS.map((sp, i) => (
            <div key={sp.sport} className="p-panel" style={{ background: i % 2 === 0 ? "var(--ink)" : "var(--inkSoft)", borderTop:"1px solid var(--line, rgba(255,255,255,0.06))" }}>
              <div className="p-panel-bg">{sp.emoji}</div>
              <div className="p-panel-accent">{sp.emoji}</div>
              <div className="p-panel-content">
                <motion.p className="p-panel-num"
                  initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.4 }}
                  transition={{ duration:0.5 }}
                  style={{ color: sp.color }}>
                  {String(i+1).padStart(2,"0")} — {sp.label}
                </motion.p>
                <motion.h2 className="p-panel-title"
                  initial={{ opacity:0, y:32 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.4 }}
                  transition={{ duration:0.7, delay:0.1, ease:[0.22,1,0.36,1] }}
                  style={{ color: sp.color }}>
                  {sp.label}
                </motion.h2>
                <motion.p className="p-panel-desc"
                  initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.4 }}
                  transition={{ duration:0.6, delay:0.2 }}>
                  {sp.desc}
                </motion.p>
                <motion.div
                  initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.4 }}
                  transition={{ duration:0.5, delay:0.35 }}
                  style={{ display:"flex", gap:"12px", flexWrap:"wrap" as const }}>
                  <a href={`/discover?sport=${sp.sport}`}>
                    <motion.button className="btn-primary" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
                      style={{ background: sp.color, color: i === 2 ? "#000" : "#fff" }}>
                      Find {sp.sport} games <ArrowRight size={16} />
                    </motion.button>
                  </a>
                  <a href="/create">
                    <motion.button className="btn-ghost" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
                      Host a game
                    </motion.button>
                  </a>
                </motion.div>
              </div>

              {/* Game cards for this sport (real games + fact, or host prompt) */}
              <div className="p-games">
                {(gamesBySport[sp.sport] ?? []).slice(0, 3).map((g) => {
                  const pct = Math.round(((g.max_players - g.slots_remaining) / g.max_players) * 100);
                  const when = new Date(g.event_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });
                  return (
                    <a key={g.id} href="/discover" className="p-gcard link">
                      <div className="p-gcard-title">{g.title}</div>
                      <div className="p-gcard-venue"><MapPin size={12} /> {g.venue}</div>
                      <div className="p-gcard-row">
                        <span className="p-gcard-when">{when}</span>
                        <span className="p-gcard-fee" style={{ color: sp.color }}>Rs {g.fee}</span>
                      </div>
                      <div className="p-gcard-bar"><div style={{ height:"100%", width:`${pct}%`, background: sp.color, borderRadius:2 }} /></div>
                      <div className="p-gcard-slots">{g.slots_remaining} of {g.max_players} spots left</div>
                    </a>
                  );
                })}

                {/* Fact card — untouchable */}
                {SPORT_FACT[sp.sport] && (
                  <div className="p-gcard fact">
                    <div>
                      <div className="big" style={{ color: sp.color }}>{SPORT_FACT[sp.sport].big}</div>
                      <div className="small">{SPORT_FACT[sp.sport].small}</div>
                    </div>
                    <div style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"rgba(255,255,255,0.35)", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:14 }}>
                      {sp.label} · Kathmandu
                    </div>
                  </div>
                )}

                {/* Empty state — aesthetic host prompt */}
                {(gamesBySport[sp.sport] ?? []).length === 0 && (
                  <a href="/create" className="p-gcard host link" style={{ borderColor: `${sp.color}55` }}>
                    <div className="big" style={{ color: sp.color }}>No {sp.sport} games yet</div>
                    <div className="small">Be the first to host one. Book a court, set your spots, and let players come to you.</div>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:700, color: sp.color }}>
                      Host a {sp.sport} game <ArrowRight size={14} />
                    </span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════
            FEATURED MATCHES
        ══════════════════════════════════ */}
        <div style={{ padding:"100px 56px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <motion.div initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
            style={{ marginBottom:"48px", display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap" as const, gap:"16px" }}>
            <div>
              <p style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase" as const, color:"rgba(255,255,255,0.35)", marginBottom:"12px" }}>
                Live on Khelamna
              </p>
              <h2 style={{ fontSize:"clamp(32px,4vw,52px)", fontWeight:800, letterSpacing:"-2px", fontFamily:"'Bricolage Grotesque',sans-serif", lineHeight:1 }}>
                Matches near you
              </h2>
            </div>
            <a href="/discover">
              <motion.button className="btn-ghost" whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}>
                See all matches <ArrowRight size={16} />
              </motion.button>
            </a>
          </motion.div>

          <div className="p-match-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"20px" }}>
            {evLoading ? (
              Array.from({ length:3 }).map((_,i) => (
                <div key={i} style={{ background:"#111", borderRadius:"16px", height:"360px", opacity:0.4, animation:"pulse 1.5s ease-in-out infinite" }} />
              ))
            ) : featured.length === 0 ? (
              <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"64px", color:"rgba(255,255,255,0.35)" }}>
                <p style={{ fontSize:"18px", marginBottom:"16px" }}>No upcoming events yet.</p>
                <a href="/create" style={{ color:"#DE3163", fontWeight:700, textDecoration:"none", fontSize:"16px" }}>
                  Host the first one →
                </a>
              </div>
            ) : featured.map((ev, i) => {
              const color = ev.sport_color ?? SPORT_COLOR[ev.sport] ?? "#DE3163";
              const emo: Record<string,string> = { Futsal:"⚽", Football:"⚽", Basketball:"🏀", Cricket:"🏏", Volleyball:"🏐", Badminton:"🏸", Tennis:"🎾" };
              const pct = ev.max_players > 0 ? Math.round((ev.confirmed_count / ev.max_players) * 100) : 0;
              return (
                <motion.div key={ev.id} className="p-card"
                  initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
                  transition={{ duration:0.5, delay:i*0.1 }}
                  whileHover={{ y:-6, borderColor: color + "44" }}
                >
                  <div className="p-card-banner" style={{ background:`linear-gradient(135deg,${color}20,#000)` }}>
                    {ev.flash && (
                      <div style={{ position:"absolute", top:"12px", left:"12px", background:"#E85D24", color:"#fff", fontSize:"10px", fontWeight:800, padding:"4px 10px", borderRadius:"100px", display:"flex", alignItems:"center", gap:"4px", letterSpacing:"0.08em" }}>
                        <Zap size={9} fill="#fff" /> FLASH
                      </div>
                    )}
                    <span style={{ fontSize:"72px", lineHeight:1 }}>{emo[ev.sport] ?? "🏅"}</span>
                  </div>
                  <div className="p-card-body">
                    <p className="p-card-sport" style={{ color }}>{ev.sport.toUpperCase()}</p>
                    <h3 className="p-card-title">{ev.title}</h3>
                    <div className="p-card-meta">
                      <span style={{ display:"flex", alignItems:"center", gap:"5px" }}><MapPin size={11} />{ev.venue}</span>
                      <span style={{ display:"flex", alignItems:"center", gap:"5px" }}><Calendar size={11} />{new Date(ev.event_date).toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})} · {new Date(ev.event_date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                    <div className="p-fill-bar">
                      <motion.div initial={{ width:0 }} whileInView={{ width:`${pct}%` }} viewport={{ once:true }}
                        transition={{ duration:0.8 }}
                        style={{ height:"100%", background: pct>=90?"#ef4444":color, borderRadius:"2px" }} />
                    </div>
                    <div className="p-card-footer">
                      <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.4)", fontFamily:"'JetBrains Mono',monospace" }}>
                        {ev.confirmed_count}/{ev.max_players} joined · {ev.fee === 0 ? "Free" : `Rs. ${ev.fee}`}
                      </span>
                      <motion.button
                        whileHover={{ scale:1.06 }} whileTap={{ scale:0.96 }}
                        onClick={() => { if(!profile){ router.push("/login"); return; } void bookEvent(ev.id); }}
                        disabled={ev.slots_remaining === 0}
                        style={{ background: ev.slots_remaining===0?"rgba(255,255,255,0.08)":color, color: ev.slots_remaining===0?"rgba(255,255,255,0.3)":(color==="#FFC93C"?"#000":"#fff"), border:"none", padding:"9px 18px", borderRadius:"10px", fontSize:"13px", fontWeight:700, cursor: ev.slots_remaining===0?"default":"pointer", fontFamily:"'Inter',sans-serif" }}>
                        {ev.slots_remaining===0 ? "Full" : "Join"}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════
            FULL-BLEED CTA
        ══════════════════════════════════ */}
        <div style={{ position:"relative", overflow:"hidden", background:"#DE3163", borderTop:"1px solid rgba(255,255,255,0.08)" }}>
          {/* noise texture overlay */}
          <div style={{ position:"absolute", inset:0, backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")", backgroundSize:"200px", opacity:0.5, pointerEvents:"none" }} />
          <div className="p-cta-section">
            <div style={{ position:"relative", zIndex:1 }}>
              <motion.p
                initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
                style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase" as const, color:"rgba(255,255,255,0.6)", marginBottom:"20px" }}>
                Join Khelamna
              </motion.p>
              <motion.h2 className="p-cta-h2"
                initial={{ opacity:0, y:32 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
                transition={{ duration:0.8, delay:0.1, ease:[0.22,1,0.36,1] }}
                style={{ color:"#fff" }}>
                Your next game<br />starts here.
              </motion.h2>
              <motion.div
                initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }}
                transition={{ delay:0.3 }}
                style={{ display:"flex", gap:"14px", justifyContent:"center", flexWrap:"wrap" as const }}>
                <a href="/discover">
                  <motion.button className="btn-white" whileHover={{ scale:1.05, boxShadow:"0 16px 40px rgba(0,0,0,0.35)" }} whileTap={{ scale:0.97 }}
                    style={{ padding:"16px 36px", fontSize:"16px" }}>
                    Find a game <ArrowRight size={18} />
                  </motion.button>
                </a>
                <a href="/create">
                  <motion.button className="btn-ghost" whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
                    style={{ padding:"16px 36px", fontSize:"16px", borderColor:"rgba(255,255,255,0.3)" }}>
                    Host an event
                  </motion.button>
                </a>
              </motion.div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════
            FOOTER
        ══════════════════════════════════ */}
        <footer className="p-footer">
          <a href="/" style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:"2px" }}>
            <span style={{ fontSize:"18px", fontWeight:800, color:"#fff", fontFamily:"'Bricolage Grotesque',sans-serif" }}>Khelam</span>
            <span style={{ fontSize:"18px", fontWeight:800, color:"#F2EDE6", fontFamily:"'Bricolage Grotesque',sans-serif" }}> Na.</span>
          </a>
          <div style={{ display:"flex", gap:"32px", flexWrap:"wrap" as const }}>
            {[
              { label:"Discover", href:"/discover" },
              { label:"Host event", href:"/create" },
              { label:"League", href:"/league" },
              { label:"Sign in", href:"/login" },
              { label:"Admin", href:"/admin" },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ color:"rgba(255,255,255,0.4)", textDecoration:"none", fontSize:"13px", fontWeight:600, transition:"color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color="#fff")}
                onMouseLeave={e => (e.currentTarget.style.color="rgba(255,255,255,0.4)")}>
                {l.label}
              </a>
            ))}
          </div>
          <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.25)" }}>© Khelamna 2026</span>
        </footer>

      </div>
    </>
  );
}
