"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Users, Wallet, Clock, ChevronLeft, ChevronRight, Tag, Upload, AlertTriangle, Minus, Plus } from "lucide-react";
import { bookCourt } from "@/lib/admin/actions";
import { confirmFreeBooking } from "@/lib/payments/actions";
import { createGame, uploadHostQr } from "@/lib/playTogether/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";
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

const DEADLINE_OPTS = [
  { label: "1 hour before", hours: 1 },
  { label: "2 hours before", hours: 2 },
  { label: "4 hours before", hours: 4 },
  { label: "12 hours before", hours: 12 },
  { label: "24 hours before", hours: 24 },
];

export default function BookingFlow({
  venueName, courts, hoursByCourt, initialDate, initialHour, rules = [],
}: {
  venueName: string;
  courts: Court[];
  hoursByCourt: Record<string, CourtHours[]>;
  initialDate?: string;
  initialHour?: number;
  rules?: PricingRule[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(initialDate || todayKtm());
  const [hour, setHour] = useState<number | null>(initialHour ?? null);
  const [duration, setDuration] = useState(1); // hours; 1, 1.5, 2, 3
  const [needPlayers, setNeedPlayers] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState<{ id: string; price: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // ── "Need players?" -> Play Together fields (host-approved requests,
  // 2-hour payment window, host's own QR shown to players — see
  // supabase/play_together_payments.sql). Same wizard, same submit, no
  // separate page — createGame() below replaces bookCourt() entirely
  // when this is on. ──────────────────────────────────────────────
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [minPlayers, setMinPlayers] = useState(8);
  const [deadlineHours, setDeadlineHours] = useState(2);
  const [ackRisk, setAckRisk] = useState(false);
  const [hostPhone, setHostPhone] = useState("");
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrPath, setQrPath] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const qrFileRef = useRef<HTMLInputElement>(null);

  const MAX_PLAYERS_FLOOR = 2;
  const MAX_PLAYERS_CEIL = 30;
  function decMaxPlayers() {
    setMaxPlayers((v) => {
      const next = Math.max(MAX_PLAYERS_FLOOR, v - 2);
      setMinPlayers((m) => Math.min(m, next));
      return next;
    });
  }
  function incMaxPlayers() {
    setMaxPlayers((v) => Math.min(MAX_PLAYERS_CEIL, v + 2));
  }
  function decMinPlayers() {
    setMinPlayers((v) => Math.max(1, v - 1));
  }
  function incMinPlayers() {
    setMinPlayers((v) => Math.min(maxPlayers, v + 1));
  }

  useEffect(() => {
    return () => { if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl); };
  }, [qrPreviewUrl]);

  function pickQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(f.type)) { setErr("Upload a JPG, PNG or WebP image."); return; }
    if (f.size > 5 * 1024 * 1024) { setErr("Image must be under 5 MB."); return; }
    setErr(null);
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    setQrPreviewUrl(URL.createObjectURL(f));
    setQrPath(null);
    setQrUploading(true);
    uploadHostQr(f)
      .then((path) => {
        if (isActionError(path)) { setErr(path.message); return; }
        setQrPath(path);
      })
      .catch((e2) => setErr(e2 instanceof Error ? e2.message : "Could not upload your QR."))
      .finally(() => setQrUploading(false));
  }

  const court = courts.find((c) => c.id === courtId);

  const hourly = court ? Number(court.base_price) : 0;
  const priced = priceFor(
    hourly, duration, rules, court?.id ?? "", dateStr,
    hour === null ? 0 : Math.round(hour * 60)
  );
  const price = priced.price;
  // Play Together model: the host pays the FULL price upfront, and each of
  // up to (max_players - 1) players reimburses this much directly — not a
  // "your share" split, matching create_play_together_game()'s
  // round(price / max_players) exactly.
  const contribution = needPlayers && maxPlayers > 0 ? Math.round(price / maxPlayers) : price;

  const STEPS = needPlayers
    ? ["Court", "When", "Players", "Payment details", "Confirm"]
    : ["Court", "When", "Players", "Confirm"];
  const lastStep = STEPS.length - 1;

  const canNext =
    step === 0 ? !!court :
    step === 1 ? hour !== null :
    step === 2 ? (needPlayers ? minPlayers >= 1 && maxPlayers >= minPlayers : true) :
    step === 3 && needPlayers ? (hostPhone.trim().length > 0 && !!qrPath && !qrUploading) :
    true;

  function next() {
    if (!canNext) {
      setErr(
        step === 0 ? "Pick a court to continue." :
        step === 1 ? "Pick a time to continue." :
        step === 2 ? "Minimum players can't be more than the maximum." :
        step === 3 ? "Add your phone number and upload your payment QR to continue." :
        null
      );
      return;
    }
    setErr(null);
    setStep((v) => Math.min(lastStep, v + 1));
  }
  function back() { setErr(null); setStep((v) => Math.max(0, v - 1)); }

  function confirm() {
    if (!court || hour === null) { setErr("Pick a court and a time."); return; }
    // The slot picker only greys out past times at selection time — if the
    // wizard sat open a while (uploading a QR, deliberating on capacity),
    // the previously-picked time can go stale before this final submit.
    // Re-check right here rather than letting the backend reject it with a
    // raw error; the backend (create_play_together_game()/book_court())
    // still re-validates this itself regardless, per
    // supabase/play_together_payments.sql.
    if (new Date(ktmIso(dateStr, hour)).getTime() <= Date.now()) {
      setErr("That time has already passed. Go back and pick a new time.");
      return;
    }
    if (needPlayers) {
      if (!hostPhone.trim() || !qrPath) { setErr("Add your phone number and upload your payment QR."); return; }
      if (!ackRisk) { setErr("Please confirm you understand the venue payment terms."); return; }
      const deadline = new Date(ktmIso(dateStr, hour)).getTime() - deadlineHours * 3600_000;
      if (deadline <= Date.now()) {
        setErr(`With this start time, "${deadlineHours} hour${deadlineHours === 1 ? "" : "s"} before" would already be in the past. Pick a shorter joining window.`);
        return;
      }
    } else if (!/^[0-9+\-\s]{7,15}$/.test(phone.trim())) {
      setErr("Enter a valid phone number.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        const startsAt = ktmIso(dateStr, hour);
        const endsAt = ktmIso(dateStr, hour + duration);

        if (needPlayers) {
          const created = await createGame({
            court_id: court.id,
            starts_at: startsAt,
            ends_at: endsAt,
            sport: court.sport,
            min_players: minPlayers,
            max_players: maxPlayers,
            joining_deadline: new Date(new Date(startsAt).getTime() - deadlineHours * 3600_000).toISOString(),
            host_qr_path: qrPath!,
            host_phone: hostPhone.trim(),
            notes: note.trim() || undefined,
            ack_risk: ackRisk,
          });
          if (isActionError(created)) {
            if (created.message === "UNAUTHORIZED") {
              router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
              return;
            }
            setErr(created.message);
            return;
          }
          const { game, price: gamePrice } = created;
          const bookedPrice = Number(gamePrice) || 0;
          if (bookedPrice > 0) {
            setAwaitingPayment({ id: game.court_booking_id, price: bookedPrice });
          } else {
            const confirmed = await confirmFreeBooking("court_booking", game.court_booking_id);
            if (isActionError(confirmed)) { setErr(confirmed.message); return; }
            setDone(true);
          }
          return;
        }

        // Real atomic booking — this is what actually reserves the slot
        // (book_court()'s row locking), before any payment is collected.
        const booking = await bookCourt({
          court_id: court.id,
          venue_id: court.venue_id,
          starts_at: startsAt,
          ends_at: endsAt,
          source: "platform",
          phone: phone.trim(),
          need_players: false,
        });
        if (isActionError(booking)) {
          if (booking.message === "UNAUTHORIZED") {
            router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
          }
          setErr(booking.message);
          return;
        }

        const bookedPrice = Number(booking?.price) || 0;
        if (bookedPrice > 0) {
          setAwaitingPayment({ id: booking.id, price: bookedPrice });
        } else {
          const confirmed = await confirmFreeBooking("court_booking", booking.id);
          if (isActionError(confirmed)) { setErr(confirmed.message); return; }
          setDone(true);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not book this slot.");
      }
    });
  }

  if (done) {
    return (
      <div className="bk-panel bk-success">
        <div className="bk-success-mark"><Check size={30} color="#fff" /></div>
        <h3 style={{ fontSize: 22 }}>{needPlayers ? "Your game is live!" : "You're booked!"}</h3>
        <p className="hint" style={{ maxWidth: 380, margin: "8px auto 20px" }}>
          {needPlayers
            ? `${court?.name} at ${venueName}. Players can now request to join — approve them from your Manage page, and each pays you Rs ${contribution} directly.`
            : `${court?.name} at ${venueName}, ${new Date(ktmIso(dateStr, hour ?? 0)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: KTM_TZ })} at ${fmtHM(hour ?? 0)} for ${duration === 1 ? "1 hour" : `${duration} hours`}.`}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="play-btn gold" onClick={() => router.push(needPlayers ? "/play-together" : "/discover")}>
            {needPlayers ? "See Play Together games" : "See my games"}
          </button>
          <button className="play-btn ghost" onClick={() => { setDone(false); setHour(null); }}>Book another</button>
        </div>
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
              { label: "Date", value: new Date(ktmIso(dateStr, hour ?? 0)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: KTM_TZ }) },
              { label: "Time", value: hour !== null ? `${fmtHM(hour)}–${fmtHM(hour + duration)}` : "—" },
            ]}
            footer={
              <>
                <button className="play-btn gold" onClick={() => router.push(needPlayers ? "/my-games" : "/discover")}>
                  {needPlayers ? "Go to My Games" : "See my games"}
                </button>
                <button className="play-btn ghost" onClick={() => { setAwaitingPayment(null); setDone(false); setHour(null); }}>Book another</button>
              </>
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
        <p className="hint">The owner is still setting up. Check back soon, or explore other venues.</p>
      </div>
    );
  }

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
              Live availability — booked slots are shown greyed out so you know what&apos;s already taken.
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

            {/* Same wizard, same submit — this just collects Play
                Together's capacity fields (host-approved requests, 2-hour
                payment window, host's own QR — see
                supabase/play_together_payments.sql) instead of a separate
                page. The next step asks for your phone/QR. */}
            {needPlayers && (
              <div style={{ marginTop: 18 }}>
                <p className="hint" style={{ marginBottom: 2, marginTop: 4 }}>Total players (including you)</p>
                <p className="hint" style={{ marginBottom: 10, fontSize: 12, opacity: .7 }}>
                  How big should the full squad be once everyone&apos;s joined?
                </p>
                <div className="bk-stepper">
                  <button type="button" className="bk-step-btn" onClick={decMaxPlayers}
                    disabled={maxPlayers <= MAX_PLAYERS_FLOOR} aria-label="Decrease total players">
                    <Minus size={16} />
                  </button>
                  <div className="bk-step-val">
                    <span className="n">{maxPlayers}</span>
                    <span className="u">players</span>
                  </div>
                  <button type="button" className="bk-step-btn" onClick={incMaxPlayers}
                    disabled={maxPlayers >= MAX_PLAYERS_CEIL} aria-label="Increase total players">
                    <Plus size={16} />
                  </button>
                </div>
                <p className="pt-min-note" style={{ marginTop: 10 }}>
                  {Math.max(maxPlayers - 1, 0)} open spot{Math.max(maxPlayers - 1, 0) === 1 ? "" : "s"}{" "}
                  for others to join — you&apos;re already counted in as the host.
                </p>

                <p className="hint" style={{ marginBottom: 2, marginTop: 24 }}>Minimum to make it happen</p>
                <p className="hint" style={{ marginBottom: 10, fontSize: 12, opacity: .7 }}>
                  If fewer than this join, you can still play — just know it won&apos;t be full.
                </p>
                <div className="bk-stepper">
                  <button type="button" className="bk-step-btn" onClick={decMinPlayers}
                    disabled={minPlayers <= 1} aria-label="Decrease minimum players">
                    <Minus size={16} />
                  </button>
                  <div className="bk-step-val">
                    <span className="n">{minPlayers}</span>
                    <span className="u">players</span>
                  </div>
                  <button type="button" className="bk-step-btn" onClick={incMinPlayers}
                    disabled={minPlayers >= maxPlayers} aria-label="Increase minimum players">
                    <Plus size={16} />
                  </button>
                </div>
                <p className={`pt-min-note ${minPlayers <= maxPlayers ? "ok" : ""}`}>
                  Needs at least {minPlayers} of {maxPlayers} players for the game to go ahead.
                </p>

                <div className="bk-split" style={{ marginTop: 16 }}>
                  Rs {contribution} per player · you pay the full Rs {price} now and get reimbursed
                  directly as they join.
                </div>

                <p className="hint" style={{ marginBottom: 8, marginTop: 20 }}>When should joining close?</p>
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
                  <textarea className="bk-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Turf shoes only · park on the side street" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 4. Payment details (Play Together only) ───────────── */}
        {needPlayers && step === 3 && (
          <div className="bk-panel">
            <h3>How players pay you</h3>
            <p className="hint">
              Khelam Na never holds player contributions — this is shown directly to approved
              players so they can pay you.
            </p>

            <p className="hint" style={{ marginBottom: 8 }}>Your phone number</p>
            <input
              type="tel" inputMode="tel" className="bk-in" style={{ marginBottom: 20 }}
              value={hostPhone} onChange={(e) => setHostPhone(e.target.value)}
              placeholder="98XXXXXXXX"
            />

            <p className="hint" style={{ marginBottom: 8 }}>Your eSewa or Khalti QR code</p>
            <input
              ref={qrFileRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={pickQrFile} style={{ display: "none" }}
            />
            {qrPreviewUrl ? (
              <div className="pymt-shot" onClick={() => qrFileRef.current?.click()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrPreviewUrl} alt="Your payment QR preview" />
                <span className="pymt-shot-replace">{qrUploading ? "Uploading…" : "Replace"}</span>
              </div>
            ) : (
              <button className="pymt-upload" onClick={() => qrFileRef.current?.click()} type="button">
                <Upload size={15} /> Upload your QR code
              </button>
            )}
          </div>
        )}

        {/* ── 5. Confirm ───────────────────────────────────────── */}
        {step === lastStep && (
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
              <>
                <div className="bk-sum-row"><span className="lbl">Players</span><span className="val">{maxPlayers} max, {minPlayers} min</span></div>
                <div className="bk-sum-row"><span className="lbl">Your contact</span><span className="val">{hostPhone || "—"}</span></div>
              </>
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
              <span className="lbl">{needPlayers ? "Total payable now" : "Total"}</span>
              <span className="val">
                {priced.saved > 0 && (
                  <s style={{ opacity: .45, marginRight: 8, fontWeight: 500 }}>Rs {priced.base}</s>
                )}
                Rs {price}
              </span>
            </div>

            {needPlayers ? (
              <>
                <div className="bk-split">
                  Expected player contribution: <b>Rs {contribution}</b> / player, paid to you directly.
                  Khelam Na never collects this.
                </div>

                <div className="pt-risk-box">
                  <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <h4>Important</h4>
                    <p>
                      You are paying the full venue amount now. Players will reimburse you directly.
                      If fewer players join, you remain responsible for the venue booking cost.
                    </p>
                    <label className="pt-risk-check">
                      <input type="checkbox" checked={ackRisk} onChange={(e) => setAckRisk(e.target.checked)} />
                      I understand that I am responsible for the venue payment.
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 20 }}>
                <p className="hint" style={{ marginBottom: 8 }}>Phone number</p>
                <input
                  type="tel" inputMode="tel" className="bk-in" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                />
                <p className="hint" style={{ fontSize: 12, marginTop: 6, marginBottom: 0, opacity: 0.7 }}>
                  So the venue can reach you about this booking.
                </p>
              </div>
            )}

            <p className="hint" style={{ fontSize: 12.5, marginTop: 18, marginBottom: 0 }}>
              <Wallet size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Next you&apos;ll pay via eSewa or Khalti QR and submit your transaction ID for verification.
            </p>
          </div>
        )}

        {err && <div className="bkw-err">{err}</div>}
      </div>

      {/* ── Sticky footer: price + navigation ──────────────────── */}
      <div className="bkw-bar">
        <div className="bkw-price">
          <span className="lbl">{needPlayers ? "Total payable now" : "Total"}</span>
          <span className="val">
            {priced.saved > 0 && <s>Rs {priced.base}</s>}
            Rs {price}
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
          {step < lastStep ? (
            <button className="play-btn gold" onClick={next} disabled={!canNext}>
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button className="play-btn gold" onClick={confirm} disabled={pending || hour === null || (needPlayers && !ackRisk)}>
              {pending ? "Reserving…" : `Reserve · Rs ${price}`}
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
          font-family: 'Inter', sans-serif; font-size: 17px; font-weight: 800;
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
        .bkw-price .val { font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 700; }
        .bkw-price .sub { font-size: 11.5px; opacity: .55; }
        .bkw-nav { display: flex; gap: 8px; }
        @media (max-width: 480px) {
          .bkw-price .sub { display: none; }
          .bkw-nav .play-btn { padding: 11px 16px; font-size: 13.5px; }
        }

        .pymt-shot { position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; border: 1px solid var(--line); max-height: 220px; }
        .pymt-shot img { width: 100%; max-height: 220px; object-fit: contain; background: #000; display: block; }
        .pymt-shot-replace { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,.7); color: #fff; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; }
        .pymt-upload { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 11px; border: 1px dashed var(--line); background: transparent; color: inherit; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }

        .bk-stepper { display: flex; align-items: center; gap: 14px; }
        .bk-step-btn {
          width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--line); background: var(--ink); color: inherit;
          cursor: pointer; transition: border-color .18s, background .18s, transform .12s;
        }
        .bk-step-btn:hover:not(:disabled) { border-color: rgba(0,98,65,.55); background: rgba(0,98,65,.1); }
        .bk-step-btn:active:not(:disabled) { transform: scale(.94); }
        .bk-step-btn:disabled { opacity: .35; cursor: not-allowed; }
        .bk-step-val {
          min-width: 84px; display: flex; flex-direction: column; align-items: center; line-height: 1.15;
        }
        .bk-step-val .n { font-family: 'Inter', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -.5px; color: var(--sodium, #006241); }
        .bk-step-val .u { font-size: 11px; font-weight: 600; opacity: .55; text-transform: uppercase; letter-spacing: .06em; }
      `}</style>
    </div>
  );
}
