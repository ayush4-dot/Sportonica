"use client";

import { SPORT_NAMES as SPORTS, SPORT_COLORS as SPORT_COLOR } from "@/lib/sports";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Check, ExternalLink, Globe, Lock } from "lucide-react";
import { updateProfile, claimUsername, uploadAvatar } from "@/lib/profile/actions";
import type { PlayerProfile } from "@/lib/profile/queries";



export default function ProfileEditor({ profile, origin }: { profile: PlayerProfile; origin: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.full_name ?? profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [city, setCity] = useState(profile.city ?? "Kathmandu");
  const [sports, setSports] = useState<string[]>(profile.sports ?? []);
  const [isPublic, setIsPublic] = useState(profile.is_public ?? true);
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [username, setUsername] = useState(profile.username);
  const [unInput, setUnInput] = useState(profile.username);
  const [editingUn, setEditingUn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const toggleSport = (s: string) =>
    setSports((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg("Image must be under 5 MB."); return; }
    setMsg(null);
    startTransition(async () => {
      try {
        const url = await uploadAvatar(file);
        setAvatar(url);
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function saveUsername() {
    setMsg(null);
    startTransition(async () => {
      try {
        const u = await claimUsername(unInput);
        setUsername(u);
        setEditingUn(false);
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Couldn't claim that name.");
      }
    });
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        await updateProfile({ full_name: name.trim(), bio: bio.trim(), city: city.trim(), sports, is_public: isPublic });
        setOk(true);
        setTimeout(() => setOk(false), 1800);
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  const publicUrl = `${origin}/p/${username}`;

  return (
    <div className="pf-wrap" style={{ maxWidth: 640 }}>
      {/* Your link */}
      <div className="pf-card">
        <h2 className="pf-card-t">Your player card</h2>
        {!editingUn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, opacity: 0.8 }}>{publicUrl}</code>
            <button className="pf-btn ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setEditingUn(true)}>Edit</button>
            <Link className="pf-btn ghost" style={{ padding: "6px 12px", fontSize: 12 }} href={`/p/${username}`}>
              <ExternalLink size={12} /> View
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, opacity: 0.6 }}>{origin}/p/</span>
            <input className="pf-input" value={unInput} onChange={(e) => setUnInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveUsername()}
              style={{ width: 160, background: "transparent", border: "1px solid var(--pf-line)", borderRadius: 9, padding: "8px 10px", color: "inherit", fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }} />
            <button className="pf-btn" style={{ padding: "7px 14px", fontSize: 12 }} onClick={saveUsername} disabled={pending}>Save</button>
            <button className="pf-btn ghost" style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => { setEditingUn(false); setUnInput(username); }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Avatar + details */}
      <div className="pf-card">
        <h2 className="pf-card-t">Profile</h2>

        <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 22 }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pf-avatar" src={avatar} alt="" style={{ width: 78, height: 78, borderRadius: 20 }} />
          ) : (
            <div className="pf-avatar" style={{ width: 78, height: 78, borderRadius: 20, fontSize: 30 }}>
              {(name || "P").charAt(0).toUpperCase()}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickAvatar} style={{ display: "none" }} />
          <button className="pf-btn ghost" onClick={() => fileRef.current?.click()} disabled={pending}>
            <Upload size={14} /> {pending ? "Uploading…" : "Change photo"}
          </button>
        </div>

        <Field label="Name">
          <input className="pf-in" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="City">
          <input className="pf-in" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Bio">
          <textarea className="pf-in" rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Left wing. Tuesdays and Fridays. Always late, never misses." />
        </Field>

        <Field label="Sports you play">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SPORTS.map((s) => (
              <button key={s} onClick={() => toggleSport(s)}
                style={{
                  padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                  background: sports.includes(s) ? "rgba(255,201,60,0.14)" : "transparent",
                  color: sports.includes(s) ? "#FFC93C" : "var(--pf-dim)",
                  border: `1px solid ${sports.includes(s) ? "rgba(255,201,60,0.4)" : "var(--pf-line)"}`,
                }}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        {/* Privacy */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 0 4px", borderTop: "1px solid var(--pf-line)", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              {isPublic ? <Globe size={14} /> : <Lock size={14} />}
              {isPublic ? "Public card" : "Private card"}
            </div>
            <div style={{ fontSize: 12, color: "var(--pf-dim)", marginTop: 3, maxWidth: 380 }}>
              {isPublic
                ? "Anyone with your link can see your stats. Your phone and email are never shown."
                : "Only you can see your card. Your link won't work for others."}
            </div>
          </div>
          <button onClick={() => setIsPublic((v) => !v)} aria-label="Toggle privacy"
            style={{ width: 46, height: 27, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0, position: "relative",
              background: isPublic ? "#2E7D5B" : "rgba(128,128,128,0.35)", transition: "background 0.3s" }}>
            <span style={{ position: "absolute", top: 3, left: isPublic ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left 0.3s cubic-bezier(0.22,1,0.36,1)" }} />
          </button>
        </div>

        {msg && <div style={{ color: "#DE3163", fontSize: 12.5, marginTop: 14 }}>{msg}</div>}

        <div style={{ marginTop: 20 }}>
          <button className="pf-btn" onClick={save} disabled={pending}>
            {ok ? <><Check size={15} /> Saved</> : pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <style>{`
        .pf-in {
          width: 100%; box-sizing: border-box;
          background: transparent; border: 1px solid var(--pf-line);
          border-radius: 10px; padding: 10px 12px; color: inherit;
          font-family: inherit; font-size: 14px;
        }
        .pf-in:focus { outline: none; border-color: #FFC93C; box-shadow: 0 0 0 3px rgba(255,201,60,0.12); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--pf-dim)", marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}
