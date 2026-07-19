import { browseVenues } from "@/lib/play/queries";
import MosaicGrid from "./MosaicGrid";
import "./mosaic.css";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const venues = await browseVenues();
  return <MosaicGrid venues={venues} />;
}
