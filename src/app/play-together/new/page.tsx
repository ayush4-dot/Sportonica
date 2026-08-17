import Link from "next/link";
import type { Metadata } from "next";
import { ImageIcon } from "lucide-react";
import { browseVenues } from "@/lib/play/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Host a game — Play Together — Sportonica",
  description: "Book and pay for the venue upfront. Players join and reimburse you in cash at the venue.",
};

export default async function NewGameVenuePickerPage() {
  const venues = await browseVenues();

  return (
    <div className="play">
      <div className="play-wrap">
        <div className="play-hero">
          <span className="play-eyebrow">Play Together</span>
          <h1>Pick a <em>venue</em> to host at</h1>
          <p>
            You book and pay for the venue upfront. Players who join reimburse you in cash
            at the venue — Sportonica never collects their contributions.
          </p>
        </div>

        {venues.length === 0 ? (
          <div className="play-empty">
            <h3>No venues available yet</h3>
            <p>Check back soon.</p>
          </div>
        ) : (
          <div className="play-grid">
            {venues.filter((v) => v.courts.length > 0).map((v) => {
              const photo = v.photos?.[0];
              const cheapest = v.courts.reduce((m, c) => Math.min(m, Number(c.base_price)), Infinity);
              return (
                <Link key={v.id} href={`/play-together/new/${v.id}`} className="venue-card">
                  <div className="venue-photo">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={v.name} />
                    ) : (
                      <div className="venue-photo-empty"><ImageIcon size={28} /></div>
                    )}
                    <div className="venue-photo-grad" />
                  </div>
                  <div className="venue-info">
                    <h3>{v.name}</h3>
                    <p className="venue-meta">{v.address ?? v.venue_type}</p>
                    <div className="venue-tags">
                      {[...new Set(v.courts.map((c) => c.sport))].slice(0, 3).map((s) => (
                        <span key={s} className="venue-tag">{s}</span>
                      ))}
                    </div>
                    <div className="venue-price" style={{ marginTop: 12 }}>
                      <span className="amt">Rs {cheapest}<small>/hr from</small></span>
                      <span className="go">Host here →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
