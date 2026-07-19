"use client";

import { useState, useEffect } from "react";
import { useVenue } from "@/lib/hooks/useAdminData";
import { Building2, MapPin, Clock, Camera, Wifi, Car, Droplets, Zap as FloodLight, Users, Save, Plus, Trash2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import KhelumnaMap from "@/components/KhelumnaMap";

const paper  = "#F2EDE6";
const pink   = "#DE3163";
const turf   = "#2E7D5B";
const flood  = "#FFC93C";
const slate  = "#8A95A3";
const inkMid = "#1C2029";

const DAYS       = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const AMENITIES  = [
  { key: "parking",    label: "Parking",        icon: Car        },
  { key: "changing",   label: "Changing rooms", icon: Users      },
  { key: "floodlight", label: "Floodlights",    icon: FloodLight },
  { key: "water",      label: "Drinking water", icon: Droplets   },
  { key: "wifi",       label: "Wi-Fi",          icon: Wifi       },
];
const ALL_SPORTS = ["Futsal","Football","Basketball","Volleyball","Cricket","Badminton","Tennis"];

type DayHours = { open: string; close: string; closed: boolean };
const DEFAULT_HOURS: Record<string, DayHours> = Object.fromEntries(
  DAYS.map(d => [d, { open: "06:00", close: "22:00", closed: false }])
);

export default function VenuePage() {
  const { venue, loading, save } = useVenue();

  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [focusField, setFF]     = useState<string | null>(null);

  // Form state — pre-filled from venue once loaded
  const [name, setName]               = useState("");
  const [venueType, setVenueType]     = useState("Futsal court");
  const [address, setAddress]         = useState("");
  const [lat, setLat]                 = useState("");
  const [lng, setLng]                 = useState("");
  const [phone, setPhone]             = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus]           = useState<"open"|"closed"|"maintenance">("open");
  const [amenities, setAmenities]     = useState<string[]>([]);
  const [sports, setSports]           = useState<string[]>([]);
  const [hours, setHours]             = useState<Record<string, DayHours>>(DEFAULT_HOURS);

  // Populate form from DB
  useEffect(() => {
    if (!venue) return;
    setName(venue.name ?? "");
    setVenueType(venue.venue_type ?? "Futsal court");
    setAddress(venue.address ?? "");
    setLat(String(venue.lat ?? ""));
    setLng(String(venue.lng ?? ""));
    setPhone(venue.phone ?? "");
    setDescription(venue.description ?? "");
    setStatus(venue.status ?? "open");
    setAmenities(venue.amenities ?? []);
    setSports(venue.sports ?? []);
    setHours(venue.hours && Object.keys(venue.hours).length ? venue.hours as Record<string, DayHours> : DEFAULT_HOURS);
  }, [venue]);

  const handleSave = async () => {
    setSaving(true); setSaveErr(null);
    const { error } = await save({
      name, venue_type: venueType, address,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      phone, description, status, amenities, sports, hours,
    });
    setSaving(false);
    if (error) { setSaveErr(error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inp = (f: string): React.CSSProperties => ({
    width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)",
    border: `1.5px solid ${focusField === f ? pink : "rgba(255,255,255,0.08)"}`,
    borderRadius: "10px", color: paper, fontSize: "14px", fontFamily: "'Inter',sans-serif",
    outline: "none", boxSizing: "border-box" as const,
    boxShadow: focusField === f ? "0 0 0 3px rgba(222,49,99,0.12)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  });

  const statusColors: Record<string, string> = { open: turf, closed: "#ef4444", maintenance: flood };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: slate, padding: "40px 0" }}>
      <Loader2 size={18} style={{ animation: "spin-slow 1s linear infinite" }} /> Loading venue…
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "800px" }}>

      <div className="adm-section-header">
        <div>
          <h1 className="adm-page-title">Venue Profile</h1>
          <p className="adm-page-sub">{venue ? "Update your court details." : "Set up your venue to start accepting bookings."}</p>
        </div>
        <button className="adm-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} style={{ animation: "spin-slow 1s linear infinite" }} /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {saveErr && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "10px 14px" }}>
          <AlertCircle size={14} color="#ef4444" /> <span style={{ fontSize: "13px", color: "#ef4444" }}>{saveErr}</span>
        </div>
      )}

      {/* Status */}
      <div style={{ display: "flex", gap: "10px" }}>
        {(["open","closed","maintenance"] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{
            padding: "8px 18px", borderRadius: "100px", fontWeight: 700, fontSize: "13px",
            fontFamily: "'Inter',sans-serif", cursor: "pointer", transition: "all 0.15s",
            background: status === s ? `${statusColors[s]}22` : "rgba(255,255,255,0.05)",
            border: `1.5px solid ${status === s ? statusColors[s] : "rgba(255,255,255,0.08)"}`,
            color: status === s ? statusColors[s] : slate, textTransform: "capitalize" as const,
          }}>
            {s === "open" ? "🟢" : s === "closed" ? "🔴" : "🟡"} {s}
          </button>
        ))}
      </div>

      {/* Basic info */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <Building2 size={16} color={flood} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Basic Info</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="adm-label">Venue Name</label>
            <input className="adm-input" value={name} onChange={e => setName(e.target.value)} style={inp("name")} onFocus={() => setFF("name")} onBlur={() => setFF(null)} placeholder="e.g. Balaju Sports Complex" />
          </div>
          <div>
            <label className="adm-label">Venue type</label>
            <select className="adm-select" value={venueType} onChange={e => setVenueType(e.target.value)}>
              {["Futsal court","Basketball court","Cricket ground","Volleyball court","Badminton hall","Multi-sport complex"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="adm-label">Phone</label>
            <input className="adm-input" value={phone} onChange={e => setPhone(e.target.value)} style={inp("phone")} onFocus={() => setFF("phone")} onBlur={() => setFF(null)} placeholder="98XXXXXXXX" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="adm-label">Address</label>
            <input className="adm-input" value={address} onChange={e => setAddress(e.target.value)} style={inp("address")} onFocus={() => setFF("address")} onBlur={() => setFF(null)} placeholder="e.g. Balaju, Kathmandu 44600" />
            {address && (
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "6px", fontSize: "12px", color: pink, textDecoration: "none", fontWeight: 600 }}>
                <MapPin size={12} /> View on Google Maps ↗
              </a>
            )}
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="adm-label"><MapPin size={12} style={{ display: "inline" }} /> Pin your venue on the map</label>
            <p style={{ fontSize: "12px", color: slate, marginBottom: "8px" }}>Click anywhere on the map to drop a pin and auto-fill the coordinates.</p>
            <div style={{ borderRadius: "12px", overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.08)", height: "260px" }}>
              <KhelumnaMap
                center={lat && lng ? [Number(lat), Number(lng)] : [27.7172, 85.324]}
                zoom={14}
                height="260px"
                pickMode
                pins={lat && lng ? [{ id: "venue", lat: Number(lat), lng: Number(lng), label: name || "Your venue", color: "#DE3163" }] : []}
                onPick={(pickedLat, pickedLng) => {
                  setLat(pickedLat.toFixed(6));
                  setLng(pickedLng.toFixed(6));
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
              <div>
                <label className="adm-label">Latitude</label>
                <input className="adm-input" value={lat} onChange={e => setLat(e.target.value)} style={inp("lat")} onFocus={() => setFF("lat")} onBlur={() => setFF(null)} placeholder="27.7172" />
              </div>
              <div>
                <label className="adm-label">Longitude</label>
                <input className="adm-input" value={lng} onChange={e => setLng(e.target.value)} style={inp("lng")} onFocus={() => setFF("lng")} onBlur={() => setFF(null)} placeholder="85.3240" />
              </div>
            </div>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="adm-label">Description</label>
            <textarea className="adm-input" rows={3} value={description} onChange={e => setDescription(e.target.value)}
              style={{ ...inp("desc"), resize: "vertical" } as React.CSSProperties}
              onFocus={() => setFF("desc")} onBlur={() => setFF(null)} placeholder="Tell players what's special about your venue…" />
          </div>
        </div>
      </div>

      {/* Sports */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <Users size={16} color={pink} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Sports Supported</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "8px" }}>
          {ALL_SPORTS.map(s => (
            <button key={s} onClick={() => setSports(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])} style={{
              padding: "7px 16px", borderRadius: "100px", fontWeight: 600, fontSize: "13px",
              fontFamily: "'Inter',sans-serif", cursor: "pointer", transition: "all 0.15s",
              background: sports.includes(s) ? "rgba(46,125,91,0.15)" : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${sports.includes(s) ? turf : "rgba(255,255,255,0.08)"}`,
              color: sports.includes(s) ? turf : slate,
            }}>
              {sports.includes(s) && "✓ "}{s}
            </button>
          ))}
        </div>
      </div>

      {/* Operating hours */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <Clock size={16} color={flood} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Operating Hours</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {DAYS.map(day => {
            const h = hours[day] ?? { open: "06:00", close: "22:00", closed: false };
            return (
              <div key={day} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 100px", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: h.closed ? slate : paper }}>{day}</span>
                <input type="time" value={h.open} disabled={h.closed}
                  onChange={e => setHours(p => ({ ...p, [day]: { ...p[day], open: e.target.value } }))}
                  style={{ ...inp(`${day}-o`), opacity: h.closed ? 0.4 : 1 }}
                  onFocus={() => setFF(`${day}-o`)} onBlur={() => setFF(null)} />
                <input type="time" value={h.close} disabled={h.closed}
                  onChange={e => setHours(p => ({ ...p, [day]: { ...p[day], close: e.target.value } }))}
                  style={{ ...inp(`${day}-c`), opacity: h.closed ? 0.4 : 1 }}
                  onFocus={() => setFF(`${day}-c`)} onBlur={() => setFF(null)} />
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button onClick={() => setHours(p => ({ ...p, [day]: { ...p[day], closed: !p[day].closed } }))}
                    className={`adm-toggle${h.closed ? "" : " on"}`} aria-label="toggle" />
                  <span style={{ fontSize: "11px", color: slate }}>{h.closed ? "Closed" : "Open"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Amenities */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <MapPin size={16} color={turf} />
          <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Amenities</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: "10px" }}>
          {AMENITIES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setAmenities(p => p.includes(key) ? p.filter(a => a !== key) : [...p, key])} style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px",
              borderRadius: "10px", cursor: "pointer", transition: "all 0.15s", border: "none",
              background: amenities.includes(key) ? "rgba(46,125,91,0.15)" : inkMid,
              outline: amenities.includes(key) ? `1.5px solid ${turf}` : "1.5px solid rgba(255,255,255,0.07)",
            }}>
              <Icon size={15} color={amenities.includes(key) ? turf : slate} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: amenities.includes(key) ? turf : slate, fontFamily: "'Inter',sans-serif" }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Photos placeholder */}
      <div className="adm-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Camera size={16} color={pink} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: paper }}>Court Photos</span>
          </div>
          <button className="adm-btn-secondary" style={{ fontSize: "13px", padding: "7px 14px" }}>
            <Plus size={14} /> Add photo
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: "10px" }}>
          <div style={{ aspectRatio: "4/3", borderRadius: "10px", border: "1.5px dashed rgba(255,255,255,0.12)", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }}>
            <Plus size={20} color={slate} />
            <span style={{ fontSize: "11px", color: slate }}>Upload photo</span>
          </div>
          <div style={{ aspectRatio: "4/3", borderRadius: "10px", background: inkMid, border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "6px", position: "relative" as const }}>
            <Camera size={22} color={slate} />
            <span style={{ fontSize: "11px", color: slate }}>Court photo</span>
            <button style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(239,68,68,0.15)", border: "none", borderRadius: "6px", padding: "4px", cursor: "pointer", color: "#ef4444", display: "flex" }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
