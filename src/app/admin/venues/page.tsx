import Link from "next/link";
import { Plus, Building2, ChevronRight } from "lucide-react";
import { getMyVenues, getCourtsForVenues } from "@/lib/admin/queries";
import { Topbar, VerifyBadge } from "../ui";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const venues = await getMyVenues();
  const courts = await getCourtsForVenues(venues.map((v) => v.id));

  return (
    <>
      <Topbar
        title="Venues & courts"
        crumb="MANAGE"
        action={<Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>}
      />
      <div className="adm-body">
        {venues.length === 0 ? (
          <div className="adm-empty">
            <div className="adm-empty-icon"><Building2 size={22} /></div>
            <h3>No venues yet</h3>
            <p>Create a venue to start listing courts and taking bookings.</p>
            <Link href="/admin/venues/new" className="adm-btn primary"><Plus size={15} /> Add venue</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {venues.map((v) => {
              const vCourts = courts.filter((c) => c.venue_id === v.id);
              return (
                <Link key={v.id} href={`/admin/venues/${v.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="adm-card adm-between" style={{ cursor: "pointer" }}>
                    <div className="adm-flex">
                      <div style={{
                        width: 46, height: 46, borderRadius: 11, background: "var(--a-panel-2)",
                        display: "grid", placeItems: "center", color: "var(--a-accent)",
                      }}>
                        <Building2 size={20} />
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--a-disp)", fontWeight: 700, fontSize: 16 }}>{v.name}</div>
                        <div className="adm-dim" style={{ fontSize: 12.5 }}>
                          {v.address ?? v.venue_type} · {vCourts.length} court{vCourts.length !== 1 ? "s" : ""}
                          {v.sports.length > 0 && <> · {v.sports.join(", ")}</>}
                        </div>
                      </div>
                    </div>
                    <div className="adm-flex">
                      <VerifyBadge status={v.verification_status} />
                      <ChevronRight size={18} className="adm-dim" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
