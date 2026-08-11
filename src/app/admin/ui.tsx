import type { BookingState, VerificationStatus } from "@/lib/admin/types";

export function Topbar({ title, crumb, action }: { title: string; crumb?: string; action?: React.ReactNode }) {
  return (
    <div className="adm-topbar">
      <div>
        {crumb && <div className="adm-topbar-crumb">{crumb}</div>}
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label, value, unit, accent, delta,
}: { label: string; value: string | number; unit?: string; accent?: string; delta?: { dir: "up" | "down"; text: string } }) {
  return (
    <div className="adm-stat" style={accent ? ({ ["--tile-accent" as string]: accent } as React.CSSProperties) : undefined}>
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-val">
        {value}{unit && <small> {unit}</small>}
      </div>
      {delta && <div className={`adm-stat-delta ${delta.dir}`}>{delta.dir === "up" ? "▲" : "▼"} {delta.text}</div>}
    </div>
  );
}

const BOOKING_BADGE: Record<BookingState, { cls: string; label: string }> = {
  reserved:  { cls: "warn",    label: "reserved" },
  paid:      { cls: "ok",      label: "paid" },
  confirmed: { cls: "ok",      label: "confirmed" },
  checked_in:{ cls: "ok",      label: "checked in" },
  played:    { cls: "neutral", label: "played" },
  dropped:   { cls: "neutral", label: "dropped" },
  no_show:   { cls: "danger",  label: "no-show" },
  refunded:  { cls: "neutral", label: "refunded" },
  cancelled: { cls: "danger",  label: "cancelled" },
};

export function BookingBadge({ state }: { state: BookingState }) {
  const b = BOOKING_BADGE[state];
  return <span className={`adm-badge ${b.cls}`}>{b.label}</span>;
}

const PAYMENT_BADGE: Record<string, { cls: string; label: string }> = {
  unpaid:                { cls: "neutral", label: "unpaid" },
  pending_verification:  { cls: "warn",    label: "pending verification" },
  paid:                  { cls: "ok",      label: "paid" },
  rejected:              { cls: "danger",  label: "rejected" },
  partial:               { cls: "warn",    label: "partial" },
  refunded:              { cls: "neutral", label: "refunded" },
};

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="adm-dim">—</span>;
  const b = PAYMENT_BADGE[status] ?? { cls: "neutral", label: status };
  return <span className={`adm-badge ${b.cls}`}>{b.label}</span>;
}

export function VerifyBadge({ status }: { status: VerificationStatus }) {
  const map = {
    verified:   { cls: "ok", label: "verified" },
    pending:    { cls: "warn", label: "pending" },
    unverified: { cls: "neutral", label: "unverified" },
  } as const;
  const b = map[status];
  return <span className={`adm-badge ${b.cls}`}>{b.label}</span>;
}

export function money(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-IN");
}

export function timeRange(startIso: string, endIso: string) {
  const f = (d: string) =>
    new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });
  return `${f(startIso)}–${f(endIso)}`;
}

export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kathmandu" });
}
