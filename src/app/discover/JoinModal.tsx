"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Check, MapPin, Users, Wallet } from "lucide-react";
import { joinGame } from "@/lib/play/actions";
import type { EventRow } from "@/lib/hooks/useEvents";

export default function JoinModal({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pay, setPay] = useState<"khalti" | "esewa">("khalti");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function confirm() {
    setErr(null);
    startTransition(async () => {
      try {
        await joinGame({
          event_id: event.id,
          venue_id: event.venue_id ?? null,
          sport: event.sport,
          amount: Number(event.fee) || 0,
        });
        setDone(true);
        router.refresh();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Could not join.";
        if (m.includes("ALREADY_JOINED")) setErr("You're already in this game.");
        else if (m.includes("GAME_FULL")) setErr("This game just filled up.");
        else setErr(m);
      }
    });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(6,7,10,0.72)", zIndex: 400, display: "grid", placeItems: "center", padding: 20, backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 400, background: "#14171E", border: "1px solid rgba(242,237,230,0.12)", borderRadius: 18, padding: 26, color: "#F2EDE6", fontFamily: "'Inter',sans-serif" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px" }}>
              {done ? "You're in!" : "Join this game"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(242,237,230,0.6)", marginTop: 2 }}>{event.sport} · {event.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(242,237,230,0.6)", cursor: "pointer" }}><X size={20} /></button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#2E7D5B", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
              <Check size={30} color="#fff" />
            </div>
            <p style={{ fontSize: 14, color: "rgba(242,237,230,0.75)", margin: "0 0 20px", lineHeight: 1.5 }}>
              You&apos;ve joined {event.title}. See you on the pitch! Your spot is confirmed.
            </p>
            <button onClick={onClose} style={{ width: "100%", background: "#FFC93C", color: "#0B0D11", border: "none", borderRadius: 11, padding: 13, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ background: "#0B0D11", borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 13.5 }}>
              <Row icon={<MapPin size={14} />} label={event.venue} />
              <Row icon={<Users size={14} />} label={`${event.slots_remaining} spot${event.slots_remaining !== 1 ? "s" : ""} left of ${event.max_players}`} />
              {event.venue_lat && event.venue_lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#FFC93C", textDecoration: "none", marginTop: 6, fontWeight: 600 }}
                >
                  <MapPin size={12} /> Open in Google Maps →
                </a>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(242,237,230,0.1)" }}>
                <span style={{ color: "rgba(242,237,230,0.6)" }}>Your share</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: "#FFC93C" }}>Rs {Number(event.fee) || 0}</span>
              </div>
            </div>

            <div style={{ marginBottom: 8, fontSize: 12.5, color: "rgba(242,237,230,0.6)" }}>
              <Wallet size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Pay with
              <span style={{ marginLeft: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FFC93C", background: "rgba(255,201,60,0.1)", border: "1px solid rgba(255,201,60,0.3)", padding: "3px 8px", borderRadius: 6 }}>demo</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {(["khalti", "esewa"] as const).map((m) => (
                <button key={m} onClick={() => setPay(m)}
                  style={{ flex: 1, padding: 12, borderRadius: 11, border: `1px solid ${pay === m ? "#FFC93C" : "rgba(242,237,230,0.15)"}`, background: pay === m ? "rgba(255,201,60,0.1)" : "#0B0D11", color: "#F2EDE6", cursor: "pointer", fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>
                  {m}
                </button>
              ))}
            </div>

            {err && <div style={{ color: "#DE3163", fontSize: 13, marginBottom: 12 }}>{err}</div>}

            <button onClick={confirm} disabled={pending || event.slots_remaining === 0}
              style={{ width: "100%", background: "#FFC93C", color: "#0B0D11", border: "none", borderRadius: 11, padding: 14, fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: pending || event.slots_remaining === 0 ? 0.6 : 1 }}>
              {pending ? "Joining…" : event.slots_remaining === 0 ? "Game full" : `Pay Rs ${Number(event.fee) || 0} & join`}
            </button>
            <p style={{ fontSize: 11.5, textAlign: "center", color: "rgba(242,237,230,0.45)", marginTop: 10, marginBottom: 0 }}>
              Payment is simulated in this preview.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "3px 0", color: "rgba(242,237,230,0.8)" }}>
      <span style={{ color: "rgba(242,237,230,0.5)" }}>{icon}</span>{label}
    </div>
  );
}
