// Guard for post-auth "send me back where I was" redirects. Anything that
// isn't a plain same-origin path (starts with exactly one "/", no scheme,
// no "//" protocol-relative host, no backslash or whitespace) is
// discarded in favour of the fallback — otherwise `?redirect=` /
// `?next=` on the login and OAuth-callback URLs is an open redirect that
// bounces an authenticated user to an attacker's page.

export function safeRedirect(
  value: string | null | undefined,
  fallback = "/discover",
): string {
  if (!value) return fallback;
  if (/[\s\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
