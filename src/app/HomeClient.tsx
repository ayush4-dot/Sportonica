"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { MapPin, ArrowRight, ChevronDown } from "lucide-react";
import { EventsRail, VenuesRail, GamesRail } from "@/components/home/Rails";
import "@/components/home/rails.css";
import type { getHomeRails } from "@/lib/play/homeRails";
import SiteNav from "@/components/layout/SiteNav";
import { useCity, inCity } from "@/lib/city";

type HomeRails = Awaited<ReturnType<typeof getHomeRails>>;

const SPORTS_PANELS = [
  { sport:"Futsal",     label:"FUTSAL",     color:"#2E7D5B", emoji:"⚽", desc:"Book floodlit courts by the hour. Kathmandu's favourite night game." },
  { sport:"Cricket",    label:"CRICKET",    color:"#f97316", emoji:"🏏", desc:"Weekend box cricket cups, pitch bookings, and tournaments." },
  { sport:"Basketball", label:"BASKETBALL", color:"#006241", emoji:"🏀", desc:"Find courts, join runs, and compete in 3-on-3 leagues." },
  { sport:"Volleyball", label:"VOLLEYBALL", color:"#3b82f6", emoji:"🏐", desc:"Co-ed games, beach courts, and organised leagues." },
  { sport:"Badminton",  label:"BADMINTON",  color:"#006241", emoji:"🏸", desc:"Indoor halls, coaching sessions, and weekly round-robins." },
  { sport:"Pickleball", label:"PICKLEBALL", color:"#84cc16", emoji:"🥒", desc:"The fastest-growing game in town. Easy to learn, hard to stop." },
  { sport:"Swimming",   label:"SWIMMING",   color:"#06b6d4", emoji:"🏊", desc:"Lane bookings, early-morning laps, and coached sessions." },
];

const STATS = [
  { value:"1,200+", label:"Players" },
  { value:"500+",   label:"Games" },
  { value:"30+",    label:"Venues" },
  { value:"9",      label:"Sports" },
];

