import { redirect } from "next/navigation";

// Tournament management moved to /organize — running a tournament no
// longer requires owning the venue it happens at (see
// supabase/organizer/organizer_partnerships.sql). Existing venue owners/managers
// were auto-granted the Organizer role and self-partnered with their own
// venue during that migration, so this keeps working for them unchanged.
export default function AdminTournamentsRedirect() {
  redirect("/organize");
}
