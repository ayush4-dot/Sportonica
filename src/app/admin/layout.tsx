import "./admin.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  // Middleware already gates /admin, but defense in depth: re-check here —
  // against the database, not user_metadata, which a client can set
  // directly via supabase.auth.updateUser() with no server involved at all.
  if (!user) redirect("/login");
  const { data: profile } = await sb
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;
  if (role !== "admin" && role !== "venue_owner" && role !== "super_admin") redirect("/");

  return (
    <div className="adm">
      <AdminNav />
      <div className="adm-main">{children}</div>
    </div>
  );
}
