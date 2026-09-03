"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { actionError, type ActionError } from "@/lib/actionError";
import { isValidLocalPhone, normalizePhone } from "@/lib/validation/identity";

// Internal e-mail synthesised for a phone-only account. The user never
// sees or types it — phone login resolves it back via email_for_phone().
// A dedicated subdomain keeps it from ever colliding with a real address.
function syntheticEmailForPhone(digits: string): string {
  return `${digits}@phone.sportonica.com`;
}

// Phone-based login: the app stores phone on `profiles`, not in Supabase
// Auth, so "sign in with phone + password" is a two-step — map the phone
// to its account email here (via a SECURITY DEFINER RPC that can read
// auth.users), then the client does the normal password sign-in.
export async function resolveEmailForPhone(
  phone: string,
): Promise<{ email: string } | ActionError> {
  if (!isValidLocalPhone(phone)) return actionError("INVALID_PHONE");

  const sb = await createClient();
  const { data, error } = await sb.rpc("email_for_phone", {
    p_phone: normalizePhone(phone),
  });
  if (error || !data) return actionError("NOT_FOUND");

  return { email: String(data) };
}

// Phone-only signup. Supabase's own phone provider needs an SMS gateway
// (OTP) which isn't set up — so we create the account through the admin
// API with a synthetic, pre-confirmed e-mail and stash the real phone in
// user metadata. The handle_new_user() trigger
// (supabase/identity_validation.sql) copies it onto profiles.phone
// and enforces the 10-digit format + UNIQUE constraint. The client then
// signs in with password to get a real session.
export async function signUpWithPhone(input: {
  name: string;
  phone: string;
  password: string;
  role: "player" | "venue_owner";
}): Promise<{ email: string } | ActionError> {
  const name = input.name.trim();
  if (!name) return actionError("Enter your name.");
  if (!isValidLocalPhone(input.phone)) {
    return actionError("Phone number must contain exactly 10 digits.");
  }
  if (input.password.length < 6) {
    return actionError("Password needs at least 6 characters.");
  }
  const role = input.role === "venue_owner" ? "venue_owner" : "player";
  const digits = normalizePhone(input.phone);
  const email = syntheticEmailForPhone(digits);

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return actionError("Phone signup isn't available right now — please use email.");
  }

  // Friendly pre-check; the DB UNIQUE index is the real guard against a race.
  const { data: existing } = await admin
    .from("profiles").select("id").eq("phone", digits).maybeSingle();
  if (existing) return actionError("An account with this phone number already exists.");

  const { error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: name, phone: digits, role },
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("phone_taken") || m.includes("already been registered") || m.includes("duplicate")) {
      return actionError("An account with this phone number already exists.");
    }
    if (m.includes("phone_invalid")) {
      return actionError("Phone number must contain exactly 10 digits.");
    }
    console.error("[signUpWithPhone]", error.message);
    return actionError("Could not create your account. Please try again.");
  }

  return { email };
}
