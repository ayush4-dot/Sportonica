import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "../../p/profile.css";

const SECTIONS: Record<string, { title: string; body: string }> = {
  security: {
    title: "Login & Security",
    body: "Password and login-security controls are on the way. For now, use \"Forgot password\" on the login screen to reset your password.",
  },
  notifications: {
    title: "Notifications",
    body: "Fine-grained notification preferences are on the way. You'll keep getting the notifications you get today via the bell icon in the meantime.",
  },
  preferences: {
    title: "Preferences",
    body: "Preferred playing times, locations, and discovery settings are on the way. You can already set the sports you play from Edit Profile.",
  },
  privacy: {
    title: "Privacy",
    body: "More granular privacy controls (blocked users, contact visibility) are on the way. You can already switch your player card between public and private from Edit Profile.",
  },
  help: {
    title: "Help & Support",
    body: "A dedicated help centre is on the way. For now, reach out to the Sportonica team directly if you run into an issue.",
  },
  legal: {
    title: "Legal",
    body: "Terms of service, privacy policy, and cancellation/refund policy pages are on the way.",
  },
};

export default async function ComingSoonPage({
  searchParams,
}: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  const content = (section && SECTIONS[section]) || {
    title: "Coming soon",
    body: "This section is on the way.",
  };

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ maxWidth: 640 }}>
        <Link href="/profile" className="pf-back"><ArrowLeft size={15} /> Profile</Link>
        <h1 className="pf-hub-name" style={{ marginTop: 18 }}>{content.title}</h1>
        <p className="pf-lede" style={{ marginTop: 16 }}>{content.body}</p>
      </div>
    </div>
  );
}
