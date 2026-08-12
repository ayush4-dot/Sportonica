/**
 * Minutes-from-midnight time-of-day stepper shared by the Book and Play
 * search bars — same 30-min grid availability.ts books court slots on.
 */
export const TIME_MIN = 6 * 60;
export const TIME_MAX = 23 * 60 + 30;
export const TIME_STEP = 30;

export function timeLabel(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
