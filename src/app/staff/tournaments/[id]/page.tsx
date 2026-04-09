import { notFound } from "next/navigation";
import { getStaffTournament } from "@/lib/actions/tournament";
import { isTournamentVerified } from "@/lib/staff-session";
import { StaffTournamentPageClient } from "./client";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StaffTournamentPage({ params }: Props) {
  const { id } = await params;
  
  // Check if tournament is verified
  const verified = await isTournamentVerified(id);
  
  if (!verified) {
    // Show verification dialog (handled by client component)
    return <StaffTournamentPageClient tournamentId={id} />;
  }

  // Load tournament data
  const tournament = await getStaffTournament(id);

  if (!tournament) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <StaffTournamentPageClient tournamentId={id} tournament={tournament} />
    </div>
  );
}
