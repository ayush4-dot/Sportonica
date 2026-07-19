import "./admin.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  // Middleware already gates /admin, but defense in depth: re-check here.
  if (!user) redirect("/login");
  const role = user.user_metadata?.role;
  if (role !== "admin" && role !== "venue_owner") redirect("/");

  return (
    <div className="adm">
      <AdminNav />
      <div className="adm-main">{children}</div>
    </div>
  );
}
