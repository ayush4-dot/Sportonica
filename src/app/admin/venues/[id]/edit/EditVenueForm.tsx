"use client";

import { SPORT_NAMES as SPORTS, SPORT_COLORS as SPORT_COLOR } from "@/lib/sports";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Link2, X, Check, Trash2, Star, MapPin, ExternalLink } from "lucide-react";
import { updateVenue, uploadVenuePhoto, addVenuePhotoUrl, removeVenuePhoto } from "@/lib/admin/actions";
import { saveVenueLocation } from "@/lib/admin/location";
import type { Venue } from "@/lib/admin/types";


const AMENITIES = ["Floodlights", "Parking", "Changing room", "Water", "Showers", "Seating", "Equipment rental"];
const TYPES = ["Futsal court", "Cricket ground", "Basketball court", "Multi-sport", "Badminton hall", "Tennis court"];

export default function EditVenueForm({ venue }: { venue: Venue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(venue.name);
  const [type, setType] = useState(venue.venue_type);
  const [address, setAddress] = useState(venue.address ?? "");
  const [phone, setPhone] = useState(venue.phone ?? "");
  const [description, setDescription] = useState(venue.description ?? "");
  const [sports, setSports] = useState<string[]>(venue.sports ?? []);
  const [amenities, setAmenities] = useState<string[]>(venue.amenities ?? []);
  const [photos, setPhotos] = useState<string[]>(venue.photos ?? []);
  const [urlInput, setUrlInput] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Location (from pasted Google Maps link)
  const [mapsUrl, setMapsUrl] = useState(venue.maps_url ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    venue.lat != null && venue.lng != null ? { lat: venue.lat, lng: venue.lng } : null
  );
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  function captureLocation() {
    if (!mapsUrl.trim()) return;
    setLocBusy(true); setLocErr(null);
    startTransition(async () => {
      try {
        const res = await saveVenueLocation(venue.id, mapsUrl);
        setCoords({ lat: res.lat, lng: res.lng });
        setMapsUrl(res.url);
        router.refresh();
      } catch (e) {
        setLocErr(e instanceof Error ? e.message : "Couldn't read that link.");
      } finally {
        setLocBusy(false);
      }
    });
  }

  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg("Image must be under 5 MB."); return; }
    setUploading(true); setMsg(null);
    startTransition(async () => {
      try {
        const url = await uploadVenuePhoto(venue.id, file);
        setPhotos((p) => [...p, url]);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Upload failed. Is the storage bucket set up?");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function addUrl() {
    if (!urlInput.trim()) return;
    const url = urlInput.trim();
    startTransition(async () => {
      try {
        await addVenuePhotoUrl(venue.id, url);
        setPhotos((p) => [...p, url]);
        setUrlInput(""); setShowUrl(false);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Couldn't add that URL.");
      }
    });
  }

  function removePhoto(url: string) {
    startTransition(async () => {
      await removeVenuePhoto(venue.id, url);
      setPhotos((p) => p.filter((x) => x !== url));
    });
  }

  function makeCover(url: string) {
    // Move this photo to front — it becomes the cover shown everywhere.
    const reordered = [url, ...photos.filter((p) => p !== url)];
    setPhotos(reordered);
    startTransition(async () => { await updateVenue(venue.id, { photos: reordered }); });
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        await updateVenue(venue.id, {
          name: name.trim(), venue_type: type, address: address.trim() || null,
          phone: phone.trim() || null, description: description.trim() || null,
          sports, amenities,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* PHOTOS */}
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-t">Photos</div>
        <div className="adm-card-sub">The first photo is your cover — it shows to players browsing. Drag isn&apos;t needed; use &quot;Make cover&quot;.</div>

        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
            {photos.map((url, i) => (
              <div key={url} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "4/3", border: i === 0 ? "2px solid var(--a-sodium)" : "1px solid var(--a-line)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {i === 0 && (
                  <span style={{ position: "absolute", top: 6, left: 6, fontSize: 10, fontWeight: 700, background: "var(--a-sodium)", color: "#0B0D11", padding: "2px 7px", borderRadius: 5, fontFamily: "var(--a-mono)" }}>COVER</span>
                )}
                <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 5 }}>
                  {i !== 0 && (
                    <button className="adm-btn sm ghost" style={{ padding: "4px 7px" }} title="Make cover"
                      onClick={() => makeCover(url)}><Star size={12} /></button>
                  )}
                  <button className="adm-btn sm ghost danger" style={{ padding: "4px 7px" }} title="Remove"
                    onClick={() => removePhoto(url)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="adm-flex" style={{ gap: 10, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFilePick} style={{ display: "none" }} />
          <button className="adm-btn sm primary" onClick={() => fileRef.current?.click()} disabled={uploading || pending}>
            <Upload size={14} /> {uploading ? "Uploading…" : "Upload photo"}
          </button>
          <button className="adm-btn sm" onClick={() => setShowUrl((v) => !v)}><Link2 size={14} /> Paste URL</button>
        </div>

        {showUrl && (
          <div className="adm-flex" style={{ gap: 8, marginTop: 12 }}>
            <input className="adm-input" placeholder="https://…/photo.jpg" value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
            <button className="adm-btn sm primary" onClick={addUrl}>Add</button>
          </div>
        )}

        {photos.length === 0 && !showUrl && (
          <p className="adm-dim" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            No photos yet. A good cover photo makes players far more likely to book.
          </p>
        )}
      </div>

      {/* LOCATION */}
      <div className="adm-card" style={{ marginBottom: 20 }}>
        <div className="adm-card-t"><MapPin size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Location</div>
        <div className="adm-card-sub">
          On Google Maps, find your venue → tap <b>Share</b> → <b>Copy link</b> → paste it here. We pin your exact spot — no typing coordinates.
        </div>

        <div className="adm-flex" style={{ gap: 8, alignItems: "flex-start" }}>
          <input
            className="adm-input"
            placeholder="https://maps.app.goo.gl/…  or  https://www.google.com/maps/…"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && captureLocation()}
          />
          <button className="adm-btn primary" onClick={captureLocation} disabled={locBusy || !mapsUrl.trim()}>
            {locBusy ? "Reading…" : "Capture"}
          </button>
        </div>

        {locErr && <div className="adm-badge danger" style={{ marginTop: 12 }}>{locErr}</div>}

        {coords && (
          <div style={{
            marginTop: 14, padding: "12px 14px", borderRadius: 11,
            background: "rgba(46,125,91,0.1)", border: "1px solid rgba(46,125,91,0.3)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div className="adm-flex" style={{ gap: 8 }}>
              <Check size={16} style={{ color: "var(--a-turf)" }} />
              <span style={{ fontSize: 13 }}>
                Location pinned ·{" "}
                <span className="adm-mono adm-dim" style={{ fontSize: 12 }}>
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              </span>
            </div>
            <a
              className="adm-btn sm ghost"
              href={mapsUrl || `https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
              target="_blank" rel="noopener noreferrer"
            >
              <ExternalLink size={13} /> Preview
            </a>
          </div>
        )}
      </div>

      {/* DETAILS */}
      <div className="adm-card">
        <div className="adm-card-t">Venue details</div>
        <div className="adm-card-sub">Update anything and save.</div>

        <div className="adm-field">
          <label className="adm-label">Venue name</label>
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Type</label>
            <select className="adm-select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label">Phone</label>
            <input className="adm-input mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Address</label>
          <input className="adm-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="adm-field">
          <label className="adm-label">Sports offered</label>
          <div className="adm-chips">
            {SPORTS.map((s) => (
              <div key={s} className={`adm-chip ${sports.includes(s) ? "on" : ""}`} onClick={() => toggle(sports, setSports, s)}>
                {sports.includes(s) && <Check size={12} style={{ verticalAlign: -1, marginRight: 3 }} />}{s}
              </div>
            ))}
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Amenities</label>
          <div className="adm-chips">
            {AMENITIES.map((a) => (
              <div key={a} className={`adm-chip ${amenities.includes(a) ? "on" : ""}`} onClick={() => toggle(amenities, setAmenities, a)}>{a}</div>
            ))}
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Description</label>
          <textarea className="adm-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {msg && <div className="adm-badge danger" style={{ marginBottom: 14 }}>{msg}</div>}

        <div className="adm-flex">
          <button className="adm-btn primary" onClick={save} disabled={pending}>
            {saved ? <><Check size={15} /> Saved</> : pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
