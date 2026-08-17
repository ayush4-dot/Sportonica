import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import "../../p/profile.css";

export const dynamic = "force-dynamic";

const KTM = "Asia/Kathmandu";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KTM });

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", pending_verification: "Awaiting verification", rejected: "Rejected", unpaid: "Unpaid",
  collected: "Paid to host", pending: "Owed to host",
};

// Read-only, consolidated view of the same payment data already visible
// piecemeal in /my-games (court bookings) and on individual Play Together
// game pages (game_players contribution) — no new payment logic, just one
// place to see all of it. See supabase/payments.sql and
// supabase/play_together_payments.sql for the underlying state machines.
export default async function PaymentsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?redirect=/profile/payments");

  const [{ data: courtBookings }, { data: gamePlayers }] = await Promise.all([
    sb.from("court_bookings")
      .select("id, starts_at, price, payment_status, courts(name, sport), venues(name)")
      .eq("user_id", user.id)
      .order("starts_at", { ascending: false })
      .limit(50),
    sb.from("game_players")
      .select("id, contribution_amount, contribution_status, status, joined_at, games(sport, venues(name))")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(50),
  ]);

  type CourtRow = { id: string; starts_at: string; price: number; payment_status: string; courts: { name: string; sport: string } | null; venues: { name: string } | null };
  type GameRow = { id: string; contribution_amount: number; contribution_status: string; status: string; joined_at: string; games: { sport: string; venues: { name: string } | null } | null };

  const rows = [
    ...((courtBookings ?? []) as unknown as CourtRow[]).map((b) => ({
      key: `cb-${b.id}`,
      label: `${b.courts?.sport ?? "Court"} · ${b.venues?.name ?? "Venue"}`,
      when: when(b.starts_at),
      amount: Number(b.price) || 0,
      status: STATUS_LABEL[b.payment_status] ?? b.payment_status,
      paidToPlatform: true,
    })),
    ...((gamePlayers ?? []) as unknown as GameRow[])
      .filter((g) => g.status === "joined" || g.status === "payment_pending" || g.status === "payment_verification_pending" || g.status === "payment_rejected")
      .map((g) => ({
        key: `gp-${g.id}`,
        label: `${g.games?.sport ?? "Game"} · ${g.games?.venues?.name ?? "Venue"} (Play Together)`,
        when: when(g.joined_at),
        amount: Number(g.contribution_amount) || 0,
        status: g.status === "joined"
          ? (STATUS_LABEL[g.contribution_status] ?? g.contribution_status)
          : g.status === "payment_pending" ? "Payment required"
          : g.status === "payment_verification_pending" ? "Awaiting host verification"
          : "Payment not verified",
        paidToPlatform: false,
      })),
  ];

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ maxWidth: 720 }}>
        <Link href="/profile" className="pf-back"><ArrowLeft size={15} /> Profile</Link>
        <h1 className="pf-hub-name" style={{ marginTop: 18 }}>Payments</h1>
        <p className="pf-hub-tag">Court bookings paid to Sportonica, and Play Together contributions paid to hosts.</p>

        <section className="pf-sec" style={{ marginTop: 40 }}>
          {rows.length === 0 ? (
            <div className="pf-empty">No payments yet.</div>
          ) : (
            <div className="pf-hub-list">
              {rows.map((r) => (
                <div key={r.key} className="pf-hub-row" style={{ cursor: "default" }}>
                  <div style={{ flex: 1 }}>
                    <div className="pf-hub-row-label">{r.label}</div>
                    <div style={{ fontSize: 12, color: "var(--pf-faint)", marginTop: 2 }}>{r.when}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>Rs {r.amount}</div>
                    <div style={{ fontSize: 12, color: "var(--pf-faint)", marginTop: 2 }}>{r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
