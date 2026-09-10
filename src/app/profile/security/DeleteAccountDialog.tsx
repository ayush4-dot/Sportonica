"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert, X, TriangleAlert, Loader2, Check, ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccount, type DeletionContext } from "@/lib/auth/deleteAccount";

type Step = "warning" | "confirm" | "reauth" | "ready" | "deleting" | "error" | "done";

const CONFIRM_WORD = "DELETE";
const GENERIC_ERROR = "We couldn't delete your account right now. Please try again.";

export default function DeleteAccountDialog({
  open,
  initialStep = "warning",
  onClose,
  ctx,
  name,
}: {
  open: boolean;
  initialStep?: Step;
  onClose: () => void;
  ctx: DeletionContext;
  name: string;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const confirmValid = typed === CONFIRM_WORD;
  const dismissable = step !== "deleting" && step !== "done";

  const close = useCallback(() => {
    if (!dismissable) return;
    onClose();
  }, [dismissable, onClose]);

  // Focus management + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Esc to close + focus trap.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open) return null;

  async function runDelete() {
    setBusy(true);
    setError(null);
    setStep("deleting");
    try {
      const res = await deleteMyAccount({ confirmText: CONFIRM_WORD });
      if (res.ok) {
        setStep("done");
        // Tear the session down completely, then hard-navigate so no React
        // or RSC state survives and middleware re-evaluates as logged-out.
        try { await createClient().auth.signOut({ scope: "global" }); } catch { /* leaving regardless */ }
        try { localStorage.clear(); sessionStorage.clear(); } catch { /* private mode */ }
        setTimeout(() => { window.location.href = "/"; }, 900);
        return;
      }
      if (res.code === "NOT_SIGNED_IN") {
        setError("Your session has expired. Please sign in again.");
        setStep("error");
        return;
      }
      if (res.code === "REAUTH_REQUIRED") {
        setError("That took a little too long — please confirm it's you again.");
        setStep("reauth");
        setBusy(false);
        return;
      }
      setError(res.message || GENERIC_ERROR);
      setStep("error");
    } catch {
      setError(GENERIC_ERROR);
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReauth() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const { error: authErr } = await createClient().auth.signInWithPassword({
      email: ctx.email ?? "",
      password,
    });
    if (authErr) {
      setBusy(false);
      setError("That password doesn't match. Please try again.");
      return;
    }
    await runDelete();
  }

  function startGoogleReauth() {
    setBusy(true);
    setError(null);
    const origin = window.location.origin;
    const next = encodeURIComponent("/profile/security?reauth=1");
    createClient()
      .auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${next}`,
          queryParams: { prompt: "select_account" },
        },
      })
      .then(({ data, error: oauthErr }) => {
        if (oauthErr || !data?.url) {
          setBusy(false);
          setError("Couldn't start Google sign-in. Please try again.");
          return;
        }
        window.location.href = data.url;
      });
  }

  const back =
    step === "confirm" ? () => { setError(null); setStep("warning"); }
    : step === "reauth" ? () => { setError(null); setStep("confirm"); }
    : null;

  const title =
    step === "done" ? "Account deleted"
    : step === "error" ? "Couldn't delete account"
    : "Delete your account?";

  return (
    <div
      className="pf-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={dialogRef}
        className="pf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="pf-modal-head">
          {back && !busy ? (
            <button type="button" className="pf-modal-nav" onClick={back} aria-label="Back">
              <ArrowLeft size={17} />
            </button>
          ) : (
            <span className="pf-modal-icon" aria-hidden><ShieldAlert size={18} /></span>
          )}
          <h2 id={titleId} className="pf-modal-title">{title}</h2>
          {dismissable && (
            <button type="button" className="pf-modal-nav pf-modal-x" onClick={close} aria-label="Close dialog">
              <X size={18} />
            </button>
          )}
        </div>

        <div id={descId} className="pf-modal-body">
          {step === "warning" && <WarningStep name={name} upcoming={ctx.upcomingBookings} />}

          {step === "confirm" && (
            <>
              <span className="pf-modal-badge"><TriangleAlert size={11} aria-hidden /> Permanent</span>
              <p>
                Type{" "}<strong>{CONFIRM_WORD}</strong>{" "}to confirm. Your account can&apos;t be
                recovered afterwards.
              </p>
              <div className="pf-modal-field">
                <label className="pf-modal-label" htmlFor={`${titleId}-confirm`}>Confirmation</label>
                <input
                  id={`${titleId}-confirm`}
                  className={`pf-modal-input${confirmValid ? " ok" : ""}`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={CONFIRM_WORD}
                />
                {confirmValid && (
                  <span className="pf-modal-check" aria-hidden><Check size={17} /></span>
                )}
              </div>
            </>
          )}

          {step === "reauth" && (
            <>
              <span className="pf-modal-badge"><TriangleAlert size={11} aria-hidden /> Permanent</span>
              {ctx.hasPassword ? (
                <>
                  <p>Enter your password to confirm it&apos;s you.</p>
                  <div className="pf-modal-field">
                    <label className="pf-modal-label" htmlFor={`${titleId}-pw`}>Password</label>
                    <input
                      id={`${titleId}-pw`}
                      className="pf-modal-input plain"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      onKeyDown={(e) => { if (e.key === "Enter") submitPasswordReauth(); }}
                    />
                  </div>
                </>
              ) : (
                <p>
                  You sign in with Google. Continue to confirm with Google, then you&apos;ll come
                  right back here to finish.
                </p>
              )}
            </>
          )}

          {step === "ready" && (
            <>
              <span className="pf-modal-badge"><TriangleAlert size={11} aria-hidden /> Permanent</span>
              <p className="pf-modal-status">
                <Check size={17} className="pf-modal-ok" aria-hidden /> Identity confirmed.
              </p>
              <p>This permanently deletes your account and can&apos;t be undone.</p>
            </>
          )}

          {step === "deleting" && (
            <p className="pf-modal-status" role="status" aria-live="polite">
              <Loader2 size={18} className="pf-modal-spin" aria-hidden /> Deleting your account…
            </p>
          )}

          {step === "done" && (
            <p className="pf-modal-status" role="status" aria-live="polite">
              <Check size={18} className="pf-modal-ok" aria-hidden /> Your account has been deleted.
              Signing you out…
            </p>
          )}

          {step === "error" && (
            <p className="pf-modal-error" role="alert">
              <TriangleAlert size={15} aria-hidden />
              <span>{error ?? GENERIC_ERROR}</span>
            </p>
          )}

          {step === "reauth" && error && (
            <p className="pf-modal-error" role="alert">
              <TriangleAlert size={15} aria-hidden />
              <span>{error}</span>
            </p>
          )}
        </div>

        {/* ── Footers: destructive/primary action first, then the quiet exit ── */}
        {step === "warning" && (
          <div className="pf-modal-foot">
            <button type="button" className="pf-mbtn primary" onClick={() => setStep("confirm")}>Continue</button>
            <button type="button" className="pf-mbtn quiet" onClick={close}>Cancel</button>
          </div>
        )}

        {step === "confirm" && (
          <div className="pf-modal-foot">
            <button
              type="button"
              className="pf-mbtn danger"
              disabled={!confirmValid}
              onClick={() => { setError(null); setStep("reauth"); }}
            >
              Permanently Delete Account
            </button>
            <button type="button" className="pf-mbtn quiet" onClick={close}>Cancel</button>
          </div>
        )}

        {step === "reauth" && (
          <div className="pf-modal-foot">
            {ctx.hasPassword ? (
              <button
                type="button"
                className="pf-mbtn danger"
                disabled={busy || !password}
                onClick={submitPasswordReauth}
              >
                {busy ? "Verifying…" : "Permanently Delete Account"}
              </button>
            ) : (
              <button type="button" className="pf-mbtn danger" disabled={busy} onClick={startGoogleReauth}>
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
            )}
            <button type="button" className="pf-mbtn quiet" onClick={close} disabled={busy}>Cancel</button>
          </div>
        )}

        {step === "ready" && (
          <div className="pf-modal-foot">
            <button type="button" className="pf-mbtn danger" disabled={busy} onClick={runDelete}>
              Permanently Delete Account
            </button>
            <button type="button" className="pf-mbtn quiet" onClick={close}>Cancel</button>
          </div>
        )}

        {step === "error" && (
          <div className="pf-modal-foot">
            {error?.includes("session has expired") ? (
              <Link className="pf-mbtn primary" href="/login?redirect=/profile/security">Sign in again</Link>
            ) : (
              <button type="button" className="pf-mbtn danger" onClick={() => setStep("confirm")}>Try again</button>
            )}
            <button type="button" className="pf-mbtn quiet" onClick={close}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function WarningStep({ name, upcoming }: { name: string; upcoming: number }) {
  return (
    <>
      <span className="pf-modal-badge"><TriangleAlert size={12} /> Permanent</span>
      <p>
        {name}, this permanently closes your Sportonica account. Your account and personal
        information are removed in line with Sportonica&apos;s{" "}
        <Link href="/account-deletion" target="_blank">data-retention policy</Link>. Here&apos;s what happens:
      </p>
      <ul className="pf-modal-list">
        <li><strong>Profile</strong> — your name, photo, bio, sports and city are deleted.</li>
        <li><strong>Email &amp; phone</strong> — removed from your account; your login is destroyed.</li>
        <li><strong>Saved preferences</strong> — favourites and settings are deleted.</li>
        <li><strong>Reputation &amp; activity</strong> — your trust score and play history are deleted.</li>
        <li>
          <strong>Future bookings</strong> —{" "}
          {upcoming > 0
            ? `your ${upcoming} upcoming booking${upcoming === 1 ? "" : "s"} will be cancelled and the court time released.`
            : "any upcoming bookings are cancelled and the court time is released."}
        </li>
        <li><strong>Past bookings</strong> — kept as venue records with your personal details removed (anonymised).</li>
        <li><strong>Payments</strong> — transaction records are kept for accounting, fraud-prevention and legal reasons, unlinked from you and with uploaded screenshots deleted.</li>
        <li><strong>Reviews &amp; messages</strong> — removed or anonymised.</li>
      </ul>
      <p className="pf-modal-note">
        Some records must be retained for business or legal reasons; these are anonymised rather
        than physically deleted. Full details are in the{" "}
        <Link href="/account-deletion" target="_blank">Account Deletion policy</Link>.
      </p>
    </>
  );
}
