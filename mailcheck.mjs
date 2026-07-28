/** Brevo check — node brevo-check.mjs you@example.com */
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const key = env.BREVO_API_KEY, from = env.MAIL_FROM, to = process.argv[2];
console.log("\n=== 1. Key check ===");
if (!key) { console.log("❌ BREVO_API_KEY missing\n"); process.exit(1); }
console.log(`   Key starts with: ${key.slice(0, 9)}`);
if (key.startsWith("xsmtpsib-")) {
  console.log("\n❌ That's the SMTP key. You need the API key.");
  console.log("   Brevo → top-right account name → SMTP & API → 'API Keys' TAB");
  console.log("   → 'Generate a new API key' button, TOP-RIGHT of the page");
  console.log("   → the value starts with xkeysib-\n");
  process.exit(1);
}
if (!key.startsWith("xkeysib-")) console.log("⚠️  Expected it to start with xkeysib-");

console.log("\n=== 2. Does Brevo accept the key? ===");
const acc = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key } });
if (!acc.ok) { console.log(`❌ ${acc.status} — ${await acc.text()}\n`); process.exit(1); }
console.log("✅ Key is valid");

console.log("\n=== 3. Verified senders ===");
const s = await fetch("https://api.brevo.com/v3/senders", { headers: { "api-key": key } });
if (s.ok) {
  const d = await s.json();
  for (const x of d.senders ?? []) console.log(`   ${x.active ? "✅" : "⏳"} ${x.email}`);
  if (from && !(d.senders ?? []).some((x) => x.email === from && x.active))
    console.log(`\n⚠️  MAIL_FROM (${from}) is not an active verified sender.`);
} 

if (!to) { console.log("\nAdd a recipient to send a test: node brevo-check.mjs you@example.com\n"); process.exit(0); }
console.log(`\n=== 4. Sending test to ${to} ===`);
const r = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    sender: { name: "Khelam Na", email: from ?? "noreply@khelamna.com" },
    to: [{ email: to }], subject: "Khelam Na — test",
    textContent: "If you're reading this, email works.",
  }),
});
console.log(r.ok ? `\n✅ Accepted (${r.status}). Check ${to}, including spam.\n`
                 : `\n❌ Rejected (${r.status})\n   ${await r.text()}\n`);
