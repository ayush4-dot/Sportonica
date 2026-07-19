"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, UserX, LogIn } from "lucide-react";
import { setBookingState } from "@/lib/admin/actions";
import type { CourtBooking, Court } from "@/lib/admin/types";
import { BookingBadge, money, timeRange, dayLabel } from "../ui";

export default function BookingsTable({ bookings, courts }: { bookings: CourtBooking[]; courts: Court[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "checked_in" | "no_show">("all");

  function act(b: CourtBooking, state: string) {
    setBusyId(b.id);
    startTransition(async () => {
      await setBookingState(b.id, b.venue_id, state);
      setBusyId(null);
      router.refresh();
    });
  }

  const filtered = bookings.filter((b) => {
    if (filter === "upcoming") return new Date(b.starts_at) > new Date();
    if (filter === "checked_in") return b.state === "checked_in";
    if (filter === "no_show") return b.state === "no_show";
    return true;
  });

  return (
    <div className="adm-card">
      <div className="adm-flex" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "upcoming", "checked_in", "no_show"] as const).map((f) => (
          <div key={f} className={`adm-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "checked_in" ? "checked in" : f === "no_show" ? "no-shows" : f}
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="adm-dim" style={{ fontSize: 13, padding: "20px 0" }}>No bookings match this filter.</div>
      ) : (
        <table className="adm-table">
          <thead>
            <tr><th>When</th><th>Court</th><th>Customer</th><th>Amount</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const court = courts.find((c) => c.id === b.court_id);
              const past = new Date(b.ends_at) < new Date();
              const canCheckIn = ["reserved", "paid", "confirmed"].includes(b.state);
              return (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{dayLabel(b.starts_at)}</div>
                    <div className="adm-num adm-dim" style={{ fontSize: 11 }}>{timeRange(b.starts_at, b.ends_at)}</div>
                  </td>
                  <td>{court?.name ?? "—"}<div className="adm-dim" style={{ fontSize: 11 }}>{court?.sport}</div></td>
                  <td>{b.customer_name ?? "Player"}<div className="adm-dim" style={{ fontSize: 11 }}>{b.source}</div></td>
                  <td className="adm-num">{money(Number(b.price))}</td>
                  <td><BookingBadge state={b.state} /></td>
                  <td>
                    <div className="adm-flex" style={{ gap: 6, justifyContent: "flex-end" }}>
                      {canCheckIn && (
                        <button className="adm-btn sm ghost" disabled={pending && busyId === b.id}
                          onClick={() => act(b, "checked_in")} title="Check in">
                          <LogIn size={13} />
                        </button>
                      )}
                      {b.state === "checked_in" && (
                        <button className="adm-btn sm ghost" onClick={() => act(b, "played")} title="Mark played">
                          <Check size={13} />
                        </button>
                      )}
                      {past && canCheckIn && (
                        <button className="adm-btn sm ghost danger" onClick={() => act(b, "no_show")} title="No-show">
                          <UserX size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
