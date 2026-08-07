"use client";

import { SPORT_NAMES as SPORTS, SPORT_COLORS as SPORT_COLOR } from "@/lib/sports";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CalendarPlus, MapPin } from "lucide-react";
import { createOfficialEvent } from "@/lib/events/actions";
import { parseMapsUrl } from "@/lib/admin/location";



// Used in two places: venue admin (kind="venue_event", venue preset) and
// platform console (kind="platform_event", free venue text).
export default function EventForm({
  kind, venues, defaultOrganizer,
}: {
  kind: "venue_event" | "platform_event";
  venues?: { id: string; name: string }[];  // venue owner's venues, if any
  defaultOrganizer: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Futsal");
  const [venueId, setVenueId] = useState(venues?.[0]?.id ?? "");
  const [venueName, setVenueName] = useState(venues?.[0]?.name ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [skill, setSkill] = useState("any");
  const [fee, setFee] = useState(200);
  const [desc, setDesc] = useState("");
  const [organizer, setOrganizer] = useState(defaultOrganizer);
  const [mapsUrl, setMapsUrl] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function captureLocation() {
    if (!mapsUrl.trim()) return;
    setLocBusy(true); setLocMsg(null);
    startTransition(async () => {
      try {
        const res = await parseMapsUrl(mapsUrl);
        setCoords({ lat: res.lat, lng: res.lng });
        setMapsUrl(res.url);
        setLocMsg("Location pinned ✓");
      } catch (e) {
        setLocMsg(e instanceof Error ? e.message : "Couldn't read that link.");
      } finally {
        setLocBusy(false);
      }
    });
  }

  function submit() {
    setErr(null);
    if (!title.trim() || !date) { setErr("Add a title and date."); return; }
    const iso = `${date}T${time}:00+05:45`;
    startTransition(async () => {
      try {
        await createOfficialEvent({
          kind, title: title.trim(), sport,
          venue_name: kind === "venue_event" ? venueName : (venueName || "Multiple venues"),
          venue_id: kind === "venue_event" ? venueId : null,
          event_date: iso, max_players: maxPlayers, fee,
          description: desc.trim(), organizer_name: organizer.trim() || defaultOrganizer,
          skill_level: skill,
          venue_lat: coords?.lat ?? null,
          venue_lng: coords?.lng ?? null,
        });
        setDone(true);
        setTimeout(() => { setDone(false); router.push("/discover"); }, 1200);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't create the event.");
      }
    });
  }

  if (done) {
    return (
      <div className="ev-card" style={{ textAlign: "center", padding: 40 }}>
        <Check size={30} style={{ color: "#2E7D5B", marginBottom: 12 }} />
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 22, fontWeight: 800 }}>Event is live</div>
        <div style={{ opacity: 0.6, fontSize: 13.5, marginTop: 6 }}>It&apos;s on discover now. Taking you there…</div>
      </div>
    );
  }

  return (
    <div className="ev-card" style={{ maxWidth: 560 }}>
      <div className="ev-field">
        <label>Event title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tuesday Ladies' Night 5-a-side" />
      </div>

      <div className="ev-row">
        <div className="ev-field">
          <label>Sport</label>
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {kind === "venue_event" && venues && venues.length > 0 ? (
          <div className="ev-field">
            <label>Venue</label>
            <select value={venueId} onChange={(e) => {
              setVenueId(e.target.value);
              setVenueName(venues.find((v) => v.id === e.target.value)?.name ?? "");
            }}>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="ev-field">
            <label>Venue / location</label>
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="e.g. Maitighar Futsal" />
          </div>
        )}
      </div>

      <div className="ev-row">
        <div className="ev-field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>Start time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="ev-row">
        <div className="ev-field">
          <label>Spots</label>
          <input type="number" min={2} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
        </div>
        <div className="ev-field">
          <label>Entry fee (Rs)</label>
          <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
        </div>
      </div>

      <div className="ev-field">
        <label>Who is this for?</label>
        <select value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="any">Anyone — all levels welcome</option>
          <option value="beginner">Beginners</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced players</option>
        </select>
      </div>

      <div className="ev-field">
        <label>Organizer name (shown on the event)</label>
        <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
      </div>

      {/* Location — venue events inherit the venue's pin; platform events paste one */}
      {kind === "platform_event" && (
        <div className="ev-field">
          <label>Location (paste a Google Maps link)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), captureLocation())}
            />
            <button type="button" className="ev-btn" style={{ padding: "0 16px", marginTop: 0 }}
              onClick={captureLocation} disabled={locBusy || !mapsUrl.trim()}>
              {locBusy ? "…" : "Pin"}
            </button>
          </div>
          {locMsg && (
            <div style={{ fontSize: 12, marginTop: 6, color: coords ? "#2E7D5B" : "#006241", display: "flex", alignItems: "center", gap: 5 }}>
              {coords && <MapPin size={12} />}{locMsg}
              {coords && <span className="dt-mono" style={{ opacity: 0.6 }}> {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>}
            </div>
          )}
        </div>
      )}

      <div className="ev-field">
        <label>Description</label>
        <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Who's it for, what to bring, rules…" />
      </div>

      {err && <div className="ev-err">{err}</div>}

      <button className="ev-btn" onClick={submit} disabled={pending}>
        <CalendarPlus size={15} /> {pending ? "Publishing…" : "Publish event"}
      </button>
    </div>
  );
}
