import type { Metadata } from "next";
import { browseVenues } from "@/lib/play/queries";
import { getLiveOffers } from "@/lib/play/pricing";
import MosaicGrid from "./MosaicGrid";
import "./mosaic.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a court in Kathmandu — Khelam Na",
  description: "Real courts, live availability, hourly slots. Book futsal, cricket, basketball, badminton and more across Kathmandu.",
};

export default async function CreatePage() {
  const [venues, offers] = await Promise.all([browseVenues(), getLiveOffers()]);
  return <MosaicGrid venues={venues} offers={offers} />;
}
