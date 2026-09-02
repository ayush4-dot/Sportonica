"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar, MapPin, Users, Pencil, X, Mail, Check, Plus, Wallet, Loader2, AlertCircle, Clock3, Trash2,
} from "lucide-react";
import { updateHostedGame, invitePlayers, cancelInvite } from "@/lib/play/hostActions";
import {
  editCourtBooking, cancelCourtBooking, editGameJoin, cancelGameJoin,
} from "@/lib/bookings/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";
import type { BookingType } from "@/lib/payments/types";
import type { CourtBookingRow, CourtOption } from "./page";

type Game = {
  id: string; title: string; venue: string; sport: string;
  event_date: string; fee: number; max_players: number;
  confirmed_count: number; slots_remaining: number;
  skill_level?: string | null; notes?: string | null;
  paymentStatus?: string; bookingId?: string | null;
  // Play Together games (src/lib/playTogether/) live in a separate table
  // and don't support Edit/Invite (those are hostActions.ts, events-only)
  // — they show a "Manage" button instead that routes to their own
  // approval flow. Absent/"event" = a regular hosted event.
  kind?: "event" | "play_together";
  pendingRequests?: number;
  // "Playing" tab only — the caller's own entry on this game, so they
  // can fix a typo in their name/phone or leave.
  myPlayerName?: string | null;
  myPhone?: string | null;
  myPosition?: string | null;
};
type Invite = {
  id: string; event_id: string; email: string;
  paid_by_host: boolean; status: string;
};

// Small pill for a booking whose payment still needs attention. "paid" (or
// unset, for free games) renders nothing — no need to announce the happy path.
function PaymentBadge({ status }: { status?: string }) {
  if (!status || status === "paid") return null;
  if (status === "pending_verification") {
    return <span className="mg-pay-badge pending"><Clock3 size={11} /> Payment awaiting verification</span>;
  }
  if (status === "rejected") {
    return <span className="mg-pay-badge rejected"><AlertCircle size={11} /> Payment rejected — resubmit</span>;
  }
  return null;
}

const KTM = "Asia/Kathmandu";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: KTM,
  });
// datetime-local wants "YYYY-MM-DDTHH:mm"
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();
const HOUR_MS = 3_600_000;

