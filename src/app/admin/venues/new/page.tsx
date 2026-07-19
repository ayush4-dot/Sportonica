import { Topbar } from "../../ui";
import VenueForm from "./VenueForm";

export const dynamic = "force-dynamic";

export default function NewVenuePage() {
  return (
    <>
      <Topbar title="Add venue" crumb="MANAGE / VENUES" />
      <VenueForm />
    </>
  );
}
