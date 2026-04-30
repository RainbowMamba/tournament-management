import { getStaffTournament } from "@/lib/actions/tournament";
import { StaffTournamentPageClient } from "./client";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StaffTournamentPage({ params }: Props) {
  const { id } = await params;

  // getStaffTournament internally checks isTournamentVerified — no double query needed
  const tournament = await getStaffTournament(id);

  if (!tournament) {
    // Not verified yet — show verification dialog
    return <StaffTournamentPageClient tournamentId={id} />;
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <StaffTournamentPageClient tournamentId={id} tournament={tournament} />
    </div>
  );
}
