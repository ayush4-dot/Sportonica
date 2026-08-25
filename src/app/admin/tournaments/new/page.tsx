import { redirect } from "next/navigation";

export default function AdminNewTournamentRedirect() {
  redirect("/organize/tournaments/new");
}
