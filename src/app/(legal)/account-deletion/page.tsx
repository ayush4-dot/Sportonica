import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ShieldCheck, Zap, Clock, TriangleAlert,
  UserRound, AtSign, SlidersHorizontal, Trophy, MessagesSquare, Star, ImageOff,
  CalendarOff, CalendarClock, Receipt,
  LogIn, Type, Fingerprint, CircleCheck,
  CalendarX, Building2,
} from "lucide-react";
import "./account-deletion.css";

export const metadata: Metadata = {
  title: "Account Deletion — Sportonica",
  description:
    "Delete your Sportonica account yourself, any time. What gets deleted, what's kept and why, and what happens to your bookings.",
};

type Fate = "del" | "anon" | "free";
const FATE_LABEL: Record<Fate, string> = { del: "Deleted", anon: "Anonymised", free: "Released" };

function DataRow({ icon, name, fate, children }: { icon: ReactNode; name: string; fate: Fate; children: ReactNode }) {
  return (
    <div className="adp-row">
      <span className="adp-row-ico" aria-hidden>{icon}</span>
      <span className="adp-row-name">{name}</span>
      <span className={`adp-tag ${fate}`}>{FATE_LABEL[fate]}</span>
      <span className="adp-row-desc">{children}</span>
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="adp-step">
      <b>{icon}<span>{title}</span></b>
      <span className="adp-step-body">{children}</span>
    </li>
  );
}

