import { browseVenues } from "@/lib/play/queries";
import { getLiveOffers } from "@/lib/play/pricing";
import MosaicGrid from "./MosaicGrid";
import "./mosaic.css";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const [venues, offers] = await Promise.all([browseVenues(), getLiveOffers()]);
  return <MosaicGrid venues={venues} offers={offers} />;
}
