"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail/mailer";
import { fmtWhen } from "@/lib/mail/templates";
import { actionError, type ActionError } from "@/lib/actionError";
import type { User } from "@supabase/supabase-js";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

type HostEvent = { id: string; host_id: string; title: string; event_date: string; venue: string };
type RequireHostAuth =
  | { error: ActionError; sb?: undefined; user?: undefined; ev?: undefined }
  | { error?: undefined; sb: Awaited<ReturnType<typeof createClient>>; user: User; ev: HostEvent };

// ── Guard: only the host of an event may change it ────────────────
async function requireHost(eventId: string): Promise<RequireHostAuth> {
  const { sb, user } = await requireUser();
  if (!user) return { error: actionError("You need to be signed in.") };
  const { data: ev } = await sb
    .from("events")
    .select("id, host_id, title, event_date, venue")
    .eq("id", eventId)
    .single();
  if (!ev) return { error: actionError("Game not found.") };
  if (ev.host_id !== user.id) return { error: actionError("Only the host can change this game.") };
  return { sb, user, ev };
}

// ================================================================
// Edit a hosted game
// ================================================================
export async function updateHostedGame(input: {
  eventId: string;
  title?: string;
  event_date?: string;
  fee?: number;
  max_players?: number;
  skill_level?: string | null;
  notes?: string | null;
}) {
  const auth = await requireHost(input.eventId);
  if (auth.error) return auth.error;
  const { sb, ev } = auth;

  // Never shrink capacity below the people already confirmed.
  if (input.max_players != null) {
    const { count } = await sb
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", input.eventId)
      .eq("status", "confirmed");
    if ((count ?? 0) > input.max_players) {
      return actionError(`${count} players already joined — capacity can't go below that.`);
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.title != null) patch.title = input.title;
  if (input.event_date != null) patch.event_date = input.event_date;
  if (input.fee != null) patch.fee = input.fee;
  if (input.max_players != null) patch.max_players = input.max_players;
  if (input.skill_level !== undefined) patch.skill_level = input.skill_level;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await sb.from("events").update(patch).eq("id", input.eventId);
  if (error) return actionError(error.message);

  // Tell everyone who joined that the details moved.
  const timeChanged = input.event_date != null && input.event_date !== ev.event_date;
  if (timeChanged) {
    const { data: joins } = await sb
      .from("bookings")
      .select("user_id")
      .eq("event_id", input.eventId)
      .eq("status", "confirmed");

    const ids = (joins ?? []).map((j: { user_id: string }) => j.user_id);
    if (ids.length) {
      // In-app notifications for each player.
      await sb.from("notifications").insert(
        ids.map((uid) => ({
          user_id: uid,
          kind: "event",
          title: `${ev.title} was rescheduled`,
          body: `New time: ${fmtWhen(input.event_date!)}`,
          event_id: input.eventId,
        }))
      );
    }
  }

  revalidatePath("/my-games");
  revalidatePath("/discover");
}

// ================================================================
// Invite players — the host covers their spots
// ================================================================
export async function invitePlayers(input: {
  eventId: string;
  emails: string[];
  /** true = the host is paying for these spots (the usual case) */
  hostPays?: boolean;
}) {
  const auth = await requireHost(input.eventId);
  if (auth.error) return auth.error;
  const { sb, user, ev } = auth;
  const hostPays = input.hostPays ?? true;

  const emails = input.emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (!emails.length) return actionError("Add at least one email address.");

  // Capacity check before inviting.
  const { data: evFull } = await sb
    .from("events_with_counts")
    .select("slots_remaining")
    .eq("id", input.eventId)
    .single();
  const left = Number(evFull?.slots_remaining ?? 0);
  if (emails.length > left) {
    return actionError(`Only ${left} spot${left === 1 ? "" : "s"} left — you invited ${emails.length}.`);
  }

  const { data: hostProfile } = await sb
    .from("profiles").select("full_name").eq("id", user.id).single();
  const hostName = hostProfile?.full_name ?? "Your host";

  // Record the invites.
  const { error } = await sb.from("invites").insert(
    emails.map((email) => ({
      event_id: input.eventId,
      email,
      invited_by: user.id,
      paid_by_host: hostPays,
    }))
  );
  if (error) return actionError(error.message);

  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://khelumna.vercel.app"}/game/${input.eventId}`;
  await sendMail(
    emails.map((to) => ({
      to,
      subject: `${hostName} invited you to ${ev.title}`,
      body: [
        `${hostName} has invited you to play.`,
        ``,
        `Game:  ${ev.title}`,
        `Where: ${ev.venue}`,
        `When:  ${fmtWhen(ev.event_date)}`,
        ``,
        hostPays
          ? `Your spot is already paid for by ${hostName}. Just turn up.`
          : `You can pay for your spot when you join.`,
        ``,
        `Details and RSVP: ${link}`,
        ``,
        `— Sportonica`,
      ].join("\n"),
    }))
  );

  revalidatePath("/my-games");
}

// ================================================================
// Remove an invite
// ================================================================
export async function cancelInvite(inviteId: string, eventId: string) {
  const auth = await requireHost(eventId);
  if (auth.error) return auth.error;
  const { error } = await auth.sb.from("invites").delete().eq("id", inviteId);
  if (error) return actionError(error.message);
  revalidatePath("/my-games");
}
