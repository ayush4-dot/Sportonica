import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RolePicker from "./RolePicker";

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();

  // Already chose — don't ask twice.
  if (profile?.role) redirect(next ?? "/discover");

  const name =
    profile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  return <RolePicker name={name.split(" ")[0]} next={next ?? "/discover"} />;
}
