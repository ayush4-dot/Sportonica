import Link from "next/link";
import { Users, ArrowRight, MapPin, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

// Sample groups so the page has life. These become a real DB table next.
const GROUPS = [
  { name: "Baneshwor Ballers", sport: "Futsal", area: "New Baneshwor", day: "Tuesdays · 7 PM", members: 14, cap: 16, color: "#2E7D5B" },
  { name: "Patan Pistons", sport: "Basketball", area: "Pulchowk", day: "Saturdays · 5 PM", members: 9, cap: 12, color: "#FFC93C" },
  { name: "Lalitpur Smashers", sport: "Badminton", area: "Jhamsikhel", day: "Sun & Wed · 6 AM", members: 8, cap: 10, color: "#a855f7" },
  { name: "Thamel FC", sport: "Football", area: "Sorhakhutte", day: "Fridays · 6 PM", members: 18, cap: 22, color: "#22c55e" },
  { name: "Kirtipur Kings", sport: "Cricket", area: "Kirtipur", day: "Sundays · 8 AM", members: 15, cap: 20, color: "#f97316" },
  { name: "Sanepa Setters", sport: "Volleyball", area: "Sanepa", day: "Thursdays · 5 PM", members: 7, cap: 12, color: "#3b82f6" },
];

export default function LeaguePage() {
  return (
    <div className="play">
      <div className="play-wrap">
        <div className="play-hero">
          <div className="play-eyebrow">Squads & communities</div>
          <h1>Find your regular crew.</h1>
          <p>
            The best games are the ones that come around every week. Join a squad near you,
            show up, and never scramble for players again.
          </p>
        </div>

        <div className="play-sec-head">
          <h2>Groups near you</h2>
          <span className="count">preview</span>
        </div>

        <div className="play-grid">
          {GROUPS.map((g, i) => {
            const pct = Math.round((g.members / g.cap) * 100);
            return (
              <div key={g.name} className="venue-card" style={{ cursor: "default", animationDelay: `${0.1 + i * 0.06}s` }}>
                <div style={{ padding: "22px 22px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 13, background: `${g.color}22`,
                      border: `1px solid ${g.color}55`, display: "grid", placeItems: "center", color: g.color,
                    }}>
                      <Users size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 700 }}>{g.name}</h3>
                      <span className="venue-tag" style={{ marginTop: 4, display: "inline-block" }}>{g.sport}</span>
                    </div>
                  </div>

                  <p className="venue-meta" style={{ margin: "0 0 6px" }}>
                    <MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{g.area}
                  </p>
                  <p className="venue-meta" style={{ margin: 0 }}>
                    <Calendar size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{g.day}
                  </p>

                  {/* fill bar */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
                      <span>{g.members}/{g.cap} members</span>
                      <span>{g.cap - g.members} spots left</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--ink-3)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: g.color, borderRadius: 999 }} />
                    </div>
                  </div>

                  <button className="play-btn ghost" style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>
                    Join squad <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 40, padding: "20px 24px", borderRadius: 16,
          background: "rgba(255,201,60,0.07)", border: "1px solid rgba(255,201,60,0.2)",
          fontSize: 14, color: "var(--dim)", textAlign: "center",
        }}>
          Squads are a preview — joining and creating your own crew goes live soon.{" "}
          <Link href="/create" style={{ color: "var(--sodium)", fontWeight: 700, textDecoration: "none" }}>Book a game now →</Link>
        </div>
      </div>
    </div>
  );
}
