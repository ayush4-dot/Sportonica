// Lightweight password-strength score for the signup meter. 0–4, plus a
// label + the app's own hard minimum (6). Not a security control — the
// real rule is length >= 6, enforced in the form and by Supabase Auth.

export const PASSWORD_MIN = 6;

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

export type PasswordScore = {
  score: 0 | 1 | 2 | 3 | 4;
  label: (typeof LABELS)[number];
  ok: boolean;
};

export function passwordScore(pw: string): PasswordScore {
  if (pw.length < PASSWORD_MIN) return { score: 0, label: LABELS[0], ok: false };

  let s = 1;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;

  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return { score, label: LABELS[score], ok: true };
}
