"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Wallet, Clock, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { createGame } from "@/lib/playTogether/actions";
import { confirmFreeBooking } from "@/lib/payments/actions";
import PaymentStep from "@/components/payments/PaymentStep";
import SlotPicker from "../../../(play)/create/[id]/SlotPicker";
import WeekStrip from "../../../(play)/create/[id]/WeekStrip";
import type { Court, CourtHours } from "@/lib/admin/types";

const KTM_TZ = "Asia/Kathmandu";

function ktmIso(dateStr: string, hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:45`;
}
function todayKtm() {
  return new Date().toLocaleDateString("en-CA", { timeZone: KTM_TZ });
}
function fmtHM(hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const FORMAT_OPTIONS: Record<string, string[]> = {
  Futsal: ["5A", "6A"],
  Football: ["5A", "7A", "9A", "11A"],
  Basketball: ["3x3", "5x5"],
  Cricket: ["Box Cricket", "Practice", "Full Match"],
  Volleyball: ["6s", "Beach"],
  Badminton: ["Singles", "Doubles"],
  Tennis: ["Singles", "Doubles"],
};

const DEADLINE_OPTS = [
  { label: "1 hour before", hours: 1 },
  { label: "2 hours before", hours: 2 },
  { label: "4 hours before", hours: 4 },
  { label: "12 hours before", hours: 12 },
  { label: "24 hours before", hours: 24 },
];

const STEPS = ["Court", "Format", "When", "Capacity", "Confirm"];

export default function PlayTogetherWizard({
  venueName, courts,
}: {
  venueName: string;
  courts: Court[];
  hoursByCourt: Record<string, CourtHours[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [format, setFormat] = useState("");
  const [customFormat, setCustomFormat] = useState("");
  const [dateStr, setDateStr] = useState(todayKtm());
  const [hour, setHour] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [minPlayers, setMinPlayers] = useState(8);
  const [deadlineHours, setDeadlineHours] = useState(2);
  const [notes, setNotes] = useState("");
  const [ackRisk, setAckRisk] = useState(false);

  const [awaitingPayment, setAwaitingPayment] = useState<{ id: string; price: number } | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const court = courts.find((c) => c.id === courtId);
  const hourly = court ? Number(court.base_price) : 0;
  const estimatedPrice = Math.round(hourly * duration);
  const contribution = maxPlayers > 0 ? Math.round(estimatedPrice / maxPlayers) : 0;
  const formatOpts = court ? FORMAT_OPTIONS[court.sport] ?? [] : [];
  const gameFormat = format === "__custom__" ? customFormat.trim() : format;

  const canNext =
    step === 0 ? !!court :
    step === 1 ? true :
    step === 2 ? hour !== null :
    step === 3 ? minPlayers >= 1 && maxPlayers >= minPlayers :
    true;

  function next() {
    if (!canNext) {
      setErr(
        step === 0 ? "Pick a court to continue." :
        step === 2 ? "Pick a time to continue." :
        "Minimum players can't be more than the maximum."
      );
      return;
    }
    setErr(null);
    setStep((v) => Math.min(STEPS.length - 1, v + 1));
  }
  function back() { setErr(null); setStep((v) => Math.max(0, v - 1)); }

  function submit() {
    if (!court || hour === null) { setErr("Pick a court and a time."); return; }
    if (!ackRisk) { setErr("Please confirm you understand the venue payment terms."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        const startsAt = ktmIso(dateStr, hour);
        const { game, price } = await createGame({
          court_id: court.id,
          starts_at: startsAt,
          ends_at: ktmIso(dateStr, hour + duration),
          sport: court.sport,
          game_format: gameFormat || undefined,
          min_players: minPlayers,
          max_players: maxPlayers,
          joining_deadline: new Date(new Date(startsAt).getTime() - deadlineHours * 3600_000).toISOString(),
          notes: notes.trim() || undefined,
          ack_risk: ackRisk,
        });

        if (price > 0) {
          setAwaitingPayment({ id: game.court_booking_id, price });
        } else {
          await confirmFreeBooking("court_booking", game.court_booking_id);
          setDone(true);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not create this game.";
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
        <h3 style={{ fontSize: 22 }}>Your game is live!</h3>
        <p className="hint" style={{ maxWidth: 380, margin: "8px auto 20px" }}>
          {court?.name} at {venueName}. Players can now join and will reimburse you
          Rs {contribution} each, in cash, at the venue.
        </p>
        <button className="play-btn gold" onClick={() => router.push("/play-together")}>See Play Together games</button>
      </div>
    );
  }

  if (awaitingPayment) {
    return (
      <div className="bkw">
        <div className="bk-panel">
          <PaymentStep
            bookingType="court_booking"
            bookingId={awaitingPayment.id}
            amount={awaitingPayment.price}
            summary={[
              { label: "Venue", value: venueName },
              { label: "Court", value: court?.name ?? "—" },
              { label: "Sport", value: `${court?.sport ?? ""}${gameFormat ? " · " + gameFormat : ""}` },
              { label: "Players", value: `${maxPlayers} max, ${minPlayers} min` },
            ]}
            footer={
              <button className="play-btn gold" onClick={() => router.push("/my-games")}>Go to My Games</button>
            }
          />
        </div>
      </div>
    );
  }

  if (courts.length === 0) {
    return (
      <div className="bk-panel">
        <h3>This venue hasn&apos;t added courts yet</h3>
        <p className="hint">Check back soon, or pick another venue.</p>
      </div>
    );
  }

  return (
    <div className="bkw">
      <ol className="bkw-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "on" : i < step ? "done" : ""}>
            <button onClick={() => { if (i < step) { setErr(null); setStep(i); } }} disabled={i > step}>
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
            <p className="hint">The sport is set by the court you pick.</p>
            <div className="bk-chips">
              {courts.map((c) => (
                <button key={c.id} className={`bk-chip ${c.id === courtId ? "on" : ""}`}
                  onClick={() => { setCourtId(c.id); setHour(null); setFormat(""); setErr(null); }}>
                  {c.name}
                  <small>{c.sport} · Rs {c.base_price}/hr</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. Format ────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bk-panel">
            <h3>Game format</h3>
            <p className="hint">Optional — helps players know what to expect.</p>
            {formatOpts.length > 0 && (
              <div className="bk-chips">
                {formatOpts.map((f) => (
                  <button key={f} className={`bk-chip ${format === f ? "on" : ""}`} onClick={() => setFormat(f)}>
                    {f}
                  </button>
                ))}
                <button className={`bk-chip ${format === "__custom__" ? "on" : ""}`} onClick={() => setFormat("__custom__")}>
                  Custom
                </button>
              </div>
            )}
            {(format === "__custom__" || formatOpts.length === 0) && (
              <input
                className="bk-in" style={{ marginTop: 14 }}
                value={customFormat} onChange={(e) => setCustomFormat(e.target.value)}
                placeholder="e.g. Mixed doubles"
              />
            )}
          </div>
        )}

        {/* ── 3. When ──────────────────────────────────────────── */}
        {step === 2 && (
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

        {/* ── 4. Capacity ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="bk-panel">
            <h3>Set game capacity</h3>
            <p className="hint">You&apos;re automatically counted as one player.</p>

            <p className="hint" style={{ marginBottom: 8, marginTop: 4 }}>Maximum players</p>
            <div className="bk-chips" style={{ marginBottom: 18 }}>
              {[4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((n) => (
                <button key={n} className={`bk-chip ${maxPlayers === n ? "on" : ""}`}
                  onClick={() => { setMaxPlayers(n); setMinPlayers(Math.max(1, Math.min(n, Math.round(n * 0.8)))); }}>
                  {n}
                </button>
              ))}
            </div>
            <p className="pt-min-note">Player slots available: {Math.max(maxPlayers - 1, 0)} (you&apos;re the host)</p>

            <p className="hint" style={{ marginBottom: 8, marginTop: 20 }}>Minimum players required</p>
            <div className="bk-chips" style={{ marginBottom: 8 }}>
              {Array.from({ length: maxPlayers }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`bk-chip ${minPlayers === n ? "on" : ""}`} onClick={() => setMinPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className={`pt-min-note ${minPlayers <= maxPlayers ? "ok" : ""}`}>
              {minPlayers} / {maxPlayers} players needed for the game to be viable.
            </p>

            <p className="hint" style={{ marginBottom: 8, marginTop: 20 }}>Joining closes</p>
            <div className="bk-chips">
              {DEADLINE_OPTS.map((d) => (
                <button key={d.hours} className={`bk-chip ${deadlineHours === d.hours ? "on" : ""}`}
                  onClick={() => setDeadlineHours(d.hours)}>
                  {d.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              <p className="hint" style={{ marginBottom: 8 }}>Anything players should know? (optional)</p>
              <textarea className="bk-note" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Turf shoes only · park on the side street" />
            </div>
          </div>
        )}

        {/* ── 5. Confirm ───────────────────────────────────────── */}
        {step === 4 && (
          <div className="bk-panel">
            <h3>Confirm your game</h3>
            <p className="hint">{venueName}</p>

            <div className="bk-sum-row"><span className="lbl">Court</span><span className="val">{court?.name ?? "—"}</span></div>
            <div className="bk-sum-row"><span className="lbl">Sport</span><span className="val">{court?.sport}{gameFormat ? ` · ${gameFormat}` : ""}</span></div>
            <div className="bk-sum-row"><span className="lbl">Date</span><span className="val">
              {new Date(ktmIso(dateStr, hour ?? 0)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM_TZ })}
            </span></div>
            <div className="bk-sum-row"><span className="lbl">Time</span><span className="val">{hour !== null ? `${fmtHM(hour)}–${fmtHM(hour + duration)}` : "—"}</span></div>
            <div className="bk-sum-row"><span className="lbl">Players</span><span className="val">{maxPlayers} max, {minPlayers} min</span></div>
            <div className="bk-sum-row"><span className="lbl">Venue booking</span><span className="val">Rs {estimatedPrice}</span></div>
            <div className="bk-sum-row bk-sum-total">
              <span className="lbl">Total payable now</span>
              <span className="val">Rs {estimatedPrice}</span>
            </div>

            <div className="bk-split" style={{ marginTop: 4 }}>
              Expected player contribution: <b>Rs {contribution}</b> / player, paid to you in cash at the venue.
              Khelam Na never collects this.
            </div>

            <div className="pt-risk-box">
              <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4>Important</h4>
                <p>
                  You are paying the full venue amount now. Players will reimburse you directly at the
                  venue. If fewer players join, you remain responsible for the venue booking cost.
                </p>
                <label className="pt-risk-check">
                  <input type="checkbox" checked={ackRisk} onChange={(e) => setAckRisk(e.target.checked)} />
                  I understand that I am responsible for the venue payment.
                </label>
              </div>
            </div>

            <p className="hint" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 0 }}>
              <Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Next you&apos;ll pay via eSewa or Khalti QR (or confirm instantly if this court is free).
            </p>
          </div>
        )}

        {err && <div className="bkw-err">{err}</div>}
      </div>

      <div className="bkw-bar">
        <div className="bkw-price">
          <span className="lbl">Total payable now</span>
          <span className="val">Rs {estimatedPrice}</span>
          {hour !== null && <span className="sub">{fmtHM(hour)}–{fmtHM(hour + duration)} · {court?.name}</span>}
        </div>
        <div className="bkw-nav">
          {step > 0 && <button className="play-btn ghost" onClick={back}><ChevronLeft size={15} /> Back</button>}
          {step < STEPS.length - 1 ? (
            <button className="play-btn gold" onClick={next} disabled={!canNext}>
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button className="play-btn gold" onClick={submit} disabled={pending || !ackRisk}>
              {pending ? "Creating…" : `Pay Rs ${estimatedPrice} & Create Game`}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .bkw { max-width: 760px; margin: 0 auto; padding-bottom: 110px; }
        .bkw-steps { display: flex; align-items: center; gap: 6px; list-style: none; margin: 0 0 22px; padding: 0; }
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
          font-size: 12px; font-weight: 800; border: 1px solid var(--line); background: transparent;
        }
        .bkw-steps li.on .dot { background: #006241; border-color: #006241; color: #ffffff; }
        .bkw-steps li.done .dot { background: #2E7D5B; border-color: #2E7D5B; color: #fff; }
        .bkw-steps .lbl { font-size: 12.5px; font-weight: 700; white-space: nowrap; }
        @media (max-width: 560px) { .bkw-steps .lbl { display: none; } }
        .bkw-body { min-height: 260px; }
        .bkw-err { color: var(--pink); font-size: 13px; margin-top: 12px; }
        body:has(.bkw-bar) .dock { display: none !important; }
        .bkw-bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 340;
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 14px clamp(16px, 5vw, 40px) calc(14px + env(safe-area-inset-bottom, 0px));
          background: rgba(11,13,17,0.92); backdrop-filter: blur(16px); border-top: 1px solid var(--line);
        }
        [data-theme="paper"] .bkw-bar { background: rgba(248,245,240,0.94); }
        .bkw-price { display: flex; flex-direction: column; line-height: 1.25; }
        .bkw-price .lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .5; }
        .bkw-price .val { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 700; }
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
