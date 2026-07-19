import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getMyProfile } from "@/lib/profile/queries";
import ProfileEditor from "./ProfileEditor";
import "../p/profile.css";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login?redirect=/profile");

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";

  return (
    <div className="pf">
      <ProfileEditor profile={profile} origin={`${proto}://${host}`} />
    </div>
  );
}
