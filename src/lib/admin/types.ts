// Admin domain types — mirror the admin_schema.sql tables.

export type VerificationStatus = "unverified" | "pending" | "verified";
export type VenueStatus = "open" | "closed" | "maintenance";
export type StaffRole = "owner" | "manager" | "staff";
export type CourtStatus = "active" | "maintenance" | "inactive";
export type BlockReason = "manual" | "maintenance" | "walk_in" | "phone_booking" | "offline";
export type BookingState =
  | "reserved" | "paid" | "confirmed" | "checked_in"
  | "played" | "dropped" | "no_show" | "refunded" | "cancelled";
export type PayoutStatus = "pending" | "processing" | "settled" | "failed";
export type PricingKind = "multiplier" | "fixed" | "discount_pct";

export interface Venue {
  id: string;
  owner_id: string;
  name: string;
  venue_type: string;
  address: string | null;
  ward: number | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  phone: string | null;
  description: string | null;
  photos: string[];
  sports: string[];
  amenities: string[];
  verification_status: VerificationStatus;
  payout_cap: number | null;
  payout_schedule: "per_game" | "weekly";
  cancellation_policy: string;
  house_rules: string | null;
  status: VenueStatus;
  created_at: string;
  updated_at: string;
}

export interface Court {
  id: string;
  venue_id: string;
  name: string;
  sport: string;
  surface: string | null;
  capacity: number | null;
  base_price: number;
  status: CourtStatus;
  created_at: string;
  updated_at: string;
}

export interface CourtHours {
  id: string;
  court_id: string;
  dow: number; // 0=Sun..6=Sat
  open_time: string; // "06:00:00"
  close_time: string;
}

export interface PricingRule {
  id: string;
  court_id: string;
  label: string;
  kind: PricingKind;
  amount: number;
  days: number[];
  start_time: string | null;
  end_time: string | null;
  priority: number;
  auto_suggested: boolean;
  active: boolean;
  created_at: string;
}

export interface CourtBlock {
  id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
  reason: BlockReason;
  note: string | null;
  created_at: string;
}

export interface CourtBooking {
  id: string;
  court_id: string;
  venue_id: string;
  user_id: string | null;
  customer_name: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  state: BookingState;
  payment_status: "unpaid" | "paid" | "partial" | "refunded";
  source: "platform" | "walk_in" | "phone";
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  venue_id: string;
  gross: number;
  commission: number;
  net: number;
  method: "khalti" | "esewa" | "fonepay" | "bank";
  account: string | null;
  status: PayoutStatus;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SPORT_COLOR: Record<string, string> = {
  Futsal: "#2E7D5B",
  Football: "#22c55e",
  Basketball: "#FFC93C",
  Cricket: "#f97316",
  Volleyball: "#3b82f6",
  Badminton: "#a855f7",
  Tennis: "#ec4899",
  Running: "#60a5fa",
};
