import type { ReactNode } from "react";
import {
  LayoutDashboard, Building2, CalendarClock, Ticket,
  Tag, Wallet, BarChart3, Users, Settings, Handshake, CalendarCheck,
} from "lucide-react";

export type NavItem = { href: string; label: string; desc: string; icon: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Single source of truth for admin navigation — the sidebar/drawer and
 * the Settings "all features" hub both read from this, so adding a
 * section here is the only edit needed to make it reachable everywhere.
 */
export const NAV: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/admin", label: "Overview", desc: "Today's bookings, revenue and venue health at a glance.", icon: <LayoutDashboard size={16} /> },
      { href: "/admin/calendar", label: "Calendar", desc: "See every court's day laid out hour by hour.", icon: <CalendarClock size={16} /> },
      { href: "/admin/partnerships", label: "Organizers", desc: "People who want to run tournaments at your venue.", icon: <Handshake size={16} /> },
      { href: "/admin/venue-bookings", label: "Venue bookings", desc: "Confirm or decline hosting each tournament, one at a time.", icon: <CalendarCheck size={16} /> },
      { href: "/admin/bookings", label: "Bookings", desc: "Every reservation across all your venues.", icon: <Ticket size={16} /> },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/venues", label: "Venues & courts", desc: "Add grounds, courts, photos and opening hours.", icon: <Building2 size={16} /> },
      { href: "/admin/pricing", label: "Pricing rules", desc: "Peak, happy-hour and weekend pricing per court.", icon: <Tag size={16} /> },
      { href: "/admin/staff", label: "Staff", desc: "Who else can access this venue's console.", icon: <Users size={16} /> },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/payouts", label: "Payouts", desc: "Scheduled settlements to your account.", icon: <Wallet size={16} /> },
      { href: "/admin/analytics", label: "Analytics", desc: "Revenue and booking trends over time.", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/admin/settings", label: "Settings", desc: "Your login, role and payout preferences.", icon: <Settings size={16} /> },
    ],
  },
];
