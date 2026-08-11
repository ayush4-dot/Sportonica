// ================================================================
// Email templates. Pure functions: data in → {subject, body} out.
// No database, no sending. Keeping copy separate from logic means you
// can reword an email without touching the booking code.
// ================================================================

import type { Mail } from "./mailer";

const KTM = "Asia/Kathmandu";

export function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: KTM,
  });
}
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

// ── 1. Player booked a court ────────────────────────────────────
export function playerBooked(p: {
  to: string; playerName: string; venue: string; court: string;
  startsAt: string; endsAt: string; price: number;
}): Mail {
  return {
    to: p.to,
    subject: `Booked: ${p.court} at ${p.venue}, ${fmtWhen(p.startsAt)}`,
    body: `Hi ${p.playerName},

Your court is locked in.

  Venue    ${p.venue}
  Court    ${p.court}
  When     ${fmtWhen(p.startsAt)} – ${fmtWhen(p.endsAt).split(", ").pop()}
  Paid     ${rs(p.price)}

See you on the pitch.

— Khelam Na`,
  };
}

// ── 2. Venue owner: new booking came in ─────────────────────────
export function venueNewBooking(p: {
  to: string; venue: string; court: string; playerName: string;
  startsAt: string; price: number;
}): Mail {
  return {
    to: p.to,
    subject: `New booking: ${p.court}, ${fmtWhen(p.startsAt)}`,
    body: `A slot at ${p.venue} was just booked.

  Court    ${p.court}
  When     ${fmtWhen(p.startsAt)}
  Player   ${p.playerName}
  Amount   ${rs(p.price)}

It's already on your calendar in the venue console.

— Khelam Na`,
  };
}

// ── 3. Host opened their game to players ────────────────────────
export function hostGameLive(p: {
  to: string; hostName: string; sport: string; venue: string;
  startsAt: string; spots: number; perHead: number; link: string;
}): Mail {
  return {
    to: p.to,
    subject: `Your ${p.sport} game is live — ${p.spots} spots open`,
    body: `Hi ${p.hostName},

Your game is up on Khelam Na and players can join now.

  Sport    ${p.sport}
  Venue    ${p.venue}
  When     ${fmtWhen(p.startsAt)}
  Open     ${p.spots} spot${p.spots !== 1 ? "s" : ""}
  Cost     ${rs(p.perHead)} per head

Share it around: ${p.link}

We'll email you as players join.

— Khelam Na`,
  };
}

// ── 4. Player joined someone's game ─────────────────────────────
export function playerJoined(p: {
  to: string; playerName: string; sport: string; venue: string;
  startsAt: string; fee: number;
}): Mail {
  return {
    to: p.to,
    subject: `You're in: ${p.sport} at ${p.venue}, ${fmtWhen(p.startsAt)}`,
    body: `Hi ${p.playerName},

You've joined the game.

  Sport    ${p.sport}
  Venue    ${p.venue}
  When     ${fmtWhen(p.startsAt)}
  Paid     ${rs(p.fee)}

Turn up. Your show-up rate is watching.

— Khelam Na`,
  };
}

// ── 5. Host: someone joined your game ───────────────────────────
export function hostSomeoneJoined(p: {
  to: string; hostName: string; joinerName: string; sport: string;
  startsAt: string; spotsLeft: number;
}): Mail {
  const full = p.spotsLeft <= 0;
  return {
    to: p.to,
    subject: full
      ? `Your ${p.sport} game is FULL`
      : `${p.joinerName} joined — ${p.spotsLeft} spot${p.spotsLeft !== 1 ? "s" : ""} left`,
    body: `Hi ${p.hostName},

${p.joinerName} just joined your ${p.sport} game on ${fmtWhen(p.startsAt)}.

${full
  ? "That's a full side. Game on."
  : `${p.spotsLeft} spot${p.spotsLeft !== 1 ? "s" : ""} still open.`}

— Khelam Na`,
  };
}

// ── 6. Admin: a customer submitted a payment for verification ────
export function paymentSubmitted(p: {
  to: string; bookingLabel: string; customerName: string;
  amount: number; method: string; transactionId: string;
}): Mail {
  return {
    to: p.to,
    subject: `New payment to verify — ${p.bookingLabel}`,
    body: `🔔 New Payment Verification

  Booking       ${p.bookingLabel}
  Customer      ${p.customerName}
  Amount        ${rs(p.amount)}
  Method        ${p.method}
  Transaction   ${p.transactionId}

Review it in the Payment Verification Center: /platform/payments

— Khelam Na`,
  };
}

// ── 7. Customer: payment approved, booking confirmed ─────────────
export function paymentApproved(p: {
  to: string; playerName: string; bookingLabel: string; amount: number;
  venue: string; startsAt: string; endsAt: string;
}): Mail {
  return {
    to: p.to,
    subject: `Booking confirmed — ${p.bookingLabel}`,
    body: `Hi ${p.playerName},

Payment verified. Your booking is confirmed.

  Booking   ${p.bookingLabel}
  Amount    ${rs(p.amount)}
  Venue     ${p.venue}
  When      ${fmtWhen(p.startsAt)} – ${fmtWhen(p.endsAt).split(", ").pop()}

See you on the pitch.

— Khelam Na`,
  };
}

// ── 8. Customer: payment rejected ─────────────────────────────────
export function paymentRejected(p: {
  to: string; playerName: string; bookingLabel: string; reason: string;
}): Mail {
  return {
    to: p.to,
    subject: `Payment verification failed — ${p.bookingLabel}`,
    body: `Hi ${p.playerName},

Payment could not be verified.

  Booking  ${p.bookingLabel}
  Reason   ${p.reason}

Please submit a valid payment or contact support.

— Khelam Na`,
  };
}
