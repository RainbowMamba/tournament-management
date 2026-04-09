"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourtView } from "./court-view";
import { DrawView } from "./draw-view";
import { LayoutGrid, Trophy } from "lucide-react";

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
};

export function TournamentTabs({ tournament }: Props) {
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

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="court">
          <LayoutGrid className="h-4 w-4" />
          {t('courtView')}
        </TabsTrigger>
        <TabsTrigger value="draw">
          <Trophy className="h-4 w-4" />
          {t('drawView')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="court">
        <CourtView tournament={tournament} />
      </TabsContent>

      <TabsContent value="draw">
        <DrawView
          tournament={tournament}
          activeStage={drawStage}
          onStageChange={setDrawStage}
        />
      </TabsContent>
    </Tabs>
  );
}
