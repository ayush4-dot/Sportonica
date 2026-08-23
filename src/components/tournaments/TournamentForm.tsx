"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trophy } from "lucide-react";
import { SPORT_NAMES as SPORTS } from "@/lib/sports";
import { createTournament, updateTournamentDraft, publishTournament } from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS, TOURNAMENT_FORMATS } from "@/lib/tournaments/types";
import type { Tournament, TournamentFormat } from "@/lib/tournaments/types";

const KTM_OFFSET = "+05:45";
const toLocalDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const toLocalTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kathmandu" }) : "");
const combine = (date: string, time: string) => (date && time ? `${date}T${time}:00${KTM_OFFSET}` : "");

export default function TournamentForm({
  venues, existing, mode = "venue",
}: {
  venues: { id: string; name: string }[];
  existing?: Tournament;
  mode?: "venue" | "platform";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"draft" | "published" | null>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [sport, setSport] = useState(existing?.sport ?? "Futsal");
  const [venueId, setVenueId] = useState(existing?.venue_id ?? venues[0]?.id ?? "");
  const [organizerType, setOrganizerType] = useState<"venue" | "platform">(
    existing?.organizer_type ?? (mode === "platform" ? "platform" : "venue")
  );
  const [organizerName, setOrganizerName] = useState(existing?.organizer_name ?? "");
  const [bannerUrl, setBannerUrl] = useState(existing?.banner_url ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [contactPhone, setContactPhone] = useState(existing?.contact_phone ?? "");

  const [startsDate, setStartsDate] = useState(toLocalDate(existing?.starts_at));
  const [startsTime, setStartsTime] = useState(toLocalTime(existing?.starts_at) || "09:00");
  const [endsDate, setEndsDate] = useState(toLocalDate(existing?.ends_at));
  const [endsTime, setEndsTime] = useState(toLocalTime(existing?.ends_at) || "18:00");
  const [regOpenDate, setRegOpenDate] = useState(toLocalDate(existing?.registration_opens_at));
  const [regOpenTime, setRegOpenTime] = useState(toLocalTime(existing?.registration_opens_at) || "09:00");
  const [regCloseDate, setRegCloseDate] = useState(toLocalDate(existing?.registration_closes_at));
  const [regCloseTime, setRegCloseTime] = useState(toLocalTime(existing?.registration_closes_at) || "18:00");
  const [matchMins, setMatchMins] = useState(existing?.match_duration_mins ?? 45);

  const [format, setFormat] = useState<TournamentFormat>(existing?.format ?? "knockout");
  const [maxTeams, setMaxTeams] = useState(existing?.max_teams ?? 8);
  const [minPlayers, setMinPlayers] = useState(existing?.min_players_per_team ?? 5);
  const [maxPlayers, setMaxPlayers] = useState(existing?.max_players_per_team ?? 8);
  const [subLimit, setSubLimit] = useState(existing?.substitute_limit ?? 2);
  const [regMode, setRegMode] = useState<"team" | "individual">(existing?.registration_mode ?? "team");
  const [genderRule, setGenderRule] = useState(existing?.gender_rule ?? "");
  const [skillCategory, setSkillCategory] = useState(existing?.skill_category ?? "");

  const [fee, setFee] = useState(existing?.fee ?? 0);
  const [paymentInstructions, setPaymentInstructions] = useState(existing?.payment_instructions ?? "");
  const [refundPolicy, setRefundPolicy] = useState(existing?.refund_policy ?? "");

  const [prizeWinner, setPrizeWinner] = useState(existing?.prize_winner ?? "");
  const [prizeRunnerUp, setPrizeRunnerUp] = useState(existing?.prize_runner_up ?? "");
  const [prizeMvp, setPrizeMvp] = useState(existing?.prize_mvp ?? "");
  const [prizeOther, setPrizeOther] = useState(existing?.prize_other ?? "");

  const [rulesText, setRulesText] = useState(existing?.rules_text ?? "");
  const [equipmentNotes, setEquipmentNotes] = useState(existing?.equipment_notes ?? "");
  const [venueRules, setVenueRules] = useState(existing?.venue_rules ?? "");

  function payload() {
    const isSingleEvent = format === "single_event";
    return {
      venue_id: venueId,
      organizer_type: organizerType,
      organizer_name: organizerName.trim() || undefined,
      name: name.trim(),
      sport,
      banner_url: bannerUrl.trim() || undefined,
      description: description.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      starts_at: combine(startsDate, startsTime),
      ends_at: combine(endsDate, endsTime),
      registration_opens_at: combine(regOpenDate, regOpenTime),
      registration_closes_at: combine(regCloseDate, regCloseTime),
      match_duration_mins: matchMins,
      format,
      max_teams: maxTeams,
      min_players_per_team: isSingleEvent ? 1 : minPlayers,
      max_players_per_team: isSingleEvent ? 1 : maxPlayers,
      substitute_limit: isSingleEvent ? 0 : subLimit,
      registration_mode: regMode,
      gender_rule: genderRule.trim() || undefined,
      skill_category: skillCategory.trim() || undefined,
      fee,
      payment_instructions: paymentInstructions.trim() || undefined,
      refund_policy: refundPolicy.trim() || undefined,
      prize_winner: prizeWinner.trim() || undefined,
      prize_runner_up: prizeRunnerUp.trim() || undefined,
      prize_mvp: prizeMvp.trim() || undefined,
      prize_other: prizeOther.trim() || undefined,
      rules_text: rulesText.trim() || undefined,
      equipment_notes: equipmentNotes.trim() || undefined,
      venue_rules: venueRules.trim() || undefined,
    };
  }

  function validate(): string | null {
    if (!name.trim()) return "Give the tournament a name.";
    if (!venueId) return "Pick a venue.";
    if (!startsDate || !endsDate) return "Set a start and end date.";
    if (!regOpenDate || !regCloseDate) return "Set when registration opens and closes.";
    if (combine(regCloseDate, regCloseTime) > combine(startsDate, startsTime)) return "Registration must close before the tournament starts.";
    if (format !== "single_event" && maxPlayers < minPlayers) return "Max players per team can't be less than the minimum.";
    return null;
  }

  function saveDraft() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    startTransition(async () => {
      const result = existing
        ? await updateTournamentDraft(existing.id, payload())
        : await createTournament(payload());
      if (isActionError(result)) { setErr(result.message); return; }
      setDone("draft");
      setTimeout(() => router.push(`/admin/tournaments/${result.id}`), 900);
    });
  }

  function saveAndPublish() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    startTransition(async () => {
      const saved = existing
        ? await updateTournamentDraft(existing.id, payload())
        : await createTournament(payload());
      if (isActionError(saved)) { setErr(saved.message); return; }
      const published = await publishTournament(saved.id);
      if (isActionError(published)) { setErr(published.message); return; }
      setDone("published");
      setTimeout(() => router.push(`/admin/tournaments/${saved.id}`), 900);
    });
  }

  if (done) {
    return (
      <div className="ev-card" style={{ textAlign: "center", padding: 40 }}>
        <Check size={30} style={{ color: "#2E7D5B", marginBottom: 12 }} />
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 800 }}>
          {done === "published" ? "Sent for review" : "Draft saved"}
        </div>
        <div style={{ opacity: 0.6, fontSize: 13.5, marginTop: 6 }}>
          {done === "published"
            ? "Sportonica will review and publish it shortly."
            : "You can keep editing before publishing."}
        </div>
      </div>
    );
  }

  return (
    <div className="ev-card" style={{ maxWidth: 640 }}>
      <SectionTitle>Basic info</SectionTitle>
      <div className="ev-field">
        <label>Tournament name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kathmandu Futsal Cup 2026" />
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>Sport</label>
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="ev-field">
          <label>Venue</label>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>
      {mode === "platform" && (
        <div className="ev-row">
          <div className="ev-field">
            <label>Organizer</label>
            <select value={organizerType} onChange={(e) => setOrganizerType(e.target.value as "venue" | "platform")}>
              <option value="platform">Sportonica (platform-run)</option>
              <option value="venue">The venue itself</option>
            </select>
          </div>
          <div className="ev-field">
            <label>Organizer name{organizerType === "platform" ? "" : " (optional)"}</label>
            <input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} placeholder="Sportonica" />
          </div>
        </div>
      )}
      <div className="ev-field">
        <label>Banner image URL (optional)</label>
        <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="ev-field">
        <label>Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this tournament about?" />
      </div>
      <div className="ev-field">
        <label>Contact phone (shown to registered captains)</label>
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="98XXXXXXXX" />
      </div>

      <SectionTitle>Schedule</SectionTitle>
      <div className="ev-row">
        <div className="ev-field">
          <label>Starts</label>
          <input type="date" value={startsDate} onChange={(e) => setStartsDate(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>Start time</label>
          <input type="time" value={startsTime} onChange={(e) => setStartsTime(e.target.value)} />
        </div>
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>Ends</label>
          <input type="date" value={endsDate} onChange={(e) => setEndsDate(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>End time</label>
          <input type="time" value={endsTime} onChange={(e) => setEndsTime(e.target.value)} />
        </div>
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>Registration opens</label>
          <input type="date" value={regOpenDate} onChange={(e) => setRegOpenDate(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>Time</label>
          <input type="time" value={regOpenTime} onChange={(e) => setRegOpenTime(e.target.value)} />
        </div>
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>Registration closes</label>
          <input type="date" value={regCloseDate} onChange={(e) => setRegCloseDate(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>Time</label>
          <input type="time" value={regCloseTime} onChange={(e) => setRegCloseTime(e.target.value)} />
        </div>
      </div>
      <div className="ev-field">
        <label>Match duration (minutes)</label>
        <input type="number" min={10} value={matchMins} onChange={(e) => setMatchMins(Number(e.target.value))} />
      </div>

      <SectionTitle>Format & teams</SectionTitle>
      <div className="ev-field">
        <label>Format</label>
        <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
          {TOURNAMENT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
        </select>
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>{format === "single_event" ? "Max players" : "Max teams"}</label>
          <input type="number" min={2} value={maxTeams} onChange={(e) => setMaxTeams(Number(e.target.value))} />
        </div>
        {format !== "single_event" && (
          <div className="ev-field">
            <label>Substitute slots per team</label>
            <input type="number" min={0} value={subLimit} onChange={(e) => setSubLimit(Number(e.target.value))} />
          </div>
        )}
      </div>
      {format !== "single_event" && (
        <div className="ev-row">
          <div className="ev-field">
            <label>Min players per team</label>
            <input type="number" min={1} value={minPlayers} onChange={(e) => setMinPlayers(Number(e.target.value))} />
          </div>
          <div className="ev-field">
            <label>Max players per team</label>
            <input type="number" min={1} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
        </div>
      )}
      <div className="ev-row">
        <div className="ev-field">
          <label>Gender rule (optional)</label>
          <input value={genderRule} onChange={(e) => setGenderRule(e.target.value)} placeholder="Open, Men's, Women's…" />
        </div>
        <div className="ev-field">
          <label>Skill category (optional)</label>
          <input value={skillCategory} onChange={(e) => setSkillCategory(e.target.value)} placeholder="Open, Amateur, Pro…" />
        </div>
      </div>

      <SectionTitle>Registration & payment</SectionTitle>
      <div className="ev-field">
        <label>Entry fee per team (Rs — 0 for free)</label>
        <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
      </div>
      <div className="ev-field">
        <label>Payment instructions (optional)</label>
        <textarea rows={2} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="Any extra instructions shown at checkout." />
      </div>
      <div className="ev-field">
        <label>Refund policy (optional)</label>
        <textarea rows={2} value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)} />
      </div>

      <SectionTitle>Prizes (optional)</SectionTitle>
      <div className="ev-row">
        <div className="ev-field">
          <label>Winner</label>
          <input value={prizeWinner} onChange={(e) => setPrizeWinner(e.target.value)} placeholder="Rs 50,000" />
        </div>
        <div className="ev-field">
          <label>Runner-up</label>
          <input value={prizeRunnerUp} onChange={(e) => setPrizeRunnerUp(e.target.value)} placeholder="Rs 20,000" />
        </div>
      </div>
      <div className="ev-row">
        <div className="ev-field">
          <label>MVP</label>
          <input value={prizeMvp} onChange={(e) => setPrizeMvp(e.target.value)} />
        </div>
        <div className="ev-field">
          <label>Other</label>
          <input value={prizeOther} onChange={(e) => setPrizeOther(e.target.value)} />
        </div>
      </div>

      <SectionTitle>Rules (optional)</SectionTitle>
      <div className="ev-field">
        <label>Tournament rules</label>
        <textarea rows={3} value={rulesText} onChange={(e) => setRulesText(e.target.value)} />
      </div>
      <div className="ev-field">
        <label>Equipment notes</label>
        <textarea rows={2} value={equipmentNotes} onChange={(e) => setEquipmentNotes(e.target.value)} />
      </div>
      <div className="ev-field">
        <label>Venue rules</label>
        <textarea rows={2} value={venueRules} onChange={(e) => setVenueRules(e.target.value)} />
      </div>

      {err && <div className="ev-err">{err}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="ev-btn" style={{ background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.35)" }} onClick={saveDraft} disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button className="ev-btn" onClick={saveAndPublish} disabled={pending}>
          <Trophy size={15} /> {pending ? "Submitting…" : "Save & submit for review"}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.5, margin: "22px 0 12px" }}>
      {children}
    </div>
  );
}
