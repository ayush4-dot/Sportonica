import Link from "next/link";
import { Tag } from "lucide-react";
import { getMyVenues, getCourts, getPricingRules } from "@/lib/admin/queries";
import { Topbar } from "../ui";
import PricingManager from "./PricingManager";

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: { searchParams: Promise<{ venue?: string }> }) {
  const { venue } = await searchParams;
  const venues = await getMyVenues();
  const activeVenue = venues.find((v) => v.id === venue) ?? venues[0];

  if (!activeVenue) {
    return (
      <>
        <Topbar title="Pricing rules" crumb="MANAGE" />
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><Tag size={22} /></div>
            <h3>No venue yet</h3>
            <p>Add a venue and court to set pricing rules.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        </div>
      </>
    );
  }

  const courts = await getCourts(activeVenue.id);
  const rules = await getPricingRules(courts.map((c) => c.id));

  return (
    <>
      <Topbar title="Pricing rules" crumb={`MANAGE / ${activeVenue.name.toUpperCase()}`} />
      <div className="adm-body" style={{ maxWidth: 900 }}>
        {venues.length > 1 && (
          <div className="adm-flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {venues.map((v) => (
              <Link key={v.id} href={`/admin/pricing?venue=${v.id}`}
                className={`adm-chip ${v.id === activeVenue.id ? "on" : ""}`}>{v.name}</Link>
            ))}
          </div>
        )}
        <PricingManager venueId={activeVenue.id} courts={courts} rules={rules} />
      </div>
    </>
  );
}
