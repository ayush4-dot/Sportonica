// ================================================================
// The mailer. ONE place in the entire app that actually sends email.
//
// Today it logs to the terminal. When SMTP (Brevo) is ready, only the
// `deliver` function below changes — every caller stays untouched.
// This is why booking code should never talk to an email provider
// directly: the "what to say" and the "how to send it" are different
// jobs with different reasons to change.
// ================================================================

export interface Mail {
  to: string;
  subject: string;
  body: string;   // plain text — readable in logs, fine in email
}

const FROM = "Khelam Na <noreply@khelamna.com>";

// ── The only function that touches a delivery mechanism ─────────
async function deliver(mail: Mail): Promise<void> {
  const brevoKey = process.env.BREVO_API_KEY;

  // No provider configured → log it. The whole flow stays testable.
  if (!brevoKey) {
    console.log(
      [
        "",
        "┌─ EMAIL (not sent — no BREVO_API_KEY set) ──────────────",
        `│ To:      ${mail.to}`,
        `│ From:    ${FROM}`,
        `│ Subject: ${mail.subject}`,
        "├────────────────────────────────────────────────────────",
        mail.body.split("\n").map((l) => `│ ${l}`).join("\n"),
        "└────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );
    return;
  }

  // ── Real sending, once BREVO_API_KEY exists ───────────────────
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Khelam Na", email: process.env.MAIL_FROM ?? "noreply@khelamna.com" },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.body,
      }),
    });
  } catch (err) {
    // Never let a failed email break a booking. Log and move on.
    console.error("[mail] delivery failed:", err);
  }
}

// ── Public API: fire-and-forget ─────────────────────────────────
// Notifications must never block or break the thing that triggered them.
// A booking that succeeded should stay succeeded even if email dies.
export async function sendMail(mail: Mail | Mail[]): Promise<void> {
  const list = Array.isArray(mail) ? mail : [mail];
  await Promise.allSettled(list.map(deliver));
}
