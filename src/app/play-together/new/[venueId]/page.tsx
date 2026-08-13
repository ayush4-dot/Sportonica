import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { getVenueForBooking } from "@/lib/play/queries";
import PlayTogetherWizard from "./PlayTogetherWizard";

export const dynamic = "force-dynamic";

export default async function NewPlayTogetherGamePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { venue, courts, hoursByCourt } = await getVenueForBooking(venueId);
  if (!venue) notFound();

  const photo = venue.photos?.[0];

  return (
    <div className="play">
      <div className="play-wrap">
        <Link href="/play-together/new" className="bk-back"><ArrowLeft size={16} /> All venues</Link>

        <div className="bk-hero">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={venue.name} />
          ) : (
            <div className="bk-hero-empty"><ImageIcon size={40} /></div>
          )}
          <div className="bk-hero-grad" />
        </div>
        <div className="bk-hero-info">
          <h1>Host at {venue.name}</h1>
        </div>

        <PlayTogetherWizard venueName={venue.name} courts={courts} hoursByCourt={hoursByCourt} />
      </div>
    </div>
  );
}
