// ================================================================
// The one place sports are defined. Every form, filter, and card
// imports from here — so adding or renaming a sport is one edit.
//
// Note: Football was merged into Futsal. In Kathmandu the two are used
// interchangeably and nearly all bookable grounds are futsal courts,
// so keeping both created duplicate, confusing options.
// ================================================================

export interface Sport {
  name: string;
  color: string;
  /** typical squad size per side, used for cost-split defaults */
  squad: number;
  /** short line used on cards and empty states */
  tagline: string;
}

export const SPORTS: Sport[] = [
  { name: "Futsal",     color: "#2E7D5B", squad: 5,  tagline: "Floodlit nights, fast feet" },
  { name: "Cricket",    color: "#f97316", squad: 8,  tagline: "Box cages after dark" },
  { name: "Basketball", color: "#FFC93C", squad: 5,  tagline: "Three on three, all week" },
  { name: "Volleyball", color: "#3b82f6", squad: 6,  tagline: "Sand, net, sunset" },
  { name: "Badminton",  color: "#a855f7", squad: 2,  tagline: "Dawn doubles, indoor courts" },
  { name: "Tennis",     color: "#ec4899", squad: 2,  tagline: "Baseline rallies" },
  { name: "Pickleball", color: "#84cc16", squad: 2,  tagline: "The fastest-growing game in town" },
  { name: "Swimming",   color: "#06b6d4", squad: 1,  tagline: "Lanes, laps, early mornings" },
  { name: "Running",    color: "#60a5fa", squad: 1,  tagline: "Ring road crews, every morning" },
];

/** Just the names — for <select> options and chip rows. */
export const SPORT_NAMES = SPORTS.map((s) => s.name);

/** name → colour, for cards, bars and badges. */
export const SPORT_COLORS: Record<string, string> = Object.fromEntries(
  SPORTS.map((s) => [s.name, s.color])
);

export function sportColor(name: string | null | undefined): string {
  return (name && SPORT_COLORS[name]) || "#DE3163";
}

export function sportSquad(name: string | null | undefined): number {
  return SPORTS.find((s) => s.name === name)?.squad ?? 5;
}

/**
 * Old data may still say "Football". Treat it as Futsal everywhere
 * so existing venues and games keep working after the merge.
 */
export function normalizeSport(name: string | null | undefined): string {
  if (!name) return "Futsal";
  return name.trim().toLowerCase() === "football" ? "Futsal" : name;
}
