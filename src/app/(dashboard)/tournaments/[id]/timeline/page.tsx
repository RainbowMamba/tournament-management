import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTournament } from "@/lib/actions/tournament";
import { Button } from "@/components/ui/button";
import { TimelineView } from "@/components/tournament/timeline-view";
import { getTranslations } from "next-intl/server";
import { buildMainMatchLabels } from "@/lib/tournament/labels";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TournamentTimelinePage({ params }: Props) {
  const { id } = await params;
  const tournament = await getTournament(id);

  if (!tournament) {
    notFound();
  }

  const t = await getTranslations("courtView.timeline");

  // Build the data the timeline view needs (avoid sending the whole tournament).
  const stageById = new Map(tournament.stages.map((s) => [s.id, s.type as "QUALIFYING" | "MAIN"]));

  // Round-position labels for every main draw match: "F", "SF #1", "QF #3", etc.
  const mainMatches = tournament.matches.filter((m) => stageById.get(m.stageId) === "MAIN");
  const mainLabels = buildMainMatchLabels(mainMatches);

  // Group-name + index-within-group for each qualifying match.
  const groupNameById = new Map<string, string>();
  for (const stage of tournament.stages) {
    for (const group of stage.groups) {
      groupNameById.set(group.id, group.name);
    }
  }
  const indexInGroupById = new Map<string, number>();
  const matchesByGroup = new Map<string, typeof tournament.matches>();
  for (const m of tournament.matches) {
    if (!m.groupId) continue;
    const arr = matchesByGroup.get(m.groupId) ?? [];
    arr.push(m);
    matchesByGroup.set(m.groupId, arr);
  }
  for (const [, ms] of matchesByGroup) {
    const sorted = ms.slice().sort((a, b) => a.matchNumber - b.matchNumber);
    sorted.forEach((m, idx) => indexInGroupById.set(m.id, idx + 1));
  }

  // For each match, find the feeder match that fills its home/away slot.
  const feederByTarget = new Map<string, { home?: string; away?: string }>();
  for (const m of tournament.matches) {
    if (!m.nextMatchId || m.nextMatchSlot === null) continue;
    const entry = feederByTarget.get(m.nextMatchId) ?? {};
    if (m.nextMatchSlot === 0) entry.home = m.id;
    else entry.away = m.id;
    feederByTarget.set(m.nextMatchId, entry);
  }

  const scheduledMatches = tournament.matches
    .filter((m) => m.scheduledAt && m.courtId && m.courtNumber !== null)
    .map((m) => {
      const feeders = feederByTarget.get(m.id);
      return {
        id: m.id,
        scheduledAt: m.scheduledAt!.toISOString(),
        courtId: m.courtId!,
        courtNumber: m.courtNumber!,
        stageType: stageById.get(m.stageId) ?? "MAIN",
        round: m.round,
        matchNumber: m.matchNumber,
        mainLabel: mainLabels.get(m.id) ?? null,
        qualifyingGroupName: m.groupId ? groupNameById.get(m.groupId) ?? null : null,
        qualifyingIndexInGroup: indexInGroupById.get(m.id) ?? null,
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
        homePlaceholder:
          m.homePlaceholderGroup && m.homePlaceholderRank
            ? { groupName: m.homePlaceholderGroup.name, rank: m.homePlaceholderRank }
            : null,
        awayPlaceholder:
          m.awayPlaceholderGroup && m.awayPlaceholderRank
            ? { groupName: m.awayPlaceholderGroup.name, rank: m.awayPlaceholderRank }
            : null,
        homeWinnerOfLabel: feeders?.home ? mainLabels.get(feeders.home) ?? null : null,
        awayWinnerOfLabel: feeders?.away ? mainLabels.get(feeders.away) ?? null : null,
      };
    });

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <Link href={`/tournaments/${id}`}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToTournament")}
        </Button>
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{tournament.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
      </div>

      <TimelineView
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        venues={tournament.courts.map((c) => ({
          id: c.id,
          name: c.name,
          numCourts: c.numCourts,
        }))}
        scheduledMatches={scheduledMatches}
      />
    </div>
  );
}
