import Link from "next/link";
import type { Metadata } from "next";
import "../../(play)/play.css";

export const metadata: Metadata = {
  title: "Account Deletion — Sportonica",
  description: "What happens to your data when you delete your Sportonica account.",
};

export default function AccountDeletionPolicyPage() {
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
            <b>Draft.</b> This page describes how account deletion works in the app today. Review the
            wording — and any retention periods required under Nepal law — before treating it as an
            official policy.
          </div>

          <h1 style={{ fontSize: 28, marginBottom: 6 }}>Account Deletion</h1>
          <p className="hint" style={{ marginBottom: 28 }}>Last updated: 10 September 2026</p>
          <style>{`.legal-sec ul { padding-left: 20px; margin: 8px 0; } .legal-sec li { margin-bottom: 6px; } .legal-sec p { margin-bottom: 8px; }`}</style>

          <Section title="How to delete your account">
            <p>
              Go to <b>Profile → Login &amp; Security → Delete Account</b>. You&apos;ll be asked to
              read what will happen, type <b>DELETE</b> to confirm, and re-authenticate (enter your
              password, or sign in with Google again) before the deletion runs.
            </p>
            <p>
              <b>Account deletion is permanent.</b> Once it completes, your account cannot be
              recovered and you&apos;ll need to create a new one to use Sportonica again.
            </p>
          </Section>

          <Section title="What is deleted">
            <ul>
              <li><b>Profile information</b> — your name, photo, bio, city, and the sports on your profile.</li>
              <li><b>Login and contact details</b> — your email address and phone number are removed and your sign-in (password / Google link) is destroyed.</li>
              <li><b>Saved preferences</b> — favourites, filters, and app settings.</li>
              <li><b>Reputation and activity</b> — your trust score, games played/hosted counts, and play history.</li>
              <li><b>Friends and messages</b> — friend connections and requests are removed. Direct messages are end-to-end encrypted and are deleted or anonymised so they can no longer be tied to you.</li>
              <li><b>Reviews and other user-generated content</b> — removed, or anonymised where a venue needs to keep aggregate feedback.</li>
              <li><b>Uploaded files</b> — profile photos and payment-proof screenshots are deleted from storage.</li>
            </ul>
          </Section>

          <Section title="What happens to bookings">
            <ul>
              <li><b>Upcoming bookings</b> — cancelled as part of the deletion, and the court time slot is released so other players can book it. Where a venue&apos;s policy requires notice, the venue is notified.</li>
              <li><b>Past bookings</b> — the booking record is kept by the venue for their own records, with your personal details (name, phone) removed so it can&apos;t be linked back to you.</li>
              <li>Court availability continues to work normally after your account is deleted.</li>
            </ul>
          </Section>

          <Section title="What is kept (anonymised)">
            <p>
              Some records can&apos;t simply be erased because Sportonica — or the venues and hosts on
              it — need them for accounting, tax, fraud-prevention, or dispute-resolution reasons.
              Where that applies, we remove the personal information and keep only what&apos;s needed:
            </p>
            <ul>
              <li><b>Payment and transaction records</b> — the amount, method (eSewa / Khalti), status, dates, and transaction ID are retained and unlinked from your account. The uploaded payment screenshot is deleted.</li>
              <li><b>Audit logs</b> — records that a booking or payment was created, edited, or cancelled are kept for security and dispute handling, with your user ID removed.</li>
            </ul>
            <p>
              We do not claim that every record is physically deleted. Records that must be retained
              are anonymised so they can no longer identify you.
            </p>
          </Section>

          <Section title="If you own a venue">
            <p>
              If your account owns a venue on Sportonica, you&apos;ll be asked to transfer or close the
              venue before your personal account can be deleted, so that existing bookings and staff
              access aren&apos;t disrupted. Contact{" "}
              <a href="mailto:support@sportonica.com" style={{ color: "var(--sodium)" }}>support@sportonica.com</a>{" "}
              for help with this.
            </p>
          </Section>

          <Section title="Trouble deleting your account">
            <p>
              If the automatic deletion can&apos;t complete, the app will tell you and ask you to email{" "}
              <a href="mailto:support@sportonica.com" style={{ color: "var(--sodium)" }}>support@sportonica.com</a>.
              We&apos;ll finish removing your account and data manually.
            </p>
          </Section>

          <p className="hint" style={{ marginTop: 28 }}>
            See also our <Link href="/privacy">Privacy Policy</Link>. ·{" "}
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
