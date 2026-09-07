import {
  Bell, UserPlus, UserMinus, Zap, Calendar, Users, MessageCircle, Receipt,
  ShieldCheck, ShieldX, Wallet, Clock3, AlertTriangle, XCircle,
} from "lucide-react";
import type { Notification } from "@/lib/hooks/useNotifications";

/** Shared icon map for the bell dropdown and the /notifications page. */
export function NotificationIcon({ kind, size = 16 }: { kind: Notification["kind"]; size?: number }) {
  switch (kind) {
    case "joined": return <UserPlus size={size} />;
    case "left": return <UserMinus size={size} />;
    case "spots_needed": return <Zap size={size} />;
    case "event": return <Calendar size={size} />;
    case "friend_request": return <Users size={size} />;
    case "friend_accepted": return <MessageCircle size={size} />;
    case "payment_submitted": return <Receipt size={size} />;
    case "payment_approved": return <ShieldCheck size={size} />;
    case "payment_rejected": return <ShieldX size={size} />;
    case "game_join_requested": return <Users size={size} />;
    case "game_join_rejected": return <XCircle size={size} />;
    case "game_payment_required":
    case "game_payment_reminder": return <Wallet size={size} />;
    case "game_payment_submitted":
    case "game_host_payment_submitted": return <Receipt size={size} />;
    case "game_payment_verified": return <ShieldCheck size={size} />;
    case "game_payment_rejected": return <AlertTriangle size={size} />;
    case "game_payment_expired":
    case "game_host_payment_expired": return <Clock3 size={size} />;
    case "game_payment_cash_selected": return <Wallet size={size} />;
    case "game_published":
    case "game_joined": return <Calendar size={size} />;
    case "game_left":
    case "game_cancelled": return <UserMinus size={size} />;
    case "tournament_published":
    case "tournament_announcement": return <Calendar size={size} />;
    case "tournament_registration_submitted": return <Receipt size={size} />;
    case "tournament_payment_verified": return <ShieldCheck size={size} />;
    case "tournament_payment_rejected": return <ShieldX size={size} />;
    default: return <Bell size={size} />;
  }
}

export function notificationTimeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