// Written for the person who's about to close the tab: real objections,
// answered plainly, right before the final CTA — and marked up as
// FAQPage structured data so Google can surface it as a rich result.
const FAQS = [
  {
    q: "Is Khelam Na free to use?",
    a: "Finding and joining pickup games is completely free. Booking a court only costs the venue's hourly rate, split automatically between everyone in the game — Khelam Na doesn't add booking fees on top.",
  },
  {
    q: "What sports can I play on Khelam Na?",
    a: "Futsal, cricket, basketball, volleyball, badminton, pickleball, swimming and running, with more added as venues sign up. Browse by sport on the Play page to see what's live near you today.",
  },
  {
    q: "How do I book a futsal court or ground?",
    a: "Go to Book, pick a sport, date and location, then choose from verified grounds with live hourly availability. You don't need a full squad — open your booking to the city and other players can fill the empty spots.",
  },
  {
    q: "Is it safe to play with people I don't know?",
    a: "Every player builds a trust score from how reliably they show up, and you can see who's joining before you commit. Payment happens through the app and is held in escrow until the game is actually played, never released upfront.",
  },
  {
    q: "How do payments and refunds work?",
    a: "Pay with Khalti, eSewa, FonePay or bank transfer. Your money sits in escrow and only reaches the host or venue after the game happens — if it's cancelled, you're covered.",
  },
  {
    q: "Which cities does Khelam Na cover?",
    a: "We started in Kathmandu and have since expanded across the valley to Lalitpur and Bhaktapur, plus Pokhara, Bharatpur, Biratnagar and other cities around Nepal. Set your city from the location picker to see what's live there.",
  },
];

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; }

  /* ── hero ── */
  .p-hero { position:relative; min-height:auto; overflow:visible; display:flex; align-items:center; padding:52px 0 40px; }
  .p-hero-content { position:relative; z-index:2; padding:0 clamp(24px,5vw,56px); width:100%; }
  /* The dock is fixed to the right rail — keep content clear of it. */
  @media (min-width:781px) {
    .p-hero-content,
    .p-sportbar,
    .p-footer { padding-right:clamp(104px,9vw,132px); }
  }

  /* Editorial split: the headline holds the left, the read-in and
     figures sit to the right, both sharing a baseline. */
  .p-hero-top {
    display:flex; align-items:flex-end; justify-content:space-between;
    gap:clamp(24px,5vw,64px); margin-bottom:clamp(28px,4vw,44px);
    padding-bottom:22px; border-bottom:1px solid rgba(255,255,255,0.1);
  }
  .p-hero-lead { flex:0 1 auto; }
  .p-hero-aside { flex:0 0 auto; display:flex; align-items:center; padding-bottom:6px; }

  /* A single, deliberate call to action. */
  .p-book {
    position:relative; overflow:hidden; cursor:pointer;
    border:none; border-radius:999px; padding:0;
    background:linear-gradient(140deg,#d4e9e2 0%,#006241 46%,#004a31 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.75),
      0 14px 34px -12px rgba(0,98,65,.75);
    transition:transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s;
    font-family:'Inter',sans-serif;
  }
  .p-book:hover {
    transform:translateY(-3px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.85),
      0 22px 46px -14px rgba(0,98,65,.95);
  }
  .p-book:active { transform:translateY(-1px); }

  .p-book-in {
    position:relative; z-index:2;
    display:flex; align-items:center; gap:13px;
    padding:13px 15px 13px 20px; color:#ffffff;
  }
  .p-book-txt { display:flex; flex-direction:column; align-items:flex-start; line-height:1.15; }
  .p-book-txt b { font-size:15.5px; font-weight:800; letter-spacing:-.2px; }
  .p-book-txt small { font-size:11.5px; font-weight:600; opacity:.62; }

  .p-book-go {
    width:34px; height:34px; border-radius:999px; flex-shrink:0;
    display:inline-flex; align-items:center; justify-content:center;
    background:#14171E; color:#006241;
    transition:transform .3s cubic-bezier(.22,1,.36,1);
  }
  .p-book:hover .p-book-go { transform:translateX(3px); }

  /* light travelling across the face */
  .p-book-sheen {
    position:absolute; top:0; bottom:0; width:38%; z-index:1;
    background:linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent);
    animation:pSheen 3.6s ease-in-out infinite;
  }
  @keyframes pSheen {
    0%   { left:-45%; }
    58%  { left:112%; }
    100% { left:112%; }
  }
  @media (prefers-reduced-motion: reduce) { .p-book-sheen { display:none; } }


  @media (max-width:900px) {
    .p-hero-top { flex-direction:column; align-items:flex-start; gap:14px; padding-bottom:16px; }
  }
  .p-hero-h1 { font-size:clamp(46px,6.4vw,86px); font-weight:800; line-height:0.9; letter-spacing:-3px; color:#fff; font-family:'Inter',sans-serif; margin:0; }
  .p-hero-h1 em { font-style:normal; color:#006241; }
  [data-theme="paper"] .p-hero-h1 { color:#14171E; }

  /* Phones: keep the CTA beside the headline instead of stacking it in
     its own row (which used to leave a slab of empty vertical space
     under a full-width button) — shrink both just enough to sit flush. */
  @media (max-width:560px) {
    .p-hero-h1 { font-size:clamp(30px,10.5vw,44px); letter-spacing:-1.4px; }
    .p-hero-top { gap:10px; }
    .p-hero-aside { flex:0 1 auto; min-width:0; }
    .p-book-in { padding:10px 12px 10px 14px; gap:8px; }
    .p-book-txt b { font-size:13px; }
    .p-book-txt small { font-size:9px; white-space:nowrap; }
    .p-book-go { width:26px; height:26px; }
  }
  .p-hero-ctas { display:flex; gap:14px; flex-wrap:wrap; }
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

  /* ── sport slider (Playo-style clickable rail) ── */
  .p-sportbar { padding:56px clamp(24px,5vw,56px) 8px; }
  .p-sportbar-head { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:16px; gap:16px; flex-wrap:wrap; }
  .p-sportbar-eyebrow { font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:12px; }
  .p-sportbar-title { font-size:clamp(38px,5.5vw,68px); font-weight:800; letter-spacing:-2.5px; font-family:'Inter',sans-serif; line-height:0.95; color:#ffffff; }
  .p-sportbar-hint { font-size:11px; font-weight:700; letter-spacing:0.15em; text-transform:uppercase; color:rgba(255,255,255,0.5); display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .p-sportrail { display:flex; gap:14px; overflow-x:auto; padding:4px 0 20px; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; }
  .p-sportrail::-webkit-scrollbar { height:0; }
  .p-sportchip {
    flex:0 0 auto; width:150px; height:190px; position:relative;
    border-radius:18px; overflow:hidden; cursor:pointer; padding:0;
    border:1px solid rgba(255,255,255,0.1); background:#111;
    scroll-snap-align:start; text-decoration:none; display:block;
    transition:transform 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s;
  }
  .p-sportchip:hover { transform:translateY(-6px); border-color:rgba(255,255,255,0.3); }
  .p-sportchip-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .p-sportchip-tint { position:absolute; inset:0; }
  .p-sportchip-shade { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.4) 100%); }
  .p-sportchip-emoji { position:absolute; top:14px; left:14px; font-size:26px; line-height:1; z-index:1; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }
  .p-sportchip-label { position:absolute; left:14px; bottom:34px; right:14px; z-index:1; color:#fff; font-size:18px; font-weight:800; font-family:'Inter',sans-serif; letter-spacing:-0.5px; line-height:1.05; }
  .p-sportchip-cta { position:absolute; left:14px; bottom:13px; z-index:1; font-size:11px; font-weight:700; display:flex; align-items:center; gap:5px; }
  [data-theme="paper"] .p-sportbar-title { color:#14171E; }
  [data-theme="paper"] .p-sportbar-eyebrow { color:rgba(20,23,30,0.6); }
  [data-theme="paper"] .p-sportbar-hint { color:rgba(20,23,30,0.55); }
  [data-theme="paper"] .p-sportchip { border-color:rgba(20,23,30,0.12); }
  [data-theme="paper"] .p-sportchip:hover { border-color:rgba(20,23,30,0.3); }
  @media (max-width:900px){
    .p-sportbar { padding:44px clamp(24px,5vw,56px) 4px; }
    .p-sportchip { width:130px; height:166px; }
    .p-sportchip-label { font-size:16px; }
  }

  /* ── editorial grid ── */
  .p-editorial { display:grid; grid-template-columns:1fr 1fr; min-height:100vh; }
  .p-editorial-left { display:flex; flex-direction:column; justify-content:center; padding:80px 64px; border-right:1px solid rgba(255,255,255,0.08); }
  .p-editorial-right { display:flex; flex-direction:column; justify-content:center; padding:80px 64px; }
  .p-editorial-label { font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; opacity:0.55; margin-bottom:24px; }
  .p-editorial-big { font-size:clamp(36px,5vw,64px); font-weight:800; line-height:1.0; letter-spacing:-2px; font-family:'Inter',sans-serif; margin-bottom:24px; }
  .p-editorial-body { font-size:17px; line-height:1.7; color:rgba(255,255,255,0.6); max-width:480px; }

  /* ── stat strip ── */
  .p-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid rgba(255,255,255,0.08); border-bottom:1px solid rgba(255,255,255,0.08); }
  .p-stat { padding:48px 40px; border-right:1px solid rgba(255,255,255,0.08); }
  .p-stat:last-child { border-right:none; }
  .p-stat-val { font-size:clamp(36px,4vw,56px); font-weight:800; letter-spacing:-2px; font-family:'Inter',sans-serif; color:#006241; line-height:1; margin-bottom:8px; }
  .p-stat-label { font-size:12px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); }

  /* ── FAQ section ── */
  .p-faq-section { max-width:900px; margin:0 auto; padding:100px 24px; }
  .p-faq-head { text-align:center; margin-bottom:48px; }
  .p-faq-eyebrow { font-size:11px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:12px; }
  .p-faq-h2 { font-size:clamp(32px,4.5vw,52px); font-weight:800; letter-spacing:-1.5px; font-family:'Inter',sans-serif; line-height:1; color:#ffffff; }
  [data-theme="paper"] .p-faq-eyebrow { color:rgba(20,23,30,0.6); }
  [data-theme="paper"] .p-faq-h2 { color:#14171E; }

  .p-faq-list { display:flex; flex-direction:column; }
  .p-faq-item { border-bottom:1px solid var(--border-line, rgba(255,255,255,0.1)); }
  .p-faq-item:first-child { border-top:1px solid var(--border-line, rgba(255,255,255,0.1)); }
  .p-faq-q {
    width:100%; display:flex; align-items:center; justify-content:space-between; gap:20px;
    background:none; border:none; cursor:pointer; text-align:left;
    padding:22px 4px; font-family:'Inter',sans-serif; font-size:17px; font-weight:700;
    color:var(--chalk); transition:color 0.2s;
  }
  .p-faq-item.on .p-faq-q { color:#006241; }
  .p-faq-chev { flex-shrink:0; opacity:0.5; transition:transform 0.25s ease; }
  .p-faq-item.on .p-faq-chev { transform:rotate(180deg); opacity:1; }
  .p-faq-a { padding:0 32px 24px 4px; font-size:15px; line-height:1.65; color:var(--muted); overflow:hidden; }

  /* ── footer ── */
  .p-footer { border-top:1px solid var(--border-line, rgba(255,255,255,0.08)); padding:40px clamp(24px,5vw,56px); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }

  /* ── buttons ── */
  .btn-primary { background:#006241; color:#fff; border:none; padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; letter-spacing:-0.01em; }
  .btn-ghost { background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.15); padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; backdrop-filter:blur(8px); }
  .btn-white { background:#fff; color:#000; border:none; padding:14px 28px; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; }

  /* ── mobile ── */
  @media(max-width:900px){
    .p-hero-h1 { letter-spacing:-1.5px; }
    .p-editorial { grid-template-columns:1fr; }
    .p-editorial-left { border-right:none; border-bottom:1px solid rgba(255,255,255,0.08); padding:56px 24px; }
    .p-editorial-right { padding:56px 24px; }
    .p-stats { grid-template-columns:repeat(2,1fr); }
    .p-stat { border-right:none; border-bottom:1px solid rgba(255,255,255,0.08); }
    .p-stat:nth-child(odd) { border-right:1px solid rgba(255,255,255,0.08); }
    .p-stat:last-child { border-bottom:none; }
    .p-faq-section { padding:64px 20px; }
    .p-faq-q { font-size:15.5px; padding:18px 2px; }
    .p-faq-a { padding:0 24px 20px 2px; font-size:14px; }
    .p-footer { padding:32px clamp(24px,5vw,56px); }
  }

  /* ══ Paper theme — flip the homepage's dark class styles ══ */
  [data-theme="paper"] .p-editorial-body { color: rgba(20,23,30,0.65); }
  [data-theme="paper"] .btn-ghost { color: #14171E; border-color: rgba(20,23,30,0.25); }
`;

const SPORT_IMG: Record<string, string> = {
  Futsal:     "/sports/futsal.jpg",
  Cricket:    "/sports/cricket.jpg",
  Basketball: "/sports/basketball.jpg",
  Volleyball: "/sports/volleyball.jpg",
  Badminton:  "/sports/badminton.jpg",
  Pickleball: "/sports/running.jpg",
  Swimming:   "/sports/running.jpg",
};

export default function HomeClient({ rails }: { rails?: HomeRails }) {
  const router = useRouter();
  const supabase = createClient();
  const { city, area } = useCity();
  const heroRef = useRef<HTMLDivElement>(null);

  // Which FAQ item is expanded. 0 = first question open by default, so
  // the section doesn't read as an empty wall of collapsed bars.
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{CSS}</style>

      <div style={{ background:"var(--ink)", color:"var(--chalk)", fontFamily:"'Inter',sans-serif" }}>

        {/* ══════════════════════════════════
            HERO — full-viewport video
        ══════════════════════════════════ */}
        <div className="p-hero" ref={heroRef}>
          <div className="p-hero-content">
            <div className="p-hero-top">
              <div className="p-hero-lead">
                <h1 className="p-hero-h1">
                  Find.<br />Book.<br /><em>Play.</em>
                </h1>
              </div>

              <div className="p-hero-aside">
                <button className="p-book"
                  onClick={() => window.dispatchEvent(new Event("open-nearby"))}>
                  <span className="p-book-sheen" />
                  <span className="p-book-in">
                    <MapPin size={16} />
                    <span className="p-book-txt">
                      <b>Book now</b>
                      <small>Grounds near you</small>
                    </span>
                    <span className="p-book-go"><ArrowRight size={16} /></span>
                  </span>
                </button>
              </div>
            </div>

            {/* Browse by sport — moved up from further down the page so it's
                the first thing people act on, right under the hero copy. */}
            <div id="sports">
              <div className="p-sportbar">
                <div className="p-sportbar-head">
                  <div>
                    <p className="p-sportbar-eyebrow">Browse by sport</p>
                    <h2 className="p-sportbar-title">Pick your game</h2>
                  </div>
                  <span className="p-sportbar-hint"><ArrowRight size={13} /> Swipe</span>
                </div>

                <div className="p-sportrail">
                  {/* Each card is a direct shortcut into Book, pre-filtered
                      to that sport — no intermediate detail view. */}
                  {SPORTS_PANELS.map((sp) => (
                    <Link
                      key={sp.sport}
                      href={`/create?sport=${encodeURIComponent(sp.sport)}`}
                      className="p-sportchip"
                      aria-label={`Book ${sp.sport} grounds`}
                    >
                      <img className="p-sportchip-img" src={SPORT_IMG[sp.sport]} alt="" loading="lazy" />
                      <span className="p-sportchip-tint" style={{ background:`${sp.color}22` }} />
                      <span className="p-sportchip-shade" />
                      <span className="p-sportchip-emoji">{sp.emoji}</span>
                      <span className="p-sportchip-label">{sp.sport}</span>
                      <span className="p-sportchip-cta" style={{ color: "rgba(255,255,255,0.9)" }}>
                        Book grounds <ArrowRight size={12} color={sp.color} strokeWidth={3} />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════
            RAILS — the actionable stuff, up top
        ══════════════════════════════════ */}
        {rails && (
          <div className="p-rails">
            <EventsRail events={rails.official} />
            <VenuesRail venues={rails.venues.filter((v) => inCity(v.lat, v.lng, city, area))} />
            <GamesRail games={rails.games} />
          </div>
        )}

        {/* ══════════════════════════════════
            FAQ — objections answered right before the ask.
        ══════════════════════════════════ */}
        <div className="p-faq-section">
          <div className="p-faq-head">
            <p className="p-faq-eyebrow">Questions</p>
            <h2 className="p-faq-h2">Before you jump in.</h2>
          </div>
          <div className="p-faq-list">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className={`p-faq-item ${open ? "on" : ""}`}>
                  <button
                    className="p-faq-q"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span>{f.q}</span>
                    <ChevronDown size={18} className="p-faq-chev" />
                  </button>
                  {open && (
                    <motion.p
                      className="p-faq-a"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {f.a}
                    </motion.p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Structured data so search engines can show these as a rich
            FAQ result directly on the results page. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />

        {/* ══════════════════════════════════
            FOOTER
        ══════════════════════════════════ */}
        <footer className="p-footer">
          <a href="/" style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:"2px" }}>
            <span style={{ fontSize:"18px", fontWeight:800, color:"var(--chalk)", fontFamily:"'Inter',sans-serif" }}>Khelam</span>
            <span style={{ fontSize:"18px", fontWeight:800, color:"#006241", fontFamily:"'Inter',sans-serif" }}> Na.</span>
          </a>
          <div style={{ display:"flex", gap:"32px", flexWrap:"wrap" as const }}>
            {[
              { label:"Play", href:"/discover" },
              { label:"Host event", href:"/create" },
              { label:"Chat", href:"/league" },
              { label:"Sign in", href:"/login" },
              { label:"Admin", href:"/admin" },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ color:"var(--muted)", textDecoration:"none", fontSize:"13px", fontWeight:600, transition:"color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color="var(--chalk)")}
                onMouseLeave={e => (e.currentTarget.style.color="var(--muted)")}>
                {l.label}
              </a>
            ))}
          </div>
          <span style={{ fontSize:"12px", color:"var(--faint)" }}>© Khelamna 2026</span>
        </footer>

      </div>
    </>
  );
}
