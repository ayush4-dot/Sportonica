"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { createVenue } from "@/lib/admin/actions";

const SPORTS = ["Futsal", "Football", "Basketball", "Cricket", "Volleyball", "Badminton", "Tennis"];
const AMENITIES = ["Floodlights", "Parking", "Changing room", "Water", "Showers", "Seating", "Equipment rental"];
const TYPES = ["Futsal court", "Cricket ground", "Basketball court", "Multi-sport", "Badminton hall", "Tennis court"];

export default function VenueForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [sports, setSports] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);

  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Give your venue a name.");
    if (sports.length === 0) return setErr("Pick at least one sport.");
    startTransition(async () => {
      try {
        const v = await createVenue({
          name: name.trim(),
          venue_type: type,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          description: description.trim() || undefined,
          sports,
          amenities,
        });
        router.push(`/admin/venues/${v.id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="adm-body" style={{ maxWidth: 720 }}>
      <Link href="/admin/venues" className="adm-btn sm ghost" style={{ marginBottom: 18 }}>
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="adm-card">
        <div className="adm-card-t">Venue details</div>
        <div className="adm-card-sub">
          You can take bookings right away. A quick verification later removes your payout cap.
        </div>

        <div className="adm-field">
          <label className="adm-label">Venue name</label>
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maitighar Futsal Arena" />
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
            <input className="adm-input mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
          </div>
        </div>

        <div className="adm-field">
          <label className="adm-label">Address</label>
          <input className="adm-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ward, area, city" />
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
              <div key={a} className={`adm-chip ${amenities.includes(a) ? "on" : ""}`} onClick={() => toggle(amenities, setAmenities, a)}>
                {a}
              </div>
            ))}
          </div>
        </div>

        <div className="adm-field">
          <label className="adm-label">Description <span className="adm-dim">(optional)</span></label>
          <textarea className="adm-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What makes this venue great?" />
        </div>

        {err && <div className="adm-badge danger" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="adm-flex">
          <button className="adm-btn primary" onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create venue"}
          </button>
          <Link href="/admin/venues" className="adm-btn ghost">Cancel</Link>
        </div>
      </div>
    </div>
  );
}
