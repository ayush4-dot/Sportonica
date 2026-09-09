// Routes that render their own full-screen chrome (the auth aurora
// background, no header / dock / onboarding overlay). Kept in one place
// because the same check lives in NavWrapper, AppHeader, MagnetDock and
// the first-run Onboarding overlay — a new auth page (e.g. the password
// reset flow) that's missing from any one of them leaks the site nav.

export const BARE_CHROME_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export function isBareChromeRoute(pathname: string): boolean {
  return BARE_CHROME_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
