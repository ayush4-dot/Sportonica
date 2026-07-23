import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after Google sign-in. We swap the one-time code
// for a session, then decide where to send them.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/discover";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const sb = await createClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Make sure a profile row exists — the signup trigger only fires for
  // email signups on some setups, so create one here if it's missing.
  const { data: profile } = await sb
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Player";

    await sb.from("profiles").insert({
      id: user.id,
      full_name: name,
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      role: null,                    // unset — they pick on the next screen
      trust_score: 50,
    });
    return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
  }

  // Existing user who never chose a role → ask now.
  if (!profile.role) {
    return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
