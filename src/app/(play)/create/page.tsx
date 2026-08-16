import type { Metadata } from "next";
import { browseVenues } from "@/lib/play/queries";
import { getLiveOffers } from "@/lib/play/pricing";
import { resolveSportParam } from "@/lib/sports";
import MosaicGrid from "./MosaicGrid";
import "./mosaic.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a court in Kathmandu — Khelam Na",
  description: "Real courts, live availability, hourly slots. Book futsal, cricket, basketball, badminton and more across Kathmandu.",
};

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const [{ sport }, venues, offers] = await Promise.all([
    searchParams,
    browseVenues(),
    getLiveOffers(),
  ]);
  return <MosaicGrid venues={venues} offers={offers} initialSport={resolveSportParam(sport)} />;
}
