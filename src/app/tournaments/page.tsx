import type { Metadata } from "next";
import { listTournaments } from "@/lib/play/tournaments";
import TournamentsClient from "./TournamentsClient";
import "@/app/(play)/play.css";
import "@/components/home/rails.css";

// Public browse data — global, non-personalised. Edge-cache it and
// refresh in the background rather than rendering against Sydney per hit.
export const revalidate = 120;

export const metadata: Metadata = {
  title: "Tournaments · Sportonica",
  description: "Organised tournaments and events run by venues and by Sportonica — join and pay the same way you book a game.",
};

export default async function TournamentsPage() {
  const items = await listTournaments();
  return <TournamentsClient items={items} />;
}
