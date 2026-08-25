import { redirect } from "next/navigation";

export default async function AdminTournamentDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/organize/tournaments/${id}`);
}
