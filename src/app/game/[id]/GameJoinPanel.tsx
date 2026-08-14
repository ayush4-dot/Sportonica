"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Share2 } from "lucide-react";
import { joinGame } from "@/lib/play/actions";
import { confirmFreeBooking } from "@/lib/payments/actions";
import { isActionError } from "@/lib/actionError";
import PaymentStep from "@/components/payments/PaymentStep";

export default function GameJoinPanel({
  gameId, venueId, sport, fee, slotsLeft, alreadyIn, isHost, venue, mapsHref, eventDate,
}: {
  gameId: string; venueId: string | null; sport: string; fee: number;
  slotsLeft: number; alreadyIn: boolean; isHost: boolean;
  venue: string; mapsHref: string | null; eventDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState(alreadyIn);
  const [awaitingPayment, setAwaitingPayment] = useState<{ id: string; amount: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState("");

  function join() {
    if (!/^[0-9+\-\s]{7,15}$/.test(phone.trim())) { setErr("Enter a valid phone number."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        const booking = await joinGame({ event_id: gameId, venue_id: venueId, sport, phone: phone.trim() });
        if (isActionError(booking)) {
          if (booking.message === "UNAUTHORIZED") { router.push(`/login?redirect=/game/${gameId}`); return; }
          if (booking.message.includes("ALREADY_JOINED")) { setJoined(true); return; }
          if (booking.message.includes("GAME_FULL")) { setErr("This game just filled up."); return; }
          setErr(booking.message);
          return;
        }
        const amount = Number(booking?.amount) || 0;
        if (amount > 0) {
          setAwaitingPayment({ id: booking.id, amount });
        } else {
          const confirmed = await confirmFreeBooking("event_booking", booking.id);
          if (isActionError(confirmed)) { setErr(confirmed.message); return; }
          setJoined(true);
        }
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not join.");
      }
    });
  }

  async function share() {
    const url = `${window.location.origin}/game/${gameId}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${sport} at ${venue}`, url }); } catch { /* dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* blocked */ }
  }

  return (
    <div className="gm-card gm-join">
      <div className="gm-join-fee">
        {fee === 0 ? "Free" : <>Rs {fee}<span>/player</span></>}
      </div>
      <div className="gm-join-slots">
        {slotsLeft > 0 ? `${slotsLeft} spot${slotsLeft !== 1 ? "s" : ""} left` : "Game full"}
      </div>

      {err && <div className="gm-err">{err}</div>}

      {awaitingPayment ? (
        <PaymentStep
          bookingType="event_booking"
          bookingId={awaitingPayment.id}
          amount={awaitingPayment.amount}
          summary={[
            { label: "Game", value: sport },
            { label: "Venue", value: venue },
            { label: "When", value: new Date(eventDate).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" }) },
          ]}
        />
      ) : isHost ? (
        <div className="gm-join-note">You&apos;re hosting this game.</div>
      ) : joined ? (
        <div className="gm-joined"><Check size={16} /> You&apos;re in</div>
      ) : (
        <>
          {slotsLeft > 0 && (
            <input
              type="tel" inputMode="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="gm-pay-b"
              style={{ width: "100%", boxSizing: "border-box", textAlign: "left", fontWeight: 500, marginBottom: 10, cursor: "text" }}
            />
          )}
          <button className="gm-btn" onClick={join} disabled={pending || slotsLeft <= 0}>
            {pending ? "Joining…" : slotsLeft <= 0 ? "Game full" : fee === 0 ? "Join game" : `Reserve spot · Rs ${fee}`}
          </button>
        </>
      )}

      <div className="gm-join-actions">
        <button className="gm-btn ghost" onClick={share}>
          <Share2 size={14} /> {copied ? "Link copied" : "Share"}
        </button>
        {mapsHref && (
          <a className="gm-btn ghost" href={mapsHref} target="_blank" rel="noopener noreferrer">
            <MapPin size={14} /> Directions
          </a>
        )}
      </div>
    </div>
  );
}
