import type { PricingRule } from "./pricing";

/**
 * Mirrors the `court_price` SQL function so the booking screen can show
 * the right number as you pick slots. The database stays authoritative
 * at the moment of booking — this is for display.
 */

const toMins = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The rule that wins for a given court, day and start time. */
export function ruleFor(
  rules: PricingRule[],
  courtId: string,
  dateStr: string,          // "YYYY-MM-DD"
  startMins: number
): PricingRule | null {
  // getDay() on a date-only string is parsed as UTC; add midday to be safe.
  const dow = new Date(`${dateStr}T12:00:00`).getDay();

  const matches = rules.filter((r) => {
    if (r.court_id !== courtId || !r.active) return false;
    if (Array.isArray(r.days) && r.days.length && !r.days.includes(dow)) return false;
    const from = toMins(r.start_time);
    const to = toMins(r.end_time);
    if (from != null && startMins < from) return false;
    if (to != null && startMins >= to) return false;
    return true;
  });

  if (!matches.length) return null;
  return matches.reduce((a, b) => (b.priority > a.priority ? b : a));
}

export type Priced = {
  base: number;        // what it would cost with no rule
  price: number;       // what it actually costs
  rule: PricingRule | null;
  saved: number;       // positive when the player pays less
  isPeak: boolean;
};

export function priceFor(
  basePerHour: number,
  hours: number,
  rules: PricingRule[],
  courtId: string,
  dateStr: string,
  startMins: number
): Priced {
  const base = Math.round(basePerHour * hours);
  const rule = ruleFor(rules, courtId, dateStr, startMins);
  if (!rule) return { base, price: base, rule: null, saved: 0, isPeak: false };

  let price = base;
  if (rule.kind === "multiplier") price = base * Number(rule.amount);
  else if (rule.kind === "fixed") price = Number(rule.amount) * hours;
  else if (rule.kind === "discount_pct") price = base * (1 - Number(rule.amount) / 100);

  price = Math.round(price);
  return {
    base,
    price,
    rule,
    saved: Math.max(0, base - price),
    isPeak: price > base,
  };
}

/** Human label for an offer, e.g. "20% off" or "Rs 1500/hr". */
export function offerLabel(r: PricingRule): string {
  if (r.kind === "discount_pct") return `${Number(r.amount)}% OFF`;
  if (r.kind === "fixed") return `Rs ${Number(r.amount)}/hr`;
  const pct = Math.round((Number(r.amount) - 1) * 100);
  return pct > 0 ? `+${pct}% peak` : `${Math.abs(pct)}% off`;
}

/** When it applies, in words. */
export function whenLabel(r: PricingRule): string {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const all = !r.days || r.days.length === 7;
  const days = all ? "Every day" : r.days.map((d) => DAYS[d]).join(", ");
  const t = (s: string | null) => (s ? s.slice(0, 5) : null);
  const from = t(r.start_time);
  const to = t(r.end_time);
  const time = from && to ? `${from}–${to}` : from ? `from ${from}` : to ? `until ${to}` : "all day";
  return `${days} · ${time}`;
}
