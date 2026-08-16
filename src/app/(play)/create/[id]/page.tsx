import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ImageIcon, ShieldCheck } from "lucide-react";
import { getVenueForBooking } from "@/lib/play/queries";
import BookingFlow from "./BookingFlow";
import { getVenuePricingRules } from "@/lib/play/pricing";

export const dynamic = "force-dynamic";

export default async function VenueBookingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; time?: string; sport?: string }>;
}) {
  const { id } = await params;
  const { date, time, sport } = await searchParams;
  const timeMins = time != null && /^\d+$/.test(time) ? Number(time) : undefined;
  const { venue, courts, hoursByCourt } = await getVenueForBooking(id);
  if (!venue) notFound();

  const backHref = sport ? `/create?sport=${encodeURIComponent(sport)}` : "/create";

  const photo = venue.photos?.[0];
  const pricingRules = await getVenuePricingRules(id);

  return (
    <div className="play">
      <div className="play-wrap">
        <Link href={backHref} className="bk-back"><ArrowLeft size={16} /> All venues</Link>

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
          <h1>{venue.name}</h1>
          <div className="sub">
              {(venue.maps_url || (venue.lat != null && venue.lng != null)) && (
                <a
                  href={venue.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: "#006241", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 }}
                >
                  <MapPin size={14} /> View location
                </a>
              )}
              {venue.verification_status === "verified" && (
                <span style={{ color: "var(--turf)" }}><ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Verified venue</span>
            )}
          </div>
        </div>

        <BookingFlow
          venueName={venue.name}
          courts={courts}
          hoursByCourt={hoursByCourt}
          initialDate={date}
          initialHour={timeMins != null ? timeMins / 60 : undefined}
          rules={pricingRules}
        />
      </div>
    </div>
  );
}
