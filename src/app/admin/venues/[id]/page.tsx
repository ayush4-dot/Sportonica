import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Tag, Users, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getVenue, getCourts } from "@/lib/admin/queries";
import type { CourtHours } from "@/lib/admin/types";
import { Topbar, VerifyBadge } from "../../ui";
import CourtManager from "./CourtManager";

export const dynamic = "force-dynamic";

export default async function VenueDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();

  const courts = await getCourts(id);
  const sb = await createClient();
  const courtIds = courts.map((c) => c.id);
  const { data: hoursRows } = courtIds.length
    ? await sb.from("court_hours").select("*").in("court_id", courtIds)
    : { data: [] as CourtHours[] };

  const hoursByCourt: Record<string, CourtHours[]> = {};
  (hoursRows ?? []).forEach((h) => {
    (hoursByCourt[h.court_id] ??= []).push(h);
  });

  return (
    <>
      <Topbar
        title={venue.name}
        crumb="MANAGE / VENUES"
        action={
          <div className="adm-flex" style={{ gap: 10 }}>
            <Link href={`/admin/venues/${venue.id}/edit`} className="adm-btn sm">Edit venue</Link>
            <VerifyBadge status={venue.verification_status} />
          </div>
        }
      />
      <div className="adm-body" style={{ maxWidth: 900 }}>
        <Link href="/admin/venues" className="adm-btn sm ghost" style={{ marginBottom: 18 }}>
          <ArrowLeft size={14} /> All venues
        </Link>

        {/* Quick actions */}
        <div className="adm-grid-3" style={{ marginBottom: 20 }}>
          <Link href={`/admin/calendar?venue=${venue.id}`} className="adm-card" style={{ textDecoration: "none", color: "inherit", padding: 16 }}>
            <CalendarClock size={18} style={{ color: "var(--a-sodium)", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Calendar</div>
            <div className="adm-dim" style={{ fontSize: 12 }}>Bookings & blocks</div>
          </Link>
          <Link href={`/admin/pricing?venue=${venue.id}`} className="adm-card" style={{ textDecoration: "none", color: "inherit", padding: 16 }}>
            <Tag size={18} style={{ color: "var(--a-lime)", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Pricing rules</div>
            <div className="adm-dim" style={{ fontSize: 12 }}>Peak & off-peak</div>
          </Link>
          <Link href={`/admin/staff?venue=${venue.id}`} className="adm-card" style={{ textDecoration: "none", color: "inherit", padding: 16 }}>
            <Users size={18} style={{ color: "var(--a-sky)", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Staff</div>
            <div className="adm-dim" style={{ fontSize: 12 }}>Roles & access</div>
          </Link>
        </div>

        <CourtManager
          venueId={venue.id}
          venueSports={venue.sports}
          courts={courts}
          hoursByCourt={hoursByCourt}
        />

        {venue.verification_status === "unverified" && (
          <div className="adm-card" style={{ marginTop: 20, borderColor: "rgba(255,201,60,0.25)" }}>
            <div className="adm-flex" style={{ alignItems: "flex-start", gap: 14 }}>
              <ShieldCheck size={20} style={{ color: "var(--a-sodium)", marginTop: 2 }} />
              <div>
                <div className="adm-card-t">Get verified to lift your payout cap</div>
                <div className="adm-card-sub" style={{ marginBottom: 12 }}>
                  Verified venues get uncapped payouts and a trust badge players can see. It's a quick phone check plus one visit or document.
                </div>
                <button className="adm-btn sm">Start verification</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
