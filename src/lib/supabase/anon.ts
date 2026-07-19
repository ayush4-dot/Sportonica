// Minimal anonymous Supabase reader for contexts with no session/cookies
// (e.g. the OG image route). Uses Supabase's REST endpoint directly, so it
// pulls in no client library. RLS still applies — anon can only read
// what your public policies allow.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function anonSelect<T>(
  table: string,
  query: string
): Promise<T[]> {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  try {
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}
