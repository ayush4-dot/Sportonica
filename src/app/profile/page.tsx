import { redirect } from "next/navigation";
import {
  getMyProfile, getPlayerStats, getPlayerSports, getMyActivitySummary,
  computeBadges, trustLabel,
} from "@/lib/profile/queries";
import ProfileHub from "./ProfileHub";
import "../p/profile.css";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login?redirect=/profile");

  const [stats, sports, activity] = await Promise.all([
    getPlayerStats(profile.id),
    getPlayerSports(profile.id),
    getMyActivitySummary(profile.id),
  ]);
  const badges = computeBadges(stats, sports);
  const trust = trustLabel(profile.trust_score ?? 50);

  return (
    <div className="pf">
      <ProfileHub profile={profile} stats={stats} sports={sports} activity={activity} badges={badges} trust={trust} />
    </div>
  );
}
