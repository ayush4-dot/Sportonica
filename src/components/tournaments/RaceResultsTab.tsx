"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  listRaceCategories, createRaceCategory, deleteRaceCategory,
  setTeamRaceCategory, recordRaceResult, getRaceResults,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { RACE_RESULT_STATUS, RACE_RESULT_STATUS_LABELS } from "@/lib/tournaments/types";
import type { Tournament, TournamentTeam, TournamentRaceCategory, RaceResultRow, RaceResultStatus } from "@/lib/tournaments/types";

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(242,237,230,0.15)",
  background: "transparent", color: "inherit", fontFamily: "inherit",
};

// finish_time comes back from Postgres as an interval string (e.g.
// "01:23:45" or "00:23:45.5") — just pass it straight through to/from
// the "HH:MM:SS" text input; Postgres parses that format natively.
function fmtTime(t: string | null): string {
  if (!t) return "";
  // Normalize "0:23:45" / "1 day 01:23:45" edge cases to plain H:MM:SS.
  const m = t.match(/(\d+):(\d{2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3]}` : t;
}

export default function RaceResultsTab({ tournament, teams }: {
  tournament: Tournament;
  teams: TournamentTeam[]; // confirmed registrants only — each one runner
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [categories, setCategories] = useState<TournamentRaceCategory[]>([]);
  const [results, setResults] = useState<RaceResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Used from run() below (event handlers, not effects) to refetch after
  // a mutation — the mount effect has its own inline fetch instead of
  // calling this, since a synchronous setState call directly in an
  // effect body (as opposed to inside its async continuation) trips
  // react-hooks/set-state-in-effect.
  function load() {
    setLoading(true);
    Promise.all([listRaceCategories(tournament.id), getRaceResults(tournament.id)]).then(([cats, res]) => {
      if (!isActionError(cats)) setCategories(cats);
      if (!isActionError(res)) setResults(res);
      setLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRaceCategories(tournament.id), getRaceResults(tournament.id)]).then(([cats, res]) => {
      if (cancelled) return;
      if (!isActionError(cats)) setCategories(cats);
      if (!isActionError(res)) setResults(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tournament.id]);

  function run(action: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      const res = await action();
      if (isActionError(res)) { setErr(res.message); return; }
      load();
      router.refresh();
    });
  }

  const resultByTeam = new Map(results.map((r) => [r.team_id, r]));

  return (
    <div className="tc-card">
      <div className="tc-card-t" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        Race categories &amp; results
        <button className="tc-btn" disabled={pending} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setShowAddCategory((v) => !v)}>
          <Plus size={13} /> Add category
        </button>
      </div>
      <div className="tc-card-sub">
        Set up categories (5K, 10K, age groups…), then record each runner&apos;s finish time or status once the event is done.
      </div>
      {err && <div className="tc-err">{err}</div>}

      {showAddCategory && (
        <AddCategoryForm
          tournamentId={tournament.id} pending={pending}
          onAdd={(name, distance, genderRule) => {
            run(() => createRaceCategory(tournament.id, name, distance, undefined, genderRule, categories.length));
            setShowAddCategory(false);
          }}
        />
      )}

      {loading ? (
        <div className="tc-empty">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="tc-empty">No categories yet — add one above (or leave empty for a single overall race).</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          {categories.map((c) => (
            <div key={c.id} className="tc-badge" style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(128,128,128,.14)", color: "inherit" }}>
              {c.name}{c.distance_label ? ` · ${c.distance_label}` : ""}
              <button
                aria-label={`Delete ${c.name}`} disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Delete category "${c.name}"? Runners entered in it will need to be reassigned.`)) return;
                  run(() => deleteRaceCategory(c.id));
                }}
                style={{ background: "none", border: "none", color: "inherit", opacity: 0.6, cursor: "pointer", padding: 0, display: "flex" }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="tc-empty">No confirmed runners yet.</div>
      ) : (
        <table className="tc-table">
          <thead><tr><th>Runner</th><th>Category</th><th>Bib</th><th>Result</th><th></th></tr></thead>
          <tbody>
            {teams.map((t) => (
              <RunnerRow
                key={t.id} team={t} categories={categories} result={resultByTeam.get(t.id) ?? null} pending={pending}
                onSetCategory={(categoryId) => run(() => setTeamRaceCategory(t.id, categoryId))}
                onSaveResult={(finishTime, status, bib) => run(() => recordRaceResult(t.id, tournament.id, finishTime, status, bib))}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddCategoryForm({ pending, onAdd }: {
  tournamentId: string;
  pending: boolean;
  onAdd: (name: string, distanceLabel?: string, genderRule?: string) => void;
}) {
  const [name, setName] = useState("");
  const [distance, setDistance] = useState("");
  const [genderRule, setGenderRule] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) { setLocalErr("Name the category (e.g. 10K, Men's Open)."); return; }
    setLocalErr(null);
    onAdd(name.trim(), distance.trim() || undefined, genderRule.trim() || undefined);
    setName(""); setDistance(""); setGenderRule("");
  }

  return (
    <div style={{ background: "rgba(0,98,65,0.06)", borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="10K" style={{ ...inputStyle, width: 140 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Distance / label (optional)</span>
          <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="10 km" style={{ ...inputStyle, width: 140 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="tc-dim" style={{ fontSize: 11 }}>Gender rule (optional)</span>
          <input value={genderRule} onChange={(e) => setGenderRule(e.target.value)} placeholder="Open, Men's, Women's…" style={{ ...inputStyle, width: 140 }} />
        </label>
        <button className="tc-btn primary" disabled={pending} style={{ padding: "9px 14px" }} onClick={submit}>
          <Plus size={14} /> Add
        </button>
      </div>
      {localErr && <div className="tc-err" style={{ marginTop: 10, marginBottom: 0 }}>{localErr}</div>}
    </div>
  );
}

function RunnerRow({ team, categories, result, pending, onSetCategory, onSaveResult }: {
  team: TournamentTeam;
  categories: TournamentRaceCategory[];
  result: RaceResultRow | null;
  pending: boolean;
  onSetCategory: (categoryId: string | null) => void;
  onSaveResult: (finishTime: string | null, status: RaceResultStatus, bib?: string) => void;
}) {
  const [finishTime, setFinishTime] = useState(fmtTime(result?.finish_time ?? null));
  const [status, setStatus] = useState<RaceResultStatus>(result?.status ?? "finished");
  const [bib, setBib] = useState(result?.bib_number ?? "");

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>
        {team.name}
        {result && result.rank > 0 && status === "finished" && <span className="tc-dim" style={{ marginLeft: 6, fontWeight: 400 }}>#{result.rank}</span>}
      </td>
      <td>
        <select
          value={team.category_id ?? ""} disabled={pending}
          onChange={(e) => onSetCategory(e.target.value || null)}
          style={{ ...inputStyle, width: 140 }}
        >
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td>
        <input value={bib} onChange={(e) => setBib(e.target.value)} placeholder="Bib #" style={{ ...inputStyle, width: 70 }} aria-label={`${team.name} bib number`} />
      </td>
      <td>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={status} onChange={(e) => setStatus(e.target.value as RaceResultStatus)} style={{ ...inputStyle, width: 100 }} aria-label={`${team.name} status`}>
            {RACE_RESULT_STATUS.map((s) => <option key={s} value={s}>{RACE_RESULT_STATUS_LABELS[s]}</option>)}
          </select>
          {status === "finished" && (
            <input
              value={finishTime} onChange={(e) => setFinishTime(e.target.value)} placeholder="HH:MM:SS"
              style={{ ...inputStyle, width: 90 }} aria-label={`${team.name} finish time`}
            />
          )}
          <button
            className="tc-btn primary" disabled={pending} style={{ padding: "6px 10px", fontSize: 11.5 }}
            onClick={() => onSaveResult(status === "finished" && finishTime.trim() ? finishTime.trim() : null, status, bib.trim() || undefined)}
          >
            Save
          </button>
        </div>
      </td>
      <td />
    </tr>
  );
}
