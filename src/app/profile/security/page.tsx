import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMyProfile } from "@/lib/profile/queries";
import SecuritySettings from "./SecuritySettings";
import "../../p/profile.css";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login?redirect=/profile/security");

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ maxWidth: 640 }}>
        <Link href="/profile" className="pf-back"><ArrowLeft size={15} /> Profile</Link>
        <h1 className="pf-hub-name" style={{ marginTop: 18 }}>Login &amp; Security</h1>
        <SecuritySettings name={profile.full_name ?? profile.name ?? profile.username} />
      </div>
    </div>
  );
}