export default function MyGamesClient({
  hosted, joined, invites, courtBookings, venueCourts,
}: {
  hosted: Game[]; joined: Game[]; invites: Invite[];
  courtBookings: CourtBookingRow[]; venueCourts: CourtOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"hosting" | "playing" | "bookings">("hosting");
  const [editing, setEditing] = useState<Game | null>(null);
  const [inviting, setInviting] = useState<Game | null>(null);
  const [editBooking, setEditBooking] = useState<CourtBookingRow | null>(null);
  const [editJoin, setEditJoin] = useState<Game | null>(null);
  const [resubmit, setResubmit] = useState<
    { bookingType: BookingType; bookingId: string; amount: number; summary: { label: string; value: string }[] } | null
  >(null);

  return (
    <main className="mg">
      <header className="mg-head">
        <p className="mg-eyebrow">Your games</p>
        <h1 className="mg-h1">My <em>games</em></h1>
        <p className="mg-sub">
          Everything you&apos;re hosting or playing. Edit details, invite players,
          and keep your squad in the loop.
        </p>
      </header>

      <div className="mg-tabs">
        <button className={tab === "hosting" ? "on" : ""} onClick={() => setTab("hosting")}>
          Hosting <span>{hosted.length}</span>
        </button>
        <button className={tab === "playing" ? "on" : ""} onClick={() => setTab("playing")}>
          Playing <span>{joined.length}</span>
        </button>
        <button className={tab === "bookings" ? "on" : ""} onClick={() => setTab("bookings")}>
          Bookings <span>{courtBookings.length}</span>
        </button>
      </div>

      {tab === "hosting" ? (
        hosted.length === 0 ? (
          <Empty
            title="You haven't hosted a game yet"
            body="Book a court, set your spots, and let players come to you."
            cta="Host a game" href="/create"
          />
        ) : (
          <div className="mg-grid">
            {hosted.map((g) => {
              const isPlayTogether = g.kind === "play_together";
              const mine = isPlayTogether ? [] : invites.filter((i) => i.event_id === g.id);
              return (
                <article key={g.id} className="mg-card">
                  <div className="mg-card-top">
                    <span className="mg-sport">{g.sport}</span>
                    <span className="mg-going">
                      <Users size={12} /> {g.confirmed_count}/{g.max_players}
                    </span>
                  </div>
                  <h3 className="mg-title">{g.title}</h3>
                  <p className="mg-meta"><MapPin size={12} /> {g.venue}</p>
                  <p className="mg-meta"><Calendar size={12} /> {when(g.event_date)}</p>
                  <p className="mg-meta">
                    <Wallet size={12} /> {g.fee === 0 ? "Free" : `Rs ${g.fee}`}
                  </p>
                  {isPlayTogether && !!g.pendingRequests && (
                    <span className="mg-pay-badge pending">
                      <Clock3 size={11} /> {g.pendingRequests} request{g.pendingRequests === 1 ? "" : "s"} to review
                    </span>
                  )}

                  {mine.length > 0 && (
                    <div className="mg-invites">
                      <p className="mg-invites-t">Invited</p>
                      {mine.map((i) => (
                        <span key={i.id} className="mg-inv">
                          {i.email}
                          {i.paid_by_host && <b title="You're covering this spot"> · paid</b>}
                          <button
                            onClick={async () => {
                              const res = await cancelInvite(i.id, g.id);
                              if (isActionError(res)) return;
                              router.refresh();
                            }}
                            aria-label={`Remove ${i.email}`}
                          ><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mg-actions">
                    {isPlayTogether ? (
                      <Link className="mg-btn" href={`/play-together/${g.id}/manage`}>
                        <Users size={13} /> Manage
                      </Link>
                    ) : (
                      <>
                        <button className="mg-btn" onClick={() => setEditing(g)}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button className="mg-btn" onClick={() => setInviting(g)}>
                          <Plus size={13} /> Invite
                        </button>
                      </>
                    )}
                    <Link className="mg-btn ghost" href={isPlayTogether ? `/play-together/${g.id}` : `/game/${g.id}`}>
                      View
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : tab === "playing" ? (
        joined.length === 0 ? (
          <Empty
            title="You haven't joined a game yet"
            body="Find a game near you and grab a spot."
            cta="Find a game" href="/discover"
          />
        ) : (
          <div className="mg-grid">
            {joined.map((g) => (
              <article key={g.id} className="mg-card">
                <div className="mg-card-top">
                  <span className="mg-sport">{g.sport}</span>
                  <span className="mg-going"><Users size={12} /> {g.confirmed_count}/{g.max_players}</span>
                </div>
                <h3 className="mg-title">{g.title}</h3>
                <p className="mg-meta"><MapPin size={12} /> {g.venue}</p>
                <p className="mg-meta"><Calendar size={12} /> {when(g.event_date)}</p>
                <PaymentBadge status={g.paymentStatus} />
                <div className="mg-actions">
                  <Link className="mg-btn ghost" href={`/game/${g.id}`}>View game</Link>
                  {g.bookingId && (
                    <button className="mg-btn ghost" onClick={() => setEditJoin(g)}>
                      <Pencil size={13} /> My details
                    </button>
                  )}
                  {g.paymentStatus === "rejected" && g.bookingId && (
                    <button
                      className="mg-btn"
                      onClick={() => setResubmit({
                        bookingType: "event_booking", bookingId: g.bookingId!, amount: g.fee,
                        summary: [
                          { label: "Game", value: `${g.sport} · ${g.title}` },
                          { label: "Venue", value: g.venue },
                          { label: "When", value: when(g.event_date) },
                        ],
                      })}
                    >
                      Resubmit payment
                    </button>
                  )}
                  {g.bookingId
                    && ["unpaid", "rejected"].includes(g.paymentStatus ?? "")
                    && isFuture(g.event_date) && (
                    <button
                      className="mg-btn ghost danger"
                      onClick={async () => {
                        if (!confirm("Leave this game? Your spot opens back up.")) return;
                        const res = await cancelGameJoin(g.bookingId!);
                        if (isActionError(res)) { alert(res.message); return; }
                        router.refresh();
                      }}
                    >
                      <Trash2 size={13} /> Leave
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )
      ) : courtBookings.length === 0 ? (
        <Empty
          title="You haven't booked a court yet"
          body="Pick a venue, date and time, and lock it in."
          cta="Book a court" href="/create"
        />
      ) : (
        <div className="mg-grid">
          {courtBookings.map((b) => (
            <article key={b.id} className="mg-card">
              <div className="mg-card-top">
                <span className="mg-sport">{b.courts?.sport ?? "—"}</span>
                <span className="mg-going">{b.state === "confirmed" ? "Confirmed" : b.state === "reserved" ? "Reserved" : b.state}</span>
              </div>
              <h3 className="mg-title">{b.courts?.name ?? "Court"}</h3>
              <p className="mg-meta"><MapPin size={12} /> {b.venues?.name ?? "—"}</p>
              <p className="mg-meta"><Calendar size={12} /> {when(b.starts_at)}</p>
              <p className="mg-meta"><Wallet size={12} /> {Number(b.price) === 0 ? "Free" : `Rs ${b.price}`}</p>
              <PaymentBadge status={b.payment_status} />
              {b.state === "cancelled" ? (
                <span className="mg-pay-badge rejected"><AlertCircle size={11} /> Cancelled</span>
              ) : (
                <div className="mg-actions">
                  <button className="mg-btn ghost" onClick={() => setEditBooking(b)}>
                    <Pencil size={13} /> Edit
                  </button>
                  {b.payment_status === "rejected" && (
                    <button
                      className="mg-btn"
                      onClick={() => setResubmit({
                        bookingType: "court_booking", bookingId: b.id, amount: Number(b.price),
                        summary: [
                          { label: "Court", value: b.courts?.name ?? "Court" },
                          { label: "Venue", value: b.venues?.name ?? "—" },
                          { label: "When", value: when(b.starts_at) },
                        ],
                      })}
                    >
                      Resubmit payment
                    </button>
                  )}
                  {["unpaid", "rejected"].includes(b.payment_status) && isFuture(b.starts_at) && (
                    <button
                      className="mg-btn ghost danger"
                      onClick={async () => {
                        if (!confirm("Cancel this booking? The slot opens back up.")) return;
                        const res = await cancelCourtBooking(b.id);
                        if (isActionError(res)) { alert(res.message); return; }
                        router.refresh();
                      }}
                    >
                      <Trash2 size={13} /> Cancel
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && <EditSheet game={editing} onClose={() => { setEditing(null); router.refresh(); }} />}
      {inviting && <InviteSheet game={inviting} onClose={() => { setInviting(null); router.refresh(); }} />}
      {editBooking && (
        <EditBookingSheet
          booking={editBooking}
          courts={venueCourts.filter((c) => c.venue_id === editBooking.venue_id)}
          onClose={() => { setEditBooking(null); router.refresh(); }}
        />
      )}
      {editJoin && <EditJoinSheet game={editJoin} onClose={() => { setEditJoin(null); router.refresh(); }} />}
      {resubmit && (
        <div className="mg-scrim" onClick={() => setResubmit(null)}>
          <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
            <PaymentStep
              bookingType={resubmit.bookingType}
              bookingId={resubmit.bookingId}
              amount={resubmit.amount}
              summary={resubmit.summary}
              footer={<button className="mg-btn" onClick={() => { setResubmit(null); router.refresh(); }}>Done</button>}
            />
          </div>
        </div>
      )}

      <style>{`
        .mg { max-width: 1100px; margin: 0 auto; padding: 36px 24px 80px; }
        .mg-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .2em;
          text-transform: uppercase; opacity: .5; margin: 0 0 10px; }
        .mg-h1 { font-family: 'Inter', sans-serif; font-size: clamp(34px,5vw,60px);
          font-weight: 800; letter-spacing: -2px; line-height: .95; margin: 0; color: #fff; }
        .mg-h1 em { font-style: normal; color: #006241; }
        [data-theme="paper"] .mg-h1 { color: #14171E; }
        [data-theme="paper"] .mg-h1 em { color: #006241; }
        .mg-sub { font-size: 14.5px; opacity: .6; margin: 12px 0 0; max-width: 520px; line-height: 1.55; }

        .mg-tabs { display: flex; gap: 8px; margin: 28px 0 20px; }
        .mg-tabs button {
          display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
          border: 1px solid var(--line, rgba(242,237,230,.14)); background: transparent;
          color: inherit; border-radius: 999px; padding: 9px 16px;
          font-size: 13px; font-weight: 700; font-family: inherit; transition: all .2s;
        }
        .mg-tabs button span { opacity: .55; font-family: 'Inter', sans-serif; font-size: 11.5px; }
        .mg-tabs button.on { background: rgba(0,98,65,.15); border-color: rgba(0,98,65,.5); color: #006241; }

        .mg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px,1fr)); gap: 14px; }
        .mg-card {
          border: 1px solid var(--line, rgba(242,237,230,.12)); border-radius: 18px; padding: 16px 17px;
          background: linear-gradient(170deg, rgba(255,255,255,.035), rgba(255,255,255,0));
        }
        [data-theme="paper"] .mg-card { background: #fff; }
        .mg-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
        .mg-sport { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .65; }
        .mg-going { display: inline-flex; align-items: center; gap: 4px;
          font-family: 'Inter', sans-serif; font-size: 11.5px; opacity: .7; }
        .mg-title { font-family: 'Inter', sans-serif; font-size: 17px;
          font-weight: 700; margin: 0 0 8px; letter-spacing: -.3px; }
        .mg-meta { display: flex; align-items: center; gap: 6px; font-size: 12.5px;
          opacity: .62; margin: 0 0 5px; }

        .mg-pay-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
          font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px; }
        .mg-pay-badge.pending { background: rgba(217,119,6,.12); border: 1px solid rgba(217,119,6,.3); color: #d97706; }
        .mg-pay-badge.rejected { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: #ef4444; }

        .mg-invites { margin: 12px 0 0; padding-top: 11px; border-top: 1px solid var(--line, rgba(242,237,230,.1)); }
        .mg-invites-t { font-size: 10px; font-weight: 700; letter-spacing: .12em;
          text-transform: uppercase; opacity: .45; margin: 0 0 7px; }
        .mg-inv { display: inline-flex; align-items: center; gap: 5px; margin: 0 5px 5px 0;
          font-size: 11.5px; padding: 4px 9px; border-radius: 999px;
          background: rgba(0,98,65,.12); border: 1px solid rgba(0,98,65,.3); color: #006241; }
        .mg-inv b { font-weight: 700; opacity: .8; }
        .mg-inv button { background: none; border: none; color: inherit; cursor: pointer;
          display: inline-flex; padding: 0; opacity: .7; }
        .mg-inv button:hover { opacity: 1; }

        .mg-actions { display: flex; gap: 7px; margin-top: 14px; flex-wrap: wrap; }
        .mg-btn {
          display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
          border: none; border-radius: 10px; padding: 8px 14px;
          font-size: 12.5px; font-weight: 700; font-family: inherit;
          background: #006241; color: #fff; text-decoration: none; transition: transform .15s;
        }
        .mg-btn:hover { transform: translateY(-1px); }
        .mg-btn.ghost { background: transparent; border: 1px solid var(--line, rgba(242,237,230,.16)); color: inherit; }
        .mg-btn.danger { color: #ef4444; border-color: rgba(239,68,68,.35); }
        .mg-note { font-size: 11.5px; opacity: .55; margin: -8px 0 12px; line-height: 1.45; }

        .mg-empty { text-align: center; padding: 70px 20px; border-radius: 18px;
          border: 1px dashed var(--line, rgba(242,237,230,.16)); }
        .mg-empty h3 { font-family: 'Inter', sans-serif; font-size: 19px;
          font-weight: 800; margin: 0 0 8px; }
        .mg-empty p { font-size: 13.5px; opacity: .6; margin: 0 0 18px; }

        .mg-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.6);
          backdrop-filter: blur(4px); z-index: 400; display: flex;
          align-items: center; justify-content: center; padding: 20px; }
        .mg-sheet { width: 100%; max-width: 440px; max-height: 88vh; overflow-y: auto;
          border-radius: 20px; padding: 22px; background: #12151b;
          border: 1px solid rgba(242,237,230,.12); }
        [data-theme="paper"] .mg-sheet { background: #F8F5F0; }
        .mg-sheet h3 { font-family: 'Inter', sans-serif; font-size: 20px;
          font-weight: 800; margin: 0 0 4px; }
        .mg-sheet .hint { font-size: 12.5px; opacity: .58; margin: 0 0 18px; line-height: 1.5; }
        .mg-field { margin-bottom: 14px; }
        .mg-field label { display: block; font-size: 11px; font-weight: 700;
          letter-spacing: .1em; text-transform: uppercase; opacity: .55; margin-bottom: 6px; }
        .mg-field input, .mg-field select, .mg-field textarea {
          width: 100%; padding: 10px 12px; border-radius: 10px; font-size: 14px;
          font-family: inherit; color: inherit;
          border: 1px solid var(--line, rgba(242,237,230,.16)); background: rgba(255,255,255,.04);
        }
        [data-theme="paper"] .mg-field input, [data-theme="paper"] .mg-field select,
        [data-theme="paper"] .mg-field textarea { background: #fff; }
        .mg-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .mg-err { font-size: 12.5px; color: #ef4444; margin: 0 0 12px; }
        .mg-sheet-actions { display: flex; gap: 8px; margin-top: 6px; }
        .mg-check { display: flex; align-items: flex-start; gap: 9px; font-size: 13px;
          line-height: 1.45; cursor: pointer; margin-bottom: 16px; }
        .mg-check input { margin-top: 2px; }

        @media (max-width: 640px) {
          .mg { padding: 24px 16px 80px; }
          /* auto-fill's 290px floor overflows a 320px viewport once page
             padding is subtracted — force single column below that width. */
          .mg-grid { grid-template-columns: 1fr; }
          .mg-tabs button, .mg-btn { min-height: 44px; box-sizing: border-box; }
          .mg-field input, .mg-field select, .mg-field textarea { min-height: 44px; box-sizing: border-box; }
          .mg-field textarea { min-height: 80px; }
          .mg-sheet { padding: 20px 16px; }
        }
      `}</style>
    </main>
  );
}

function Empty({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div className="mg-empty">
      <h3>{title}</h3>
      <p>{body}</p>
      <Link className="mg-btn" href={href}>{cta}</Link>
    </div>
  );
}

// ── Edit ─────────────────────────────────────────────────────────
function EditSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const [title, setTitle] = useState(game.title);
  const [date, setDate] = useState(toLocalInput(game.event_date));
  const [fee, setFee] = useState(String(game.fee));
  const [max, setMax] = useState(String(game.max_players));
  const [notes, setNotes] = useState(game.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await updateHostedGame({
        eventId: game.id,
        title,
        event_date: new Date(date).toISOString(),
        fee: Number(fee) || 0,
        max_players: Number(max) || game.max_players,
        notes: notes || null,
      });
      if (isActionError(res)) { setErr(res.message); setBusy(false); return; }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save changes.");
      setBusy(false);
    }
  }

  return (
    <div className="mg-scrim" onClick={onClose}>
      <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Edit game</h3>
        <p className="hint">
          Players who joined are told automatically if you change the time.
        </p>

        {err && <p className="mg-err">{err}</p>}

        <div className="mg-field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="mg-field">
          <label>Date &amp; time</label>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="mg-row2">
          <div className="mg-field">
            <label>Fee (Rs)</label>
            <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="mg-field">
            <label>Max players</label>
            <input type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
        </div>
        <div className="mg-field">
          <label>Note for players</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Bring a dark shirt, parking is behind the gate…" />
        </div>

        <div className="mg-sheet-actions">
          <button className="mg-btn" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save changes
          </button>
          <button className="mg-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Invite ───────────────────────────────────────────────────────
function InviteSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const [hostPays, setHostPays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const emails = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const res = await invitePlayers({ eventId: game.id, emails, hostPays });
      if (isActionError(res)) { setErr(res.message); setBusy(false); return; }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send invites.");
      setBusy(false);
    }
  }

  return (
    <div className="mg-scrim" onClick={onClose}>
      <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Invite players</h3>
        <p className="hint">
          {game.slots_remaining} spot{game.slots_remaining === 1 ? "" : "s"} left in {game.title}.
          They&apos;ll get an email with the details.
        </p>

        {err && <p className="mg-err">{err}</p>}

        <div className="mg-field">
          <label>Email addresses</label>
          <textarea rows={3} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder="ram@example.com, sita@example.com" />
        </div>

        <label className="mg-check">
          <input type="checkbox" checked={hostPays} onChange={(e) => setHostPays(e.target.checked)} />
          <span>
            I&apos;m covering their spots.
            <br />
            <span style={{ opacity: .6, fontSize: 12 }}>
              The usual setup — you book and settle up with them later.
            </span>
          </span>
        </label>

        <div className="mg-sheet-actions">
          <button className="mg-btn" onClick={send} disabled={busy}>
            {busy ? <Loader2 size={13} /> : <Mail size={13} />} Send invites
          </button>
          <button className="mg-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit a court booking (contact + reschedule) ──────────────────
function EditBookingSheet({
  booking, courts, onClose,
}: { booking: CourtBookingRow; courts: CourtOption[]; onClose: () => void }) {
  const locked = !["unpaid", "rejected"].includes(booking.payment_status) || !isFuture(booking.starts_at);
  const [name, setName] = useState(booking.customer_name ?? "");
  const [phone, setPhone] = useState(booking.phone ?? "");
  const [courtId, setCourtId] = useState(booking.court_id);
  const [date, setDate] = useState(toLocalInput(booking.starts_at));
  const durHours = Math.max(
    0.5,
    Math.round(((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / HOUR_MS) * 2) / 2
  );
  const [dur, setDur] = useState(String(durHours));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);

  const timeChanged =
    courtId !== booking.court_id || new Date(date).toISOString() !== new Date(booking.starts_at).toISOString()
    || Number(dur) !== durHours;

  async function save() {
    setBusy(true); setErr(null); setPriceNote(null);
    try {
      const startsAt = timeChanged ? new Date(date).toISOString() : null;
      const endsAt = timeChanged
        ? new Date(new Date(date).getTime() + Number(dur) * HOUR_MS).toISOString()
        : null;
      const res = await editCourtBooking({
        id: booking.id,
        customerName: name.trim() !== (booking.customer_name ?? "") ? name.trim() : null,
        phone: phone.trim() !== (booking.phone ?? "") ? phone.trim() : null,
        courtId: timeChanged && courtId !== booking.court_id ? courtId : null,
        startsAt, endsAt,
      });
      if (isActionError(res)) { setErr(res.message); setBusy(false); return; }
      if (timeChanged && Number(res.price) !== Number(booking.price)) {
        setPriceNote(`New price: Rs ${Number(res.price)}`);
        setBusy(false);
        return; // let them see the price change before closing
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save changes.");
      setBusy(false);
    }
  }

  return (
    <div className="mg-scrim" onClick={onClose}>
      <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Edit booking</h3>
        <p className="hint">
          {booking.courts?.name ?? "Court"} · {booking.venues?.name ?? ""}
        </p>

        {err && <p className="mg-err">{err}</p>}
        {priceNote && <p className="mg-err" style={{ color: "#d97706" }}>{priceNote} — saved. Close when ready.</p>}

        <div className="mg-field">
          <label>Name on the booking</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="mg-field">
          <label>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
        </div>

        {locked ? (
          <p className="mg-note">
            This booking is paid or already underway, so the court and time can&apos;t be
            changed here — ask the venue if you need to move it.
          </p>
        ) : (
          <>
            {courts.length > 1 && (
              <div className="mg-field">
                <label>Court</label>
                <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mg-row2">
              <div className="mg-field">
                <label>Date &amp; time</label>
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="mg-field">
                <label>Hours</label>
                <select value={dur} onChange={(e) => setDur(e.target.value)}>
                  {["0.5", "1", "1.5", "2", "3"].map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="mg-sheet-actions">
          <button className="mg-btn" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save changes
          </button>
          <button className="mg-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit my entry on a game I joined ─────────────────────────────
function EditJoinSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const [name, setName] = useState(game.myPlayerName ?? "");
  const [phone, setPhone] = useState(game.myPhone ?? "");
  const [position, setPosition] = useState(game.myPosition ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await editGameJoin({
        bookingId: game.bookingId!,
        playerName: name.trim() !== (game.myPlayerName ?? "") ? name.trim() : null,
        phone: phone.trim() !== (game.myPhone ?? "") ? phone.trim() : null,
        position: position.trim() !== (game.myPosition ?? "") ? position.trim() : null,
      });
      if (isActionError(res)) { setErr(res.message); setBusy(false); return; }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save changes.");
      setBusy(false);
    }
  }

  return (
    <div className="mg-scrim" onClick={onClose}>
      <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>My details</h3>
        <p className="hint">How you show up on {game.title} to the host and other players.</p>

        {err && <p className="mg-err">{err}</p>}

        <div className="mg-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="mg-field">
          <label>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
        </div>
        <div className="mg-field">
          <label>Position <span style={{ opacity: .5, textTransform: "none" }}>(optional)</span></label>
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Keeper, defender…" />
        </div>

        <div className="mg-sheet-actions">
          <button className="mg-btn" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save
          </button>
          <button className="mg-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
