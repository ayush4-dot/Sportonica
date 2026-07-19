import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getVenue } from "@/lib/admin/queries";
import { Topbar } from "../../../ui";
import EditVenueForm from "./EditVenueForm";

export const dynamic = "force-dynamic";

export default async function EditVenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();

  return (
    <>
      <Topbar title={`Edit · ${venue.name}`} crumb="MANAGE / VENUES" />
      <div className="adm-body">
        <Link href={`/admin/venues/${id}`} className="adm-btn sm ghost" style={{ marginBottom: 18 }}>
          <ArrowLeft size={14} /> Back to venue
        </Link>
        <EditVenueForm venue={venue} />
      </div>
    </>
  );
}
