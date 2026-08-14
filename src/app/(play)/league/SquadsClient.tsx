"use client";

import { SPORT_NAMES as SPORTS, SPORT_COLORS as SPORT_COLOR } from "@/lib/sports";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, ArrowRight, MapPin, Calendar, Plus, X, Check } from "lucide-react";
import { createSquad, joinSquad, leaveSquad } from "@/lib/squads/actions";
import { isActionError } from "@/lib/actionError";
import type { Squad } from "@/lib/squads/queries";




export default function SquadsClient({
  initialSquads, joinedIds,
}: { initialSquads: Squad[]; joinedIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [joined, setJoined] = useState<Set<string>>(new Set(joinedIds));
  const [showCreate, setShowCreate] = useState(false);

  function toggle(sq: Squad) {
    const isIn = joined.has(sq.id);
    startTransition(async () => {
      try {
        if (isIn) {
          const res = await leaveSquad(sq.id);
          if (isActionError(res)) {
            if (res.message === "UNAUTHORIZED") { router.push(`/login?redirect=/league`); return; }
            return;
          }
          joined.delete(sq.id);
        } else {
          const res = await joinSquad(sq.id);
          if (isActionError(res)) {
            if (res.message === "UNAUTHORIZED") { router.push(`/login?redirect=/league`); return; }
            return;
          }
          joined.add(sq.id);
        }
        setJoined(new Set(joined));
        router.refresh();
      } catch (e) {
        // Not logged in → send them to sign in, then back here.
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) {
          router.push(`/login?redirect=/league`);
          return;
        }
      }
    });
  }

  return (
    <>
      <div className="play-sec-head">
        <h2>Groups near you</h2>
        <button className="play-btn" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Make a group
        </button>
      </div>

      {initialSquads.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.6 }}>
          <Users size={30} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 15 }}>No groups yet. Be the first to make one.</p>
        </div>
      ) : (
        <div className="play-grid">
          {initialSquads.map((g, i) => {
            const color = g.color ?? SPORT_COLOR[g.sport] ?? "#2E7D5B";
            const cap = g.cap ?? 20;
            const pct = Math.min(Math.round((g.member_count / cap) * 100), 100);
            const isIn = joined.has(g.id);
            return (
              <div key={g.id} className="venue-card" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                <div style={{ padding: "22px 22px 20px" }}>
                  <Link href={`/league/${g.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 13, background: `${color}22`,
                        border: `1px solid ${color}55`, display: "grid", placeItems: "center", color,
                      }}>
                        <Users size={20} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 700 }}>{g.name}</h3>
                        <span className="venue-tag" style={{ marginTop: 4, display: "inline-block" }}>{g.sport}</span>
                      </div>
                    </div>
                    {g.area && (
                      <p className="venue-meta" style={{ margin: "0 0 6px" }}>
                        <MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{g.area}
                      </p>
                    )}
                    {g.schedule && (
                      <p className="venue-meta" style={{ margin: 0 }}>
                        <Calendar size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{g.schedule}
                      </p>
                    )}
                  </Link>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
                      <span>{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                      <span>{Math.max(cap - g.member_count, 0)} spots left</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--ink-3)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
                    </div>
                  </div>

                  <button
                    className={`play-btn ${isIn ? "" : "ghost"}`}
                    style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
                    onClick={() => toggle(g)}
                    disabled={pending}
                  >
                    {isIn ? <><Check size={15} /> Joined — tap to leave</> : <>Join group <ArrowRight size={15} /></>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); router.refresh(); }} />}
    </>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("Futsal");
  const [area, setArea] = useState("");
  const [schedule, setSchedule] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) { setErr("Give your group a name."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        const res = await createSquad({ name, sport, area, schedule, description, color: SPORT_COLOR[sport] });
        if (isActionError(res)) {
          if (res.message === "UNAUTHORIZED") { router.push("/login?redirect=/league"); return; }
          setErr(res.message);
          return;
        }
        onCreated();
      } catch (e) {
        if (e instanceof Error && e.message.includes("UNAUTHORIZED")) {
          router.push("/login?redirect=/league");
          return;
        }
        setErr(e instanceof Error ? e.message : "Couldn't create the group.");
      }
    });
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,7,10,0.72)", backdropFilter: "blur(6px)", zIndex: 400, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--ink-2, #14171E)", border: "1px solid rgba(242,237,230,0.12)", borderRadius: 18, padding: 26, color: "var(--paper, #F2EDE6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 800 }}>Make a group</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.6 }}><X size={20} /></button>
        </div>

        <Field label="Squad name">
          <input className="sq-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Baneshwor Ballers" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Sport">
            <select className="sq-in" value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Area">
            <input className="sq-in" value={area} onChange={(e) => setArea(e.target.value)} placeholder="New Baneshwor" />
          </Field>
        </div>
        <Field label="When you play">
          <input className="sq-in" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Tuesdays · 7 PM" />
        </Field>
        <Field label="About (optional)">
          <textarea className="sq-in" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Casual futsal crew, all levels welcome." />
        </Field>

        {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <button className="play-btn" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </button>

        <style>{`
          .sq-in { width: 100%; box-sizing: border-box; background: transparent; border: 1px solid rgba(128,128,128,0.28); border-radius: 10px; padding: 10px 12px; color: inherit; font-family: inherit; font-size: 14px; }
          .sq-in:focus { outline: none; border-color: #006241; }
          .sq-in option { background: #14171E; color: #F2EDE6; }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
