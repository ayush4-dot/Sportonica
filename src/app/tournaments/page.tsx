import type { Metadata } from "next";
import { listTournaments } from "@/lib/play/tournaments";
import TournamentsClient from "./TournamentsClient";
import "@/app/(play)/play.css";
import "@/components/home/rails.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments · Sportonica",
  description: "Organised tournaments and events run by venues and by Sportonica — join and pay the same way you book a game.",
};

export default async function TournamentsPage() {
  const events = await listTournaments();
  return <TournamentsClient events={events} />;
}
