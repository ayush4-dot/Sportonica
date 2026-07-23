"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Users, Wallet, Clock } from "lucide-react";
import { bookCourt } from "@/lib/admin/actions";
import { hostGameFromBooking } from "@/lib/play/actions";
import SlotPicker from "./SlotPicker";
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
  venueName, courts, hoursByCourt,
}: { venueName: string; courts: Court[]; hoursByCourt: Record<string, CourtHours[]> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(todayKtm());
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

  const court = courts.find((c) => c.id === courtId);
  const squad = court ? SQUAD[court.sport] : undefined;

  // Build the day's bookable hours from this court's opening hours.

  const hourly = court ? Number(court.base_price) : 0;
  const price = Math.round(hourly * duration);
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

  return (
    <div className="bk-layout">
      <div>
        {/* Court picker */}
        <div className="bk-panel">
          <h3>Choose a court</h3>
          <p className="hint">Each court has its own sport and price.</p>
          <div className="bk-chips">
            {courts.map((c) => (
              <button key={c.id} className={`bk-chip ${c.id === courtId ? "on" : ""}`}
                onClick={() => { setCourtId(c.id); setHour(null); }}>
                {c.name}
                <small>{c.sport} · Rs {c.base_price}/hr</small>
              </button>
            ))}
          </div>
        </div>

        {/* Date + time */}
        <div className="bk-panel">
          <h3>Pick your slot</h3>
          <p className="hint">
            <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Live availability from the venue&apos;s opening hours — taken slots are hidden.
          </p>

          <input
            type="date" value={dateStr} min={todayKtm()}
            onChange={(e) => { setDateStr(e.target.value); setHour(null); }}
            style={{
              background: "var(--ink)", border: "1px solid var(--line)", color: "var(--paper)",
              borderRadius: 11, padding: "11px 14px", fontFamily: "'JetBrains Mono',monospace",
              fontSize: 14, marginBottom: 20, width: 190,
            }}
          />

          {/* Duration first — it decides which start times can actually fit. */}
          <p className="hint" style={{ marginBottom: 10 }}>How long are you playing?</p>
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
              onPick={(mins) => setHour(mins === null ? null : mins / 60)}
            />
          )}
        </div>

        {/* Needs players */}
        <div className="bk-panel">
          <div className="bk-toggle" onClick={() => setNeedPlayers((v) => !v)}>
            <div className={`bk-switch ${needPlayers ? "on" : ""}`} />
            <div>
              <h3 style={{ margin: 0 }}><Users size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Need more players?</h3>
              <p className="hint" style={{ margin: "2px 0 0" }}>Open your game so others can join and split the cost.</p>
            </div>
          </div>

          {needPlayers && (
            <div style={{ marginTop: 8 }}>
              {squad && (
                <p className="hint" style={{ marginBottom: 12 }}>
                  {court?.sport} is usually <b style={{ color: "var(--paper)" }}>{squad.label}</b>. How many players are you missing?
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

              {/* Who this game is for — set expectations so the right
                  people turn up and nobody feels out of their depth. */}
              <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                <p className="hint" style={{ marginBottom: 10 }}>Who are you looking for?</p>
                <div className="bk-chips">
                  {SKILL_OPTS.map((s) => (
                    <button key={s.k} className={`bk-chip ${skill === s.k ? "on" : ""}`}
                      onClick={() => setSkill(s.k)} title={s.hint}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                  {SKILL_OPTS.find((s) => s.k === skill)?.hint}
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
                  <textarea
                    className="bk-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Turf shoes only · we play 40-min halves · park on the side street"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky checkout */}
      <div className="bk-summary">
        <div className="bk-panel">
          <h3>Your booking</h3>
          <p className="hint">{venueName}</p>

          <div className="bk-sum-row"><span className="lbl">Court</span><span className="val">{court?.name ?? "—"}</span></div>
          <div className="bk-sum-row"><span className="lbl">Sport</span><span className="val">{court?.sport ?? "—"}</span></div>
          <div className="bk-sum-row"><span className="lbl">Time</span><span className="val">{hour !== null ? `${fmtHM(hour)}–${fmtHM(hour + duration)}` : "—"}</span></div>
          <div className="bk-sum-row"><span className="lbl">Duration</span><span className="val">{duration === 1 ? "1 hour" : `${duration} hours`}</span></div>
          <div className="bk-sum-row bk-sum-total"><span className="lbl">{needPlayers ? "Your share" : "Total"}</span><span className="val">Rs {needPlayers ? perHead : price}</span></div>

          {needPlayers && (
            <div className="bk-split">The other Rs {price - perHead} is covered as {spots} players join.</div>
          )}

          {/* Payment method (mocked) */}
          <div style={{ marginTop: 18 }}>
            <p className="hint" style={{ marginBottom: 8 }}><Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Pay with<span className="bk-mock-tag">demo</span></p>
            <div className="bk-pay-row">
              <button className={`bk-pay ${pay === "khalti" ? "on" : ""}`} onClick={() => setPay("khalti")}>Khalti</button>
              <button className={`bk-pay ${pay === "esewa" ? "on" : ""}`} onClick={() => setPay("esewa")}>eSewa</button>
            </div>
          </div>

          {err && <div style={{ color: "var(--pink)", fontSize: 13, margin: "6px 0" }}>{err}</div>}

          <button className="play-btn gold" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
            onClick={confirm} disabled={pending || hour === null}>
            {pending ? "Booking…" : `Pay Rs ${needPlayers ? perHead : price} & book`}
          </button>
          <p className="hint" style={{ fontSize: 11.5, textAlign: "center", marginTop: 10, marginBottom: 0 }}>
            Payment is simulated in this preview. Real Khalti/eSewa comes next.
          </p>
        </div>
      </div>
    </div>
  );
}
