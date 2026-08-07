"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Users, Wallet, Clock, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { bookCourt } from "@/lib/admin/actions";
import { hostGameFromBooking } from "@/lib/play/actions";
import SlotPicker from "./SlotPicker";
import WeekStrip from "./WeekStrip";
import type { PricingRule } from "@/lib/play/pricing";
import { priceFor, offerLabel, whenLabel } from "@/lib/play/priceCalc";
import type { Court, CourtHours } from "@/lib/admin/types";

const KTM_TZ = "Asia/Kathmandu";

// Fixed +05:45 offset for Kathmandu (no DST). Accepts fractional hours.
function ktmIso(dateStr: string, hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:45`;
}
function todayKtm() {
  return new Date().toLocaleDateString("en-CA", { timeZone: KTM_TZ });
}
// Format a fractional hour (e.g. 19.5) as "19:30".
function fmtHM(hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Suggested squad sizes by sport — helps players fill their game.
// What kind of players the host wants. Plain language beats jargon —
// "anyone's welcome" tells a nervous beginner more than "Level 1".
const SKILL_OPTS = [
  { k: "any",          label: "Anyone",       hint: "All levels welcome — turn up and play." },
  { k: "beginner",     label: "Beginners",    hint: "New players welcome. Relaxed, no pressure." },
  { k: "intermediate", label: "Intermediate", hint: "You've played a fair bit. Competitive but friendly." },
  { k: "advanced",     label: "Advanced",     hint: "Strong players only. Fast, serious games." },
];

const SQUAD: Record<string, { label: string; total: number; positions: string[] }> = {
  Futsal:     { label: "5-a-side", total: 5, positions: ["Goalkeeper", "Defender", "Winger", "Pivot"] },
  Football:   { label: "7-a-side", total: 7, positions: ["Goalkeeper", "Defender", "Midfielder", "Striker"] },
  Basketball: { label: "5-a-side", total: 5, positions: ["Guard", "Forward", "Center"] },
  Cricket:    { label: "Team", total: 11, positions: ["Batter", "Bowler", "All-rounder", "Keeper"] },
  Volleyball: { label: "6-a-side", total: 6, positions: ["Setter", "Hitter", "Blocker", "Libero"] },
  Badminton:  { label: "Doubles", total: 2, positions: ["Partner"] },
  Tennis:     { label: "Doubles", total: 2, positions: ["Partner"] },
};

export default function BookingFlow({
  venueName, courts, hoursByCourt, initialDate, rules = [],
}: {
  venueName: string;
  courts: Court[];
  hoursByCourt: Record<string, CourtHours[]>;
  initialDate?: string;
  rules?: PricingRule[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(initialDate || todayKtm());
  const [hour, setHour] = useState<number | null>(null);
  const [duration, setDuration] = useState(1); // hours; 1, 1.5, 2, 3
  const [needPlayers, setNeedPlayers] = useState(false);
  const [spots, setSpots] = useState(4);
  const [skill, setSkill] = useState("any");
  const [bringGear, setBringGear] = useState(false);
  const [note, setNote] = useState("");
  const [pay, setPay] = useState<"khalti" | "esewa">("khalti");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0);   // 0 court · 1 when · 2 players · 3 confirm

  const court = courts.find((c) => c.id === courtId);
  const squad = court ? SQUAD[court.sport] : undefined;

  // Build the day's bookable hours from this court's opening hours.

  const hourly = court ? Number(court.base_price) : 0;
  const priced = priceFor(
    hourly, duration, rules, court?.id ?? "", dateStr,
    hour === null ? 0 : Math.round(hour * 60)
  );
  const price = priced.price;
  const perHead = needPlayers && spots > 0 ? Math.round(price / (spots + 1)) : price;

  function confirm() {
    if (!court || hour === null) { setErr("Pick a court and a time."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        // Real atomic booking.
        await bookCourt({
          court_id: court.id,
          venue_id: court.venue_id,
          starts_at: ktmIso(dateStr, hour),
          ends_at: ktmIso(dateStr, hour + duration),
          source: "platform",
        });

        // If they want players, open it as a game on /discover too.
        if (needPlayers) {
          await hostGameFromBooking({
            venue_id: court.venue_id,
            venue_name: venueName,
            sport: court.sport,
            court_name: court.name,
            starts_at: ktmIso(dateStr, hour),
            total_price: price,
            spots_needed: spots,
            skill_level: skill,
            bring_own_gear: bringGear,
            notes: note.trim() || undefined,
          });
        }

        setDone(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not book this slot.";
        // Not logged in? Send them to sign in, then back here to finish.
        if (msg.includes("UNAUTHORIZED")) {
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        setErr(msg);
      }
    });
  }

  if (done) {
    return (
      <div className="bk-panel bk-success">
        <div className="bk-success-mark"><Check size={30} color="#fff" /></div>
        <h3 style={{ fontSize: 22 }}>You&apos;re booked!</h3>
        <p className="hint" style={{ maxWidth: 360, margin: "8px auto 20px" }}>
          {court?.name} at {venueName}, {new Date(ktmIso(dateStr, hour ?? 0)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM_TZ })} at {fmtHM(hour ?? 0)} for {duration === 1 ? "1 hour" : `${duration} hours`}.
          {needPlayers && ` Your game is open — ${spots} spots for others to join.`}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="play-btn gold" onClick={() => router.push("/discover")}>See my games</button>
          <button className="play-btn ghost" onClick={() => { setDone(false); setHour(null); }}>Book another</button>
        </div>
      </div>
    );
  }

  if (courts.length === 0) {
    return (
      <div className="bk-panel">
        <h3>This venue hasn&apos;t added courts yet</h3>
        <p className="hint">The owner is still setting up. Check back soon, or explore other venues.</p>
      </div>
    );
  }

  // ── Step gating ────────────────────────────────────────────────
  const STEPS = ["Court", "When", "Players", "Confirm"];
  const canNext =
    step === 0 ? !!court :
    step === 1 ? hour !== null :
    true;

  function next() {
    if (!canNext) {
      setErr(step === 0 ? "Pick a court to continue." : "Pick a time to continue.");
      return;
    }
    setErr(null);
    setStep((v) => Math.min(3, v + 1));
  }
  function back() { setErr(null); setStep((v) => Math.max(0, v - 1)); }

  // Discounts a player can actually use, newest-best first.
  const offers = rules.filter(
    (r) => r.active && (r.kind === "discount_pct" || (r.kind === "multiplier" && Number(r.amount) < 1))
  );

  return (
    <div className="bkw">
      {offers.length > 0 && (
        <div className="bkw-offers">
          <p className="bkw-offers-t"><Tag size={13} /> Offers at {venueName}</p>
          <div className="bkw-offers-rail">
            {offers.map((o) => (
              <div key={o.id} className="bkw-offer">
                <span className="amt">{offerLabel(o)}</span>
                <span className="lbl">{o.label}</span>
                <span className="when">{whenLabel(o)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      <ol className="bkw-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "on" : i < step ? "done" : ""}>
            <button
              onClick={() => { if (i < step) { setErr(null); setStep(i); } }}
              disabled={i > step}
            >
              <span className="dot">{i < step ? <Check size={12} /> : i + 1}</span>
              <span className="lbl">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="bkw-body">
        {/* ── 1. Court ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className="bk-panel">
            <h3>Which court?</h3>
            <p className="hint">Each court has its own sport and hourly rate.</p>
            <div className="bk-chips">
              {courts.map((c) => (
                <button key={c.id} className={`bk-chip ${c.id === courtId ? "on" : ""}`}
                  onClick={() => { setCourtId(c.id); setHour(null); setErr(null); }}>
                  {c.name}
                  <small>{c.sport} · Rs {c.base_price}/hr</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. When ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bk-panel">
            <h3>When are you playing?</h3>
            <p className="hint">
              <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Live availability — slots already taken are hidden.
            </p>

            <WeekStrip
              courtId={court?.id ?? ""}
              durationMins={Math.round(duration * 60)}
              value={dateStr}
              onPick={(d) => { setDateStr(d); setHour(null); }}
            />

            <p className="hint" style={{ marginBottom: 10 }}>How long?</p>
            <div className="bk-chips" style={{ marginBottom: 22 }}>
              {[1, 1.5, 2, 3].map((d) => (
                <button key={d} className={`bk-chip ${duration === d ? "on" : ""}`}
                  onClick={() => { setDuration(d); setHour(null); }}>
                  {d === 1 ? "1 hour" : `${d} hours`}
                  <small>Rs {Math.round(hourly * d)}</small>
                </button>
              ))}
            </div>

            {court && (
              <SlotPicker
                courtId={court.id}
                dateStr={dateStr}
                durationMins={Math.round(duration * 60)}
                value={hour === null ? null : Math.round(hour * 60)}
                onPick={(mins) => { setHour(mins === null ? null : mins / 60); setErr(null); }}
              />
            )}
          </div>
        )}

        {/* ── 3. Players (optional) ────────────────────────────── */}
        {step === 2 && (
          <div className="bk-panel">
            <div className="bk-toggle" onClick={() => setNeedPlayers((v) => !v)}>
              <div className={`bk-switch ${needPlayers ? "on" : ""}`} />
              <div>
                <h3 style={{ margin: 0 }}>
                  <Users size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Need more players?
                </h3>
                <p className="hint" style={{ margin: "2px 0 0" }}>
                  Open your game so others can join and split the cost.
                </p>
              </div>
            </div>

            {!needPlayers && (
              <p className="hint" style={{ marginTop: 16 }}>
                Playing with your own crew? Skip this and go straight to confirming.
              </p>
            )}

            {needPlayers && (
              <div style={{ marginTop: 18 }}>
                {squad && (
                  <p className="hint" style={{ marginBottom: 12 }}>
                    {court?.sport} is usually <b style={{ color: "var(--paper)" }}>{squad.label}</b>. How many are you missing?
                  </p>
                )}
                <div className="bk-chips">
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <button key={n} className={`bk-chip ${spots === n ? "on" : ""}`} onClick={() => setSpots(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="bk-split" style={{ marginTop: 16 }}>
                  Split between you + {spots} others → <b>Rs {perHead}</b> each instead of Rs {price}.
                </div>

                <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                  <p className="hint" style={{ marginBottom: 10 }}>Who are you looking for?</p>
                  <div className="bk-chips">
                    {SKILL_OPTS.map((sk) => (
                      <button key={sk.k} className={`bk-chip ${skill === sk.k ? "on" : ""}`}
                        onClick={() => setSkill(sk.k)} title={sk.hint}>
                        {sk.label}
                      </button>
                    ))}
                  </div>
                  <p className="hint" style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                    {SKILL_OPTS.find((sk) => sk.k === skill)?.hint}
                  </p>

                  <div className="bk-toggle" style={{ marginTop: 18 }} onClick={() => setBringGear((v) => !v)}>
                    <div className={`bk-switch ${bringGear ? "on" : ""}`} />
                    <div>
                      <b>Bring your own gear</b>
                      <p className="hint" style={{ margin: "2px 0 0" }}>
                        {bringGear ? "Players bring their own kit." : "Gear is provided or shared."}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <p className="hint" style={{ marginBottom: 8 }}>Anything they should know? (optional)</p>
                    <textarea className="bk-note" rows={2} value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Turf shoes only · 40-min halves · park on the side street" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 4. Confirm ───────────────────────────────────────── */}
        {step === 3 && (
          <div className="bk-panel">
            <h3>Check and confirm</h3>
            <p className="hint">{venueName}</p>

            <div className="bk-sum-row"><span className="lbl">Court</span><span className="val">{court?.name ?? "—"}</span></div>
            <div className="bk-sum-row"><span className="lbl">Sport</span><span className="val">{court?.sport ?? "—"}</span></div>
            <div className="bk-sum-row"><span className="lbl">Date</span><span className="val">
              {new Date(ktmIso(dateStr, hour ?? 0)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM_TZ })}
            </span></div>
            <div className="bk-sum-row"><span className="lbl">Time</span><span className="val">{hour !== null ? `${fmtHM(hour)}–${fmtHM(hour + duration)}` : "—"}</span></div>
            <div className="bk-sum-row"><span className="lbl">Duration</span><span className="val">{duration === 1 ? "1 hour" : `${duration} hours`}</span></div>
            {needPlayers && (
              <div className="bk-sum-row"><span className="lbl">Open spots</span><span className="val">{spots}</span></div>
            )}
            {priced.rule && (
              <div className="bk-sum-row">
                <span className="lbl">{priced.saved > 0 ? "Offer applied" : "Peak rate"}</span>
                <span className="val" style={{ color: priced.saved > 0 ? "#006241" : "#5f756d" }}>
                  {priced.rule.label} · {offerLabel(priced.rule)}
                </span>
              </div>
            )}
            <div className="bk-sum-row bk-sum-total">
              <span className="lbl">{needPlayers ? "Your share" : "Total"}</span>
              <span className="val">
                {priced.saved > 0 && (
                  <s style={{ opacity: .45, marginRight: 8, fontWeight: 500 }}>Rs {priced.base}</s>
                )}
                Rs {needPlayers ? perHead : price}
              </span>
            </div>

            {needPlayers && (
              <div className="bk-split">The other Rs {price - perHead} is covered as {spots} players join.</div>
            )}

            <div style={{ marginTop: 18 }}>
              <p className="hint" style={{ marginBottom: 8 }}>
                <Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Pay with<span className="bk-mock-tag">demo</span>
              </p>
              <div className="bk-pay-row">
                <button className={`bk-pay ${pay === "khalti" ? "on" : ""}`} onClick={() => setPay("khalti")}>Khalti</button>
                <button className={`bk-pay ${pay === "esewa" ? "on" : ""}`} onClick={() => setPay("esewa")}>eSewa</button>
              </div>
            </div>

            <p className="hint" style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0 }}>
              Payment is simulated in this preview. Real Khalti/eSewa comes next.
            </p>
          </div>
        )}

        {err && <div className="bkw-err">{err}</div>}
      </div>

      {/* ── Sticky footer: price + navigation ──────────────────── */}
      <div className="bkw-bar">
        <div className="bkw-price">
          <span className="lbl">{needPlayers ? "Your share" : "Total"}</span>
          <span className="val">
            {priced.saved > 0 && <s>Rs {priced.base}</s>}
            Rs {needPlayers ? perHead : price}
          </span>
          {hour !== null && (
            <span className="sub">{fmtHM(hour)}–{fmtHM(hour + duration)} · {court?.name}</span>
          )}
        </div>
        <div className="bkw-nav">
          {step > 0 && (
            <button className="play-btn ghost" onClick={back}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
          {step < 3 ? (
            <button className="play-btn gold" onClick={next} disabled={!canNext}>
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button className="play-btn gold" onClick={confirm} disabled={pending || hour === null}>
              {pending ? "Booking…" : `Pay Rs ${needPlayers ? perHead : price} & book`}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .bkw { max-width: 760px; margin: 0 auto; padding-bottom: 110px; }

        .bkw-offers { margin-bottom: 22px; }
        .bkw-offers-t {
          display: flex; align-items: center; gap: 6px; margin: 0 0 10px;
          font-size: 11px; font-weight: 800; letter-spacing: .14em;
          text-transform: uppercase; color: #2E7D5B;
        }
        .bkw-offers-rail { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
        .bkw-offers-rail::-webkit-scrollbar { height: 0; }
        .bkw-offer {
          flex: 0 0 auto; min-width: 168px;
          display: flex; flex-direction: column; gap: 2px;
          padding: 13px 15px; border-radius: 14px;
          border: 1px dashed rgba(46,125,91,.5);
          background: linear-gradient(150deg, rgba(46,125,91,.16), rgba(46,125,91,.04));
        }
        .bkw-offer .amt {
          font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 800;
          letter-spacing: -.5px; color: #4ADE80;
        }
        .bkw-offer .lbl { font-size: 12.5px; font-weight: 700; }
        .bkw-offer .when { font-size: 11px; opacity: .6; }
        .bkw-price .val s { opacity: .45; font-weight: 500; margin-right: 7px; font-size: 15px; }

        .bkw-steps {
          display: flex; align-items: center; gap: 6px;
          list-style: none; margin: 0 0 22px; padding: 0;
        }
        .bkw-steps li { flex: 1; }
        .bkw-steps button {
          width: 100%; display: flex; align-items: center; gap: 8px;
          background: none; border: none; cursor: pointer; padding: 0;
          font-family: inherit; color: inherit; opacity: .4;
        }
        .bkw-steps li.on button, .bkw-steps li.done button { opacity: 1; }
        .bkw-steps button:disabled { cursor: default; }
        .bkw-steps .dot {
          width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800;
          border: 1px solid var(--line); background: transparent;
        }
        .bkw-steps li.on .dot { background: #006241; border-color: #006241; color: #ffffff; }
        .bkw-steps li.done .dot { background: #2E7D5B; border-color: #2E7D5B; color: #fff; }
        .bkw-steps .lbl { font-size: 12.5px; font-weight: 700; white-space: nowrap; }
        @media (max-width: 560px) { .bkw-steps .lbl { display: none; } }

        .bkw-body { min-height: 260px; }
        .bkw-err { color: var(--pink); font-size: 13px; margin-top: 12px; }

        /* The dock lives at the bottom too — stand it down while a
           booking is in progress so the two never collide. */
        body:has(.bkw-bar) .dock { display: none !important; }

        .bkw-bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 340;
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 14px clamp(16px, 5vw, 40px) calc(14px + env(safe-area-inset-bottom, 0px));
          background: rgba(11,13,17,0.92); backdrop-filter: blur(16px);
          border-top: 1px solid var(--line);
        }
        [data-theme="paper"] .bkw-bar { background: rgba(248,245,240,0.94); }
        .bkw-price { display: flex; flex-direction: column; line-height: 1.25; }
        .bkw-price .lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .5; }
        .bkw-price .val { font-family: 'JetBrains Mono', monospace; font-size: 19px; font-weight: 700; }
        .bkw-price .sub { font-size: 11.5px; opacity: .55; }
        .bkw-nav { display: flex; gap: 8px; }
        @media (max-width: 480px) {
          .bkw-price .sub { display: none; }
          .bkw-nav .play-btn { padding: 11px 16px; font-size: 13.5px; }
        }
      `}</style>
    </div>
  );
}
