/**
 * Filters for finding a game, not a venue.
 *
 * The format of a game (5-a-side, doubles, box cricket) isn't stored —
 * but max_players tells you, so it's derived rather than added to the
 * schema. Everything else here maps to a column that already exists.
 */

export type FormatOpt = { key: string; label: string; players: number[] };

const FORMATS: Record<string, FormatOpt[]> = {
  Football: [
    { key: "5a",  label: "5-a-side",  players: [10] },
    { key: "7a",  label: "7-a-side",  players: [14] },
    { key: "11a", label: "11-a-side", players: [22] },
  ],
  Futsal: [
    { key: "5a", label: "5-a-side", players: [10] },
    { key: "6a", label: "6-a-side", players: [12] },
    { key: "7a", label: "7-a-side", players: [14] },
  ],
  Cricket: [
    { key: "box",      label: "Box cricket", players: [12, 14] },
    { key: "practice", label: "Practice",    players: [6, 8, 10] },
    { key: "full",     label: "Full match",  players: [22] },
  ],
  Badminton: [
    { key: "singles", label: "Singles", players: [2] },
    { key: "doubles", label: "Doubles", players: [4] },
  ],
  "Table Tennis": [
    { key: "singles", label: "Singles", players: [2] },
    { key: "doubles", label: "Doubles", players: [4] },
  ],
  Tennis: [
    { key: "singles", label: "Singles", players: [2] },
    { key: "doubles", label: "Doubles", players: [4] },
  ],
  Basketball: [
    { key: "3v3", label: "3-on-3", players: [6] },
    { key: "5v5", label: "5-on-5", players: [10] },
  ],
  Volleyball: [
    { key: "6a", label: "6-a-side", players: [12] },
    { key: "4a", label: "4-a-side", players: [8] },
  ],
};

/** Formats worth offering for this sport, or none if it isn't a team game. */
export function formatsFor(sport: string | null): FormatOpt[] {
  if (!sport || sport === "All sports") return [];
  return FORMATS[sport] ?? [];
}

/** Which format a game is, judged by how many it holds. */
export function formatOf(sport: string, maxPlayers: number): string | null {
  const opts = FORMATS[sport];
  if (!opts) return null;
  const hit = opts.find((o) => o.players.includes(maxPlayers));
  return hit?.key ?? null;
}

export const SKILLS = [
  { key: "beginner",     label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced",     label: "Advanced" },
];

export const TIMES = [
  { key: "morning",   label: "Morning",   from: 5,  to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { key: "evening",   label: "Evening",   from: 17, to: 21 },
  { key: "night",     label: "Night",     from: 21, to: 29 },   // wraps past midnight
];

export const FEES = [
  { key: "free",  label: "Free",        min: 0,   max: 0 },
  { key: "low",   label: "Under Rs 300", min: 1,   max: 300 },
  { key: "mid",   label: "Rs 300–600",   min: 300, max: 600 },
  { key: "high",  label: "Rs 600+",      min: 600, max: Infinity },
];

export const DISTANCES = [
  { key: "2",  label: "Within 2 km",  km: 2 },
  { key: "5",  label: "Within 5 km",  km: 5 },
  { key: "10", label: "Within 10 km", km: 10 },
];

/** Hour of day in Kathmandu, 0–23. */
export function hourOf(iso: string): number {
  return Number(
    new Date(iso).toLocaleString("en-GB", {
      hour: "2-digit", hour12: false, timeZone: "Asia/Kathmandu",
    })
  );
}

export function inTimeBand(iso: string, key: string): boolean {
  const band = TIMES.find((t) => t.key === key);
  if (!band) return true;
  const h = hourOf(iso);
  const hh = h < 5 ? h + 24 : h;          // 1am counts as night, not morning
  return hh >= band.from && hh < band.to;
}

export function inFeeBand(fee: number, key: string): boolean {
  const band = FEES.find((f) => f.key === key);
  if (!band) return true;
  return fee >= band.min && fee <= band.max;
}

export type PlayQuery = {
  format: string | null;
  skill: string | null;
  time: string | null;
  fee: string | null;
  dist: string | null;
  openOnly: boolean;
};

export const NO_FILTERS: PlayQuery = {
  format: null, skill: null, time: null, fee: null, dist: null, openOnly: false,
};

export function activeCount(q: PlayQuery): number {
  return (
    (q.format ? 1 : 0) + (q.skill ? 1 : 0) + (q.time ? 1 : 0) +
    (q.fee ? 1 : 0) + (q.dist ? 1 : 0) + (q.openOnly ? 1 : 0)
  );
}
