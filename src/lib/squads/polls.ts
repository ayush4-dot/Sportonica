"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { sb, user };
}

export interface PollOption { option_id: string; label: string; votes: number; position: number }
export interface Poll {
  id: string;
  squad_id: string;
  creator_id: string;
  question: string;
  closed: boolean;
  multi: boolean;
  created_at: string;
  options: PollOption[];
  myVotes: string[];      // option ids this user picked
  totalVotes: number;
}

// Create a poll with its options.
export async function createPoll(input: {
  squadId: string;
  question: string;
  options: string[];
  multi?: boolean;
}) {
  const { sb, user } = await requireUser();
  const clean = input.options.map((o) => o.trim()).filter(Boolean);
  if (!input.question.trim()) throw new Error("Add a question.");
  if (clean.length < 2) throw new Error("Add at least two options.");

  const { data: poll, error } = await sb.from("squad_polls").insert({
    squad_id: input.squadId,
    creator_id: user.id,
    question: input.question.trim(),
    multi: input.multi ?? false,
  }).select().single();
  if (error) throw new Error(error.message);

  const { error: optErr } = await sb.from("squad_poll_options").insert(
    clean.map((label, i) => ({ poll_id: poll.id, label, position: i }))
  );
  if (optErr) throw new Error(optErr.message);

  revalidatePath(`/league/${input.squadId}`);
  return poll;
}

// Vote (or change your vote).
export async function castVote(pollId: string, optionId: string, squadId: string) {
  const { sb, user } = await requireUser();

  const { data: poll } = await sb
    .from("squad_polls").select("multi, closed").eq("id", pollId).maybeSingle();
  if (!poll) throw new Error("Poll not found.");
  if (poll.closed) throw new Error("This poll is closed.");

  // Single-choice: clear previous vote first. Multi: toggle this option.
  const { data: existing } = await sb
    .from("squad_poll_votes").select("option_id")
    .eq("poll_id", pollId).eq("user_id", user.id);
  const mine = new Set((existing ?? []).map((v) => v.option_id));

  if (mine.has(optionId)) {
    await sb.from("squad_poll_votes").delete()
      .eq("poll_id", pollId).eq("user_id", user.id).eq("option_id", optionId);
  } else {
    if (!poll.multi && mine.size > 0) {
      await sb.from("squad_poll_votes").delete()
        .eq("poll_id", pollId).eq("user_id", user.id);
    }
    const { error } = await sb.from("squad_poll_votes").insert({
      poll_id: pollId, option_id: optionId, user_id: user.id,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  }

  revalidatePath(`/league/${squadId}`);
}

export async function closePoll(pollId: string, squadId: string) {
  const { sb } = await requireUser();
  const { error } = await sb.from("squad_polls").update({ closed: true }).eq("id", pollId);
  if (error) throw new Error(error.message);
  revalidatePath(`/league/${squadId}`);
}
