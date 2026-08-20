import Link from "next/link";
import type { Metadata } from "next";
import "../../(play)/play.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Sportonica",
  description: "How Sportonica collects, uses, and protects your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="play has-sitenav">
      <div className="play-wrap" style={{ maxWidth: 760 }}>
        <div className="bk-panel">
          <div
            style={{
              background: "rgba(217,119,6,.08)", border: "1px solid rgba(217,119,6,.3)",
              borderRadius: 12, padding: "12px 16px", marginBottom: 24, fontSize: 13, lineHeight: 1.5,
            }}
          >
            <b>Draft.</b> This page is generated from the app&apos;s actual data practices as a starting
            point — review and adjust the wording (and add any legal requirements specific to Nepal) before
            treating this as your official policy.
          </div>

          <h1 style={{ fontSize: 28, marginBottom: 6 }}>Privacy Policy</h1>
          <p className="hint" style={{ marginBottom: 28 }}>Last updated: 18 August 2026</p>
          <style>{`.legal-sec ul { padding-left: 20px; margin: 8px 0; } .legal-sec li { margin-bottom: 6px; } .legal-sec p { margin-bottom: 8px; }`}</style>

          <Section title="What we collect">
            <p>When you create an account or use Sportonica, we collect:</p>
            <ul>
              <li><b>Account info</b> — name, email, and profile photo, from either email/password signup or Google sign-in.</li>
              <li><b>Phone number</b> — so a venue or another player can reach you about a specific booking or game.</li>
              <li><b>Booking and game activity</b> — the courts you book, games you join or host, and your history of showing up (this feeds a trust score shown to other players).</li>
              <li><b>Payment proof images</b> — when you pay a venue or a host via eSewa/Khalti QR, you upload a screenshot and transaction ID so it can be verified. Sportonica does not process card or bank payments directly, and never sees your banking credentials.</li>
              <li><b>Location</b> — only if you tap &quot;Use my location&quot; to find nearby venues; otherwise you pick your city manually.</li>
              <li><b>Messages and friend data</b> — direct messages between you and other users are end-to-end encrypted, so we cannot read their contents. We do store your public encryption key, who a message was sent between, and when (needed to deliver and sync the conversation), plus your friend requests and connections, and read receipts.</li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul>
              <li>To run bookings and games — matching you with courts, hosts, and other players.</li>
              <li>To send booking confirmations, approval notifications, and payment-status updates by email.</li>
              <li>To verify payment proof for a booking or a Play Together game.</li>
              <li>To calculate a trust score from your play/hosting history, shown to other users you interact with.</li>
              <li>To deliver direct messages between you and your friends and keep conversations in sync across your devices.</li>
            </ul>
            <p>We do not sell your data, and we do not run advertising trackers on this app.</p>
          </Section>

          <Section title="Who we share it with">
            <ul>
              <li><b>Supabase</b> — our database and file storage provider, hosting your account, booking, and uploaded-image data.</li>
              <li><b>Brevo</b> — our email provider, used to send the transactional emails above.</li>
              <li><b>Google</b> — if you sign in with Google, Google acts as your identity provider for authentication.</li>
              <li><b>OpenStreetMap / CARTO</b> — the map on our Discover page loads map tiles from these providers, who receive your map view (and IP address) when the map renders. No account info is sent to them.</li>
              <li><b>Other users</b> — a host sees an approved player&apos;s name and phone; a player sees a host&apos;s payment QR and phone once approved. Venue owners see bookings made at their venue. Friends can see your name, photo, and message you.</li>
            </ul>
            <p>We don&apos;t share your data with advertisers or data brokers.</p>
          </Section>

          <Section title="Payments">
            <p>
              Sportonica never collects or holds your payment credentials. Venue bookings and Play Together
              contributions are paid directly to the venue or host via eSewa/Khalti QR; you submit proof
              (a screenshot and transaction ID) for manual verification.
            </p>
          </Section>

          <Section title="Your choices">
            <ul>
              <li>Edit or remove your profile info from your account settings.</li>
              <li>Location access is only requested when you tap &quot;Use my location&quot;, and can be denied.</li>
              <li>Contact us (below) to request deletion of your account and associated data.</li>
            </ul>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy or your data — reach us at{" "}
              <a href="mailto:support@sportonica.com" style={{ color: "var(--sodium)" }}>support@sportonica.com</a>.
            </p>
          </Section>

          <p className="hint" style={{ marginTop: 28 }}>
            <Link href="/">← Back to Sportonica</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{title}</h2>
      <div className="legal-sec" style={{ fontSize: 14, lineHeight: 1.65, color: "var(--dim)" }}>
        {children}
      </div>
    </section>
  );
}
