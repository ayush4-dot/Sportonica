import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMyProfile } from "@/lib/profile/queries";
import ProfileEditor from "../ProfileEditor";
import "../../p/profile.css";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login?redirect=/profile/edit");

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ maxWidth: 640 }}>
        <Link href="/profile" className="pf-back"><ArrowLeft size={15} /> Profile</Link>
      </div>
      <ProfileEditor profile={profile} origin={`${proto}://${host}`} />
    </div>
  );
}
