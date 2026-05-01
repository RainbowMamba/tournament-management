"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourtViewReadonly } from "./court-view-readonly";
import { DrawViewReadonly } from "./draw-view-readonly";
import { TimelineView } from "./timeline-view";
import { LayoutGrid, Trophy, CalendarDays } from "lucide-react";
import type { TimelineScheduledMatch } from "@/lib/tournament/timeline-data";

type TournamentWithRelations = {
  id: string;
  name: string;
  hasQualifying: boolean;
  tiebreakerPriority: "HEAD_TO_HEAD" | "GAMES_WON";
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  courts: Array<{
    id: string;
    name: string;
    numCourts: number;
    location?: string | null;
  }>;
  stages: Array<{
    id: string;
    type: "QUALIFYING" | "MAIN";
    numGroups: number | null;
    teamsPerGroup: number | null;
    teamsAdvancing: number | null;
    totalTeams: number | null;
    groups: Array<{
      id: string;
      name: string;
      index: number;
      teams: Array<{
        id: string;
        name: string;
        seed: number | null;
      }>;
    }>;
  }>;
  teams: Array<{
    id: string;
    name: string;
    seed: number | null;
    groupId: string | null;
  }>;
  matches: Array<{
    id: string;
    round: number;
    matchNumber: number;
    status: "PENDING" | "ON_COURT" | "COMPLETED";
    stageId: string;
    groupId: string | null;
    courtId: string | null;
    courtNumber: number | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    winnerTeamId: string | null;
    homeScore: number | null;
    awayScore: number | null;
    scoreDetails: string | null;
    homeTeam: { id: string; name: string } | null;
    awayTeam: { id: string; name: string } | null;
    winnerTeam: { id: string; name: string } | null;
    court: { id: string; name: string; numCourts: number } | null;
    homePlaceholderGroupId: string | null;
    homePlaceholderRank: number | null;
    homePlaceholderGroup: { id: string; name: string } | null;
    awayPlaceholderGroupId: string | null;
    awayPlaceholderRank: number | null;
    awayPlaceholderGroup: { id: string; name: string } | null;
  }>;
};

type Props = {
  tournament: TournamentWithRelations;
  scheduledMatches: TimelineScheduledMatch[];
};

export function TournamentTabsReadonly({ tournament, scheduledMatches }: Props) {
  const [activeTab, setActiveTab] = useState("court");
  const t = useTranslations('tournaments.tabs');

  // Calculate initial draw stage based on match availability
  const initialDrawStage = useMemo(() => {
    const qualifyingStage = tournament.stages.find((s) => s.type === "QUALIFYING");
    const qualifyingMatches = tournament.matches.filter((m) => m.stageId === qualifyingStage?.id);
    return qualifyingMatches.length > 0 ? "qualifying" : "main";
  }, [tournament.stages, tournament.matches]);

  // Lift draw view stage state to parent so it persists across tab switches
  const [drawStage, setDrawStage] = useState<"qualifying" | "main">(initialDrawStage);

  const hasTimeline = scheduledMatches.length > 0;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className={hasTimeline ? "w-full max-w-xl" : "w-full max-w-md"}>
        <TabsTrigger value="court">
          <LayoutGrid className="h-4 w-4" />
          {t('courtView')}
        </TabsTrigger>
        <TabsTrigger value="draw">
          <Trophy className="h-4 w-4" />
          {t('drawView')}
        </TabsTrigger>
        {hasTimeline && (
          <TabsTrigger value="timeline">
            <CalendarDays className="h-4 w-4" />
            {t('timelineView')}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="court">
        <CourtViewReadonly tournament={tournament} />
      </TabsContent>

      <TabsContent value="draw">
        <DrawViewReadonly
          tournament={tournament}
          activeStage={drawStage}
          onStageChange={setDrawStage}
        />
      </TabsContent>

      {hasTimeline && (
        <TabsContent value="timeline">
          <TimelineView
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            venues={tournament.courts.map((c) => ({
              id: c.id,
              name: c.name,
              numCourts: c.numCourts,
            }))}
            scheduledMatches={scheduledMatches}
            readonly
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
