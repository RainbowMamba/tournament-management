import { notFound } from "next/navigation";
import { getPublicTournament } from "@/lib/actions/tournament";
import { TournamentHeaderReadonly } from "@/components/tournament/tournament-header-readonly";
import { TournamentTabsReadonly } from "@/components/tournament/tournament-tabs-readonly";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function GuestTournamentPage({ params }: Props) {
  const { id } = await params;
  const tournament = await getPublicTournament(id);

  if (!tournament) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <TournamentHeaderReadonly tournament={tournament} />
      <TournamentTabsReadonly tournament={tournament} />
    </div>
  );
}

