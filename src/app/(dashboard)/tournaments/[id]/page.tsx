import { notFound, redirect } from "next/navigation";
import { getTournament } from "@/lib/actions/tournament";
import { TournamentHeader } from "@/components/tournament/tournament-header";
import { TournamentTabs } from "@/components/tournament/tournament-tabs";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TournamentPage({ params }: Props) {
  const { id } = await params;
  const tournament = await getTournament(id);

  if (!tournament) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <TournamentHeader tournament={tournament} />
      <TournamentTabs tournament={tournament} />
    </div>
  );
}

