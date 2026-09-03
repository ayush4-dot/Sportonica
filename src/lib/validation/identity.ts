// Shared identity-field validation — email and phone. Framework-agnostic
// and dependency-free on purpose: the same rules run on the client
// (login/signup forms), inside "use server" actions, and are mirrored in
// SQL (supabase/identity_validation.sql). Keep the three in sync.

// ── Email ────────────────────────────────────────────────────────────

/** trim + lowercase — the canonical form used for storing and comparing. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// One `@`, a non-empty local part with no whitespace, then a dotted
// multi-label domain where every label is alphanumeric/hyphen (not
// starting or ending with a hyphen) and the final label (the TLD) is at
// least two letters. This deliberately accepts any legitimate TLD —
// .com .org .net .edu .np — and multi-part suffixes like .com.np, and
// rejects the malformed cases (trailing @, no TLD, doubled dots, spaces).
const EMAIL_RE =
  /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  return EMAIL_RE.test(email);
}

// For the unified "email or phone" sign-in / sign-up field: an entry
// containing "@" is treated as an email attempt, anything else as a phone
// attempt. Lets the caller pick which validator + flow to run.
export function looksLikeEmail(raw: string): boolean {
  return raw.includes("@");
}

// ── Phone ────────────────────────────────────────────────────────────

// Modular so other country formats can be added later without touching
// call sites — today only the local (Nepal) 10-digit format is supported.
export const PHONE_RULES = {
  local: { digits: 10 },
} as const;

export const PHONE_ERROR = "Phone number must contain exactly 10 digits.";

/** strip everything that isn't a digit — the canonical stored form. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * True only when `raw`, once trimmed, is exactly 10 digits and nothing
 * else. Per spec this rejects 9/11 digits, letters, embedded spaces,
 * dashes, and a leading "+977" country code.
 */
export function isValidLocalPhone(raw: string): boolean {
  return new RegExp(`^\\d{${PHONE_RULES.local.digits}}$`).test(raw.trim());
}