export default function AccountDeletionPage() {
  return (
    <div className="adp has-sitenav">
      <div className="adp-wrap">
        <header className="adp-hero">
          <span className="adp-eyebrow">Account · Privacy</span>
          <h1>Deleting your <em>Sportonica</em> account</h1>
          <p>
            You can permanently delete your account yourself, straight from the app — no request,
            no waiting on us. Here&apos;s exactly what happens to your data when you do.
          </p>

          <div className="adp-draft">
            <TriangleAlert size={15} aria-hidden />
            <span>
              <b>Draft.</b>{" "}This page reflects how deletion works in the app today. The wording —
              and any retention periods required under Nepal law — should be reviewed before it&apos;s
              treated as an official policy.
            </span>
          </div>
        </header>

        <div className="adp-facts">
          <div className="adp-fact">
            <span className="adp-fact-ico" aria-hidden><ShieldCheck size={18} /></span>
            <b>Permanent</b>
            <span>Once it completes there&apos;s no undo and no recovery.</span>
          </div>
          <div className="adp-fact">
            <span className="adp-fact-ico" aria-hidden><Zap size={18} /></span>
            <b>Self-serve</b>
            <span>Runs on your login alone. No approval from Sportonica or a venue.</span>
          </div>
          <div className="adp-fact">
            <span className="adp-fact-ico" aria-hidden><Clock size={18} /></span>
            <b>About a minute</b>
            <span>Confirm, re-enter your password, done — then you&apos;re signed out.</span>
          </div>
        </div>

        {/* ── What happens to your data ── */}
        <section className="adp-sec">
          <h2 className="adp-sec-h">What happens to your data</h2>
          <p className="adp-sec-sub">
            Most of your data is erased outright. A few records are kept for accounting, safety or a
            venue&apos;s own books — those have your identity stripped out so they can no longer point
            back to you.
          </p>

          <div className="adp-table">
            <DataRow icon={<UserRound size={19} />} name="Profile" fate="del">
              Name, photo, bio, city and the sports on your profile.
            </DataRow>
            <DataRow icon={<AtSign size={19} />} name="Email & phone" fate="del">
              Removed from the account; your sign-in (password / Google link) is destroyed.
            </DataRow>
            <DataRow icon={<SlidersHorizontal size={19} />} name="Saved preferences" fate="del">
              Favourites, filters and app settings.
            </DataRow>
            <DataRow icon={<Trophy size={19} />} name="Reputation & activity" fate="del">
              Trust score, games played and hosted, and your play history.
            </DataRow>
            <DataRow icon={<MessagesSquare size={19} />} name="Friends & messages" fate="del">
              Friend connections and requests are removed. Direct messages are end-to-end encrypted
              and are deleted or unlinked so they can&apos;t be tied to you.
            </DataRow>
            <DataRow icon={<Star size={19} />} name="Reviews & other content" fate="anon">
              Removed, or kept without your name where a venue relies on aggregate feedback.
            </DataRow>
            <DataRow icon={<ImageOff size={19} />} name="Uploaded files" fate="del">
              Profile photos and payment-proof screenshots are deleted from storage.
            </DataRow>
            <DataRow icon={<CalendarClock size={19} />} name="Upcoming bookings" fate="free">
              Cancelled, and the court time slot is released so other players can book it.
            </DataRow>
            <DataRow icon={<CalendarOff size={19} />} name="Past bookings" fate="anon">
              The venue keeps the booking record; your name and phone are cleared from it.
            </DataRow>
            <DataRow icon={<Receipt size={19} />} name="Payments & transactions" fate="anon">
              Amount, method, status, date and transaction ID are retained for accounting and
              fraud-prevention, with the link to your account removed.
            </DataRow>
          </div>

          <div className="adp-legend">
            <span><i className="del" /> Deleted — erased entirely</span>
            <span><i className="anon" /> Anonymised — kept, identity removed</span>
            <span><i className="free" /> Released — booking freed for others</span>
          </div>
        </section>

        {/* ── How to delete ── */}
        <section className="adp-sec">
          <h2 className="adp-sec-h">How to delete your account</h2>
          <p className="adp-sec-sub">
            From <strong>Profile → Login &amp; Security → Delete Account</strong>.
          </p>
          <ol className="adp-steps">
            <Step icon={<LogIn size={15} aria-hidden />} title="Open the delete dialog">
              Scroll to the red &ldquo;Delete Account&rdquo; card at the bottom of Login &amp; Security
              and open it — nothing is deleted yet, you&apos;ll see a summary first.
            </Step>
            <Step icon={<Type size={15} aria-hidden />} title="Type DELETE to confirm">
              You have to type <code>DELETE</code> exactly. The button stays disabled until you do.
            </Step>
            <Step icon={<Fingerprint size={15} aria-hidden />} title="Confirm it's you">
              Re-enter your password, or sign in with Google again if that&apos;s how you log in. This
              stops someone using an unlocked phone from deleting your account.
            </Step>
            <Step icon={<CircleCheck size={15} aria-hidden />} title="Done">
              Your account and data are removed, you&apos;re signed out everywhere, and you land back
              on the Sportonica home page.
            </Step>
          </ol>
        </section>

        {/* ── Deeper notes ── */}
        <section className="adp-sec">
          <h2 className="adp-sec-h">The details</h2>

          <div className="adp-note">
            <span className="adp-note-ico" aria-hidden><CalendarX size={20} /></span>
            <div>
              <h3>Bookings &amp; court availability</h3>
              <p>
                Any booking in the future is cancelled as part of the deletion and the slot is
                immediately freed for other players — deleting an account never leaves a court time
                blocked. Where a venue&apos;s policy requires notice of a cancellation, the venue is
                notified.
              </p>
              <p>
                Past bookings stay in the venue&apos;s records so their history stays intact, but with
                your personal details removed.
              </p>
            </div>
          </div>

          <div className="adp-note">
            <span className="adp-note-ico" aria-hidden><Receipt size={20} /></span>
            <div>
              <h3>Payments</h3>
              <p>
                Sportonica never holds your card or bank details — you pay a venue or host directly by
                eSewa/Khalti QR and upload a screenshot for verification. When you delete your
                account:
              </p>
              <ul>
                <li>the uploaded payment screenshot is deleted;</li>
                <li>
                  the transaction record (amount, method, status, date, transaction ID) is kept for
                  accounting, tax, fraud-prevention and dispute-resolution, with your user ID removed;
                </li>
                <li>records that a payment was created or reviewed are kept as anonymous audit logs.</li>
              </ul>
            </div>
          </div>

          <div className="adp-note">
            <span className="adp-note-ico" aria-hidden><Building2 size={20} /></span>
            <div>
              <h3>If your account owns a venue</h3>
              <p>
                You&apos;ll be asked to transfer or close the venue first, so existing bookings and
                staff access aren&apos;t disrupted. Email{" "}
                <a className="adp-inline" href="mailto:support@sportonica.com">support@sportonica.com</a>{" "}
                and we&apos;ll help with the handover.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="adp-sec">
          <h2 className="adp-sec-h">Questions</h2>
          <div className="adp-faq">
            <details>
              <summary>Can I get my account back after deleting it?</summary>
              <p>
                No. Deletion is permanent. If you want to use Sportonica again you&apos;ll create a
                new account from scratch.
              </p>
            </details>
            <details>
              <summary>Do I need to contact support to delete my account?</summary>
              <p>
                No. The whole flow runs on your own login. Support is only needed if your account owns
                a venue, or in the rare case the automatic deletion can&apos;t finish — the app will
                tell you and point you to{" "}
                <a className="adp-inline" href="mailto:support@sportonica.com">support@sportonica.com</a>.
              </p>
            </details>
            <details>
              <summary>Is every record really deleted?</summary>
              <p>
                Not literally. Financial and audit records that Sportonica or a venue must keep for
                legal or accounting reasons are retained — but anonymised, so they can no longer
                identify you. Everything that isn&apos;t in that category is erased.
              </p>
            </details>
            <details>
              <summary>What about my direct messages?</summary>
              <p>
                Direct messages are end-to-end encrypted, so Sportonica can&apos;t read them. On
                deletion your side of a conversation is removed and your public key is cleared, so
                messages can no longer be linked or decrypted with your account.
              </p>
            </details>
          </div>
        </section>

        <div className="adp-foot">
          <Link href="/privacy">Privacy Policy</Link>
          <span className="adp-sep" aria-hidden />
          <a href="mailto:support@sportonica.com">support@sportonica.com</a>
          <span className="adp-sep" aria-hidden />
          <Link href="/">Back to Sportonica</Link>
        </div>
      </div>
    </div>
  );
}
