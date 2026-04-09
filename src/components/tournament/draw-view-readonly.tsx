"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Trophy, Circle, CheckCircle, Play, LayoutGrid, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { calculateGroupStandings } from "@/lib/tournament";
import type { TiebreakerPriority } from "@/lib/tournament";

type Match = {
  id: string;
  round: number;
  matchNumber: number;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  stageId: string;
  groupId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scoreDetails: string | null;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  winnerTeam: { id: string; name: string } | null;
  homePlaceholderGroupId: string | null;
  homePlaceholderRank: number | null;
  homePlaceholderGroup: { id: string; name: string } | null;
  awayPlaceholderGroupId: string | null;
  awayPlaceholderRank: number | null;
  awayPlaceholderGroup: { id: string; name: string } | null;
};

type TournamentWithRelations = {
  id: string;
  name: string;
  hasQualifying: boolean;
  tiebreakerPriority: TiebreakerPriority;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
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
  matches: Match[];
};

type Props = {
  tournament: TournamentWithRelations;
  activeStage?: "qualifying" | "main";
  onStageChange?: (stage: "qualifying" | "main") => void;
};

const statusConfig = {
  PENDING: { icon: Circle, labelKey: "statusPending" as const, className: "text-muted-foreground" },
  ON_COURT: { icon: Play, labelKey: "statusLive" as const, className: "text-primary" },
  COMPLETED: { icon: CheckCircle, labelKey: "statusCompleted" as const, className: "text-primary" },
} as const;

function ScoreDetailsDialog({ match, children, t, tCommon }: { match: Match; children: React.ReactNode; t: (key: string, values?: Record<string, string>) => string; tCommon: (key: string) => string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scoreDetails')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Match Info */}
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
            <div className="flex flex-col items-start gap-1">
              <span className={cn(
                "font-medium",
                match.winnerTeamId === match.homeTeamId && "text-primary"
              )}>
                {match.homeTeam?.name || tCommon('tbd')}
              </span>
              <span className={cn(
                "font-medium",
                match.winnerTeamId === match.awayTeamId && "text-primary"
              )}>
                {match.awayTeam?.name || tCommon('tbd')}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={cn(
                "font-bold text-lg",
                match.winnerTeamId === match.homeTeamId && "text-primary"
              )}>
                {match.homeScore ?? "-"}
              </span>
              <span className={cn(
                "font-bold text-lg",
                match.winnerTeamId === match.awayTeamId && "text-primary"
              )}>
                {match.awayScore ?? "-"}
              </span>
            </div>
          </div>

          {/* Detailed Score */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{t('setScores')}</h4>
            <div className="p-4 bg-muted/50 rounded-lg font-mono text-center text-lg">
              {match.scoreDetails}
            </div>
          </div>

          {/* Winner */}
          {match.winnerTeam && (
            <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">
                {t('wins', { team: match.winnerTeam.name })}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LayoutMode = "single" | "all";

export function DrawViewReadonly({ tournament, activeStage, onStageChange }: Props) {
  const t = useTranslations('drawView');
  const tCommon = useTranslations('common');

  const getPlaceholderLabel = (groupName: string | undefined, rank: number | null): string | null => {
    if (!groupName || rank === null) return null;
    return t('placeholderRank', { group: groupName, rank: rank.toString() });
  };

  const qualifyingStage = tournament.stages.find((s) => s.type === "QUALIFYING");
  const mainStage = tournament.stages.find((s) => s.type === "MAIN");

  const [selectedGroup, setSelectedGroup] = useState<string>(
    qualifyingStage?.groups[0]?.id || ""
  );
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");

  const qualifyingMatches = tournament.matches.filter(
    (m) => m.stageId === qualifyingStage?.id
  );
  const mainMatches = tournament.matches.filter(
    (m) => m.stageId === mainStage?.id
  );
  
  // Use controlled stage if provided, otherwise fall back to default
  const defaultStage = qualifyingMatches.length > 0 ? "qualifying" : "main";
  const currentStage = activeStage ?? defaultStage;
  
  const handleStageChange = (value: string) => {
    if (value === "qualifying" || value === "main") {
      onStageChange?.(value);
    }
  };

  // Calculate standings for a group using tiebreaker logic
  function getGroupStandings(groupId: string) {
    const groupMatches = qualifyingMatches.filter((m) => m.groupId === groupId);
    const group = qualifyingStage?.groups.find((g) => g.id === groupId);
    if (!group) return [];

    const teamIds = group.teams.map((t) => t.id);
    const matchResults = groupMatches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      winnerTeamId: m.winnerTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
    }));

    const standings = calculateGroupStandings(teamIds, matchResults, tournament.tiebreakerPriority);

    return standings.map((standing) => {
      const team = group.teams.find((t) => t.id === standing.teamId)!;
      return {
        team,
        played: standing.played,
        wins: standing.wins,
        losses: standing.losses,
        gamesWon: standing.gamesWon,
        gamesLost: standing.gamesLost,
        gameDiff: standing.gameDiff,
        points: standing.wins * 2,
      };
    });
  }

  function getGroupMatches(groupId: string) {
    return qualifyingMatches.filter((m) => m.groupId === groupId);
  }

  function getBracketRounds() {
    const rounds: Map<number, Match[]> = new Map();
    mainMatches.forEach((match) => {
      if (!rounds.has(match.round)) {
        rounds.set(match.round, []);
      }
      rounds.get(match.round)!.push(match);
    });
    
    rounds.forEach((matches) => {
      matches.sort((a, b) => a.matchNumber - b.matchNumber);
    });
    
    return Array.from(rounds.entries()).sort((a, b) => a[0] - b[0]);
  }

  const hasNoMatches = tournament.matches.length === 0;

  if (hasNoMatches) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('noMatchesReadonly')}</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            {t('noMatchesReadonlyDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {tournament.hasQualifying && qualifyingStage ? (
        <Tabs value={currentStage} onValueChange={handleStageChange}>
          <TabsList>
            <TabsTrigger value="qualifying" disabled={qualifyingMatches.length === 0}>
              {t('qualifying')}
              {qualifyingMatches.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {qualifyingMatches.filter((m) => m.status === "COMPLETED").length}/
                  {qualifyingMatches.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="main" disabled={mainMatches.length === 0}>
              {t('mainDraw')}
              {mainMatches.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {mainMatches.filter((m) => m.status === "COMPLETED").length}/
                  {mainMatches.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qualifying" className="space-y-6 mt-6">
            {qualifyingStage.groups.length > 1 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {layoutMode === "single" && (
                    <>
                      <span className="text-sm font-medium">{t('selectGroup')}</span>
                      <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {qualifyingStage.groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {t('groupOption', { name: group.name, count: group.teams.length })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  {layoutMode === "all" && (
                    <span className="text-sm text-muted-foreground">
                      {t('showingAllGroups', { count: qualifyingStage.groups.length })}
                    </span>
                  )}
                </div>

                {/* Layout Toggle */}
                <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                  <Button
                    variant={layoutMode === "single" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setLayoutMode("single")}
                    className="gap-2"
                  >
                    <Rows3 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('byGroup')}</span>
                  </Button>
                  <Button
                    variant={layoutMode === "all" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setLayoutMode("all")}
                    className="gap-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('allGroups')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Single Group View */}
            {layoutMode === "single" && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Standings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" />
                      {t('groupStandings', { name: qualifyingStage.groups.find((g) => g.id === selectedGroup)?.name ?? '' })}
                      <Badge variant="outline" className="ml-1 font-normal">
                        {t('teamsCount', { count: qualifyingStage.groups.find((g) => g.id === selectedGroup)?.teams.length ?? 0 })}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t('topAdvance', { count: qualifyingStage.teamsAdvancing ?? 1 })}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">{t('standingsHeaders.rank')}</TableHead>
                          <TableHead>{t('standingsHeaders.team')}</TableHead>
                          <TableHead className="text-center w-12">{t('standingsHeaders.played')}</TableHead>
                          <TableHead className="text-center w-12">{t('standingsHeaders.won')}</TableHead>
                          <TableHead className="text-center w-12">{t('standingsHeaders.lost')}</TableHead>
                          <TableHead className="text-center w-20">{t('standingsHeaders.games')}</TableHead>
                          <TableHead className="text-center w-16">{t('standingsHeaders.points')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getGroupStandings(selectedGroup).map((row, index) => {
                          const teamsAdvancing = qualifyingStage?.teamsAdvancing ?? 1;
                          const isAdvancing = index < teamsAdvancing;

                          return (
                            <TableRow 
                              key={row.team.id}
                              className={isAdvancing ? "bg-primary/5" : ""}
                            >
                              <TableCell>
                                <span className={cn(
                                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                                  isAdvancing 
                                    ? "bg-primary text-primary-foreground" 
                                    : "bg-muted text-muted-foreground"
                                )}>
                                  {index + 1}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">
                                {row.team.name}
                                {isAdvancing && (
                                  <span className="ml-2 text-xs text-primary">✓</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">{row.played}</TableCell>
                              <TableCell className="text-center font-medium text-primary">
                                {row.wins}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">
                                {row.losses}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground text-xs">
                                <span className="font-medium">{row.gamesWon}-{row.gamesLost}</span>
                                <span className={cn(
                                  "ml-1",
                                  row.gameDiff > 0 ? "text-green-600" : row.gameDiff < 0 ? "text-red-600" : ""
                                )}>
                                  ({row.gameDiff > 0 ? "+" : ""}{row.gameDiff})
                                </span>
                              </TableCell>
                              <TableCell className="text-center font-bold">
                                {row.points}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Group Matches */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('matches')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {getGroupMatches(selectedGroup).map((match) => {
                        const StatusIcon = statusConfig[match.status].icon;
                        const isWinnerHome = match.winnerTeamId === match.homeTeamId;
                        const isWinnerAway = match.winnerTeamId === match.awayTeamId;
                        const hasScore = match.homeScore !== null && match.awayScore !== null;
                        const hasDetails = !!match.scoreDetails;

                        const matchContent = (
                          <div
                            className={cn(
                              "flex items-center justify-between p-3 border rounded-lg group relative",
                              match.status === "ON_COURT" && "border-primary bg-primary/5",
                              hasDetails && "cursor-pointer"
                            )}
                          >
                            {hasDetails && (
                              <div className="absolute inset-0 bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                <span className="text-sm font-medium text-foreground">{t('seeDetails')}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span
                                  className={cn(
                                    "font-medium truncate",
                                    isWinnerHome && "text-primary"
                                  )}
                                >
                                  {match.homeTeam?.name || tCommon('tbd')}
                                </span>
                                {isWinnerHome && (
                                  <Trophy className="h-3 w-3 text-primary shrink-0" />
                                )}
                              </div>

                              {hasScore ? (
                                <div className="flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded font-mono text-sm shrink-0">
                                  <span className={cn(
                                    "font-bold min-w-[1.5rem] text-center",
                                    isWinnerHome && "text-primary"
                                  )}>
                                    {match.homeScore}
                                  </span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className={cn(
                                    "font-bold min-w-[1.5rem] text-center",
                                    isWinnerAway && "text-primary"
                                  )}>
                                    {match.awayScore}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm shrink-0">{tCommon('vs')}</span>
                              )}

                              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                                {isWinnerAway && (
                                  <Trophy className="h-3 w-3 text-primary shrink-0" />
                                )}
                                <span
                                  className={cn(
                                    "font-medium truncate",
                                    isWinnerAway && "text-primary"
                                  )}
                                >
                                  {match.awayTeam?.name || tCommon('tbd')}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3">
                              <StatusIcon
                                className={cn(
                                  "h-4 w-4",
                                  statusConfig[match.status].className,
                                  match.status === "ON_COURT" && "animate-pulse"
                                )}
                              />
                              <span className={cn(
                                "text-xs",
                                statusConfig[match.status].className
                              )}>
                                {t(statusConfig[match.status].labelKey)}
                              </span>
                            </div>
                          </div>
                        );

                        return hasDetails ? (
                          <ScoreDetailsDialog key={match.id} match={match} t={t} tCommon={tCommon}>
                            {matchContent}
                          </ScoreDetailsDialog>
                        ) : (
                          <div key={match.id}>{matchContent}</div>
                        );
                      })}
                      {getGroupMatches(selectedGroup).length === 0 && (
                        <p className="text-center py-8 text-muted-foreground">
                          {t('noMatchesInGroup')}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* All Groups View */}
            {layoutMode === "all" && (
              <div className="space-y-8">
                {qualifyingStage.groups
                  .slice()
                  .sort((a, b) => a.index - b.index)
                  .map((group) => (
                  <div key={group.id} className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {group.name}
                      </span>
                      {t('group', { name: group.name })}
                      <Badge variant="outline" className="ml-1 font-normal">
                        {t('teamsCount', { count: group.teams.length })}
                      </Badge>
                    </h3>
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* Standings */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-primary" />
                            {t('standings')}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {t('topAdvanceShort', { count: qualifyingStage.teamsAdvancing ?? 1 })}
                          </p>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10">{t('standingsHeaders.rank')}</TableHead>
                                <TableHead>{t('standingsHeaders.team')}</TableHead>
                                <TableHead className="text-center w-10">{t('standingsHeaders.played')}</TableHead>
                                <TableHead className="text-center w-10">{t('standingsHeaders.won')}</TableHead>
                                <TableHead className="text-center w-10">{t('standingsHeaders.lost')}</TableHead>
                                <TableHead className="text-center w-16">{t('standingsHeaders.games')}</TableHead>
                                <TableHead className="text-center w-12">{t('standingsHeaders.points')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getGroupStandings(group.id).map((row, index) => {
                                const teamsAdvancing = qualifyingStage?.teamsAdvancing ?? 1;
                                const isAdvancing = index < teamsAdvancing;

                                return (
                                  <TableRow 
                                    key={row.team.id}
                                    className={isAdvancing ? "bg-primary/5" : ""}
                                  >
                                    <TableCell>
                                      <span className={cn(
                                        "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold",
                                        isAdvancing 
                                          ? "bg-primary text-primary-foreground" 
                                          : "bg-muted text-muted-foreground"
                                      )}>
                                        {index + 1}
                                      </span>
                                    </TableCell>
                                    <TableCell className="font-medium text-sm">
                                      {row.team.name}
                                      {isAdvancing && (
                                        <span className="ml-1 text-xs text-primary">✓</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center text-muted-foreground text-sm">{row.played}</TableCell>
                                    <TableCell className="text-center font-medium text-primary text-sm">
                                      {row.wins}
                                    </TableCell>
                                    <TableCell className="text-center text-muted-foreground text-sm">
                                      {row.losses}
                                    </TableCell>
                                    <TableCell className="text-center text-muted-foreground text-xs">
                                      <span className="font-medium">{row.gamesWon}-{row.gamesLost}</span>
                                      <span className={cn(
                                        "ml-1",
                                        row.gameDiff > 0 ? "text-green-600" : row.gameDiff < 0 ? "text-red-600" : ""
                                      )}>
                                        ({row.gameDiff > 0 ? "+" : ""}{row.gameDiff})
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-sm">
                                      {row.points}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      {/* Matches */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t('matches')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {getGroupMatches(group.id).map((match) => {
                              const StatusIcon = statusConfig[match.status].icon;
                              const isWinnerHome = match.winnerTeamId === match.homeTeamId;
                              const isWinnerAway = match.winnerTeamId === match.awayTeamId;
                              const hasScore = match.homeScore !== null && match.awayScore !== null;
                              const hasDetails = !!match.scoreDetails;

                              const matchContent = (
                                <div
                                  className={cn(
                                    "flex items-center justify-between p-2.5 border rounded-lg group relative",
                                    match.status === "ON_COURT" && "border-primary bg-primary/5",
                                    hasDetails && "cursor-pointer"
                                  )}
                                >
                                  {hasDetails && (
                                    <div className="absolute inset-0 bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                      <span className="text-xs font-medium text-foreground">{t('seeDetails')}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 flex-1">
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                      <span
                                        className={cn(
                                          "text-sm font-medium truncate",
                                          isWinnerHome && "text-primary"
                                        )}
                                      >
                                        {match.homeTeam?.name || tCommon('tbd')}
                                      </span>
                                      {isWinnerHome && (
                                        <Trophy className="h-3 w-3 text-primary shrink-0" />
                                      )}
                                    </div>

                                    {hasScore ? (
                                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-secondary/50 rounded font-mono text-xs shrink-0">
                                        <span className={cn(
                                          "font-bold min-w-[1rem] text-center",
                                          isWinnerHome && "text-primary"
                                        )}>
                                          {match.homeScore}
                                        </span>
                                        <span className="text-muted-foreground">-</span>
                                        <span className={cn(
                                          "font-bold min-w-[1rem] text-center",
                                          isWinnerAway && "text-primary"
                                        )}>
                                          {match.awayScore}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-xs shrink-0">{tCommon('vs')}</span>
                                    )}

                                    <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                                      {isWinnerAway && (
                                        <Trophy className="h-3 w-3 text-primary shrink-0" />
                                      )}
                                      <span
                                        className={cn(
                                          "text-sm font-medium truncate",
                                          isWinnerAway && "text-primary"
                                        )}
                                      >
                                        {match.awayTeam?.name || tCommon('tbd')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 ml-2">
                                    <StatusIcon
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        statusConfig[match.status].className,
                                        match.status === "ON_COURT" && "animate-pulse"
                                      )}
                                    />
                                  </div>
                                </div>
                              );

                              return hasDetails ? (
                                <ScoreDetailsDialog key={match.id} match={match} t={t} tCommon={tCommon}>
                                  {matchContent}
                                </ScoreDetailsDialog>
                              ) : (
                                <div key={match.id}>{matchContent}</div>
                              );
                            })}
                            {getGroupMatches(group.id).length === 0 && (
                              <p className="text-center py-4 text-muted-foreground text-sm">
                                {t('noMatchesYet')}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="main" className="mt-6">
            <BracketView rounds={getBracketRounds()} t={t} tCommon={tCommon} getPlaceholderLabel={getPlaceholderLabel} />
          </TabsContent>
        </Tabs>
      ) : (
        <BracketView rounds={getBracketRounds()} t={t} tCommon={tCommon} getPlaceholderLabel={getPlaceholderLabel} />
      )}
    </div>
  );
}

// Layout constants for precise bracket positioning
const MATCH_CARD_HEIGHT = 130;
const MATCH_CARD_WIDTH = 200;
const FIRST_ROUND_GAP = 20;
const CONNECTOR_WIDTH = 32;
const HEADER_HEIGHT = 44;

type BracketViewProps = {
  rounds: [number, Match[]][];
  t: (key: string, values?: Record<string, string | number>) => string;
  tCommon: (key: string) => string;
  getPlaceholderLabel: (groupName: string | undefined, rank: number | null) => string | null;
};

function BracketView({ rounds, t, tCommon, getPlaceholderLabel }: BracketViewProps) {
  if (rounds.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('mainDrawNotStarted')}</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            {t('mainDrawNotStartedDescriptionReadonly')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const roundNames = (totalRounds: number, current: number) => {
    const remaining = totalRounds - current;
    if (remaining === 0) return t('rounds.final');
    if (remaining === 1) return t('rounds.semifinals');
    if (remaining === 2) return t('rounds.quarterfinals');
    return t('rounds.round', { number: current });
  };

  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound?.[1]?.[0];
  const champion = finalMatch?.winnerTeam;

  const firstRoundMatches = rounds[0]?.[1]?.length || 0;
  
  const getMatchYPositions = (roundIndex: number, matchCount: number): number[] => {
    if (roundIndex === 0) {
      return Array.from({ length: matchCount }, (_, i) => 
        i * (MATCH_CARD_HEIGHT + FIRST_ROUND_GAP)
      );
    }
    
    const prevPositions = getMatchYPositions(roundIndex - 1, matchCount * 2);
    return Array.from({ length: matchCount }, (_, i) => {
      const topMatch = prevPositions[i * 2];
      const bottomMatch = prevPositions[i * 2 + 1];
      return (topMatch + bottomMatch) / 2;
    });
  };

  const totalHeight = (firstRoundMatches - 1) * (MATCH_CARD_HEIGHT + FIRST_ROUND_GAP) + MATCH_CARD_HEIGHT;

  return (
    <div className="space-y-6">
      {/* Champion Banner */}
      {champion && (
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-primary/20">
          <CardContent className="flex items-center justify-center gap-4 py-6">
            <Trophy className="h-8 w-8 text-primary" />
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{t('champion')}</p>
              <p className="text-2xl font-bold text-primary">{champion.name}</p>
            </div>
            <Trophy className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      )}

      {/* Bracket */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max">
          {rounds.map(([round, matches], roundIndex) => {
            const isLastRound = roundIndex === rounds.length - 1;
            const yPositions = getMatchYPositions(roundIndex, matches.length);
            const columnWidth = MATCH_CARD_WIDTH + (isLastRound ? 0 : CONNECTOR_WIDTH);
            
            return (
              <div key={round} className="flex flex-col" style={{ width: `${columnWidth}px` }}>
                {/* Round Header */}
                <h3 
                  className="text-sm font-semibold text-center text-muted-foreground px-4 py-2 bg-secondary/50 rounded-lg"
                  style={{ width: `${MATCH_CARD_WIDTH}px`, height: `${HEADER_HEIGHT}px` }}
                >
                  {roundNames(rounds.length, roundIndex + 1)}
                </h3>
                
                {/* Matches and Connectors Container */}
                <div 
                  className="relative mt-4"
                  style={{ height: `${totalHeight}px`, width: `${columnWidth}px` }}
                >
                  {matches.map((match, matchIndex) => {
                    const isActive = match.status === "ON_COURT";
                    const isCompleted = match.status === "COMPLETED";
                    const hasDetails = !!match.scoreDetails;
                    const yPos = yPositions[matchIndex];
                    const matchCenterY = yPos + MATCH_CARD_HEIGHT / 2;

                    const matchCard = (
                      <Card
                        className={cn(
                          "absolute group",
                          isActive && "border-primary ring-2 ring-primary/20",
                          isCompleted && "bg-secondary/30",
                          hasDetails && "cursor-pointer"
                        )}
                        style={{ 
                          top: `${yPos}px`,
                          left: 0,
                          width: `${MATCH_CARD_WIDTH}px`,
                          height: `${MATCH_CARD_HEIGHT}px`,
                        }}
                      >
                        {hasDetails && (
                          <div className="absolute inset-0 bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                            <span className="text-sm font-medium text-foreground">{t('seeDetails')}</span>
                          </div>
                        )}
                        <CardContent className="p-4 space-y-2 h-full flex flex-col justify-center">
                          {/* Home Team */}
                          <div
                            className={cn(
                              "flex items-center justify-between py-2.5 px-3 rounded transition-colors",
                              match.winnerTeamId === match.homeTeamId
                                ? "bg-primary/10 text-primary"
                                : match.status === "COMPLETED"
                                ? "bg-muted/50"
                                : "bg-secondary/50"
                            )}
                          >
                            <span className="truncate flex-1 text-xs font-medium">
                              {match.homeTeam?.name ? (
                                <span className="text-foreground">{match.homeTeam.name}</span>
                              ) : match.homePlaceholderGroup ? (
                                <span className="text-amber-600 dark:text-amber-400 italic">
                                  {getPlaceholderLabel(
                                    match.homePlaceholderGroup.name,
                                    match.homePlaceholderRank
                                  )}
                                </span>
                              ) : match.round === 1 && !match.homeTeamId && !match.homePlaceholderGroup && (match.awayTeamId || match.awayPlaceholderGroup) ? (
                                <span className="text-muted-foreground italic">{tCommon('bye')}</span>
                              ) : (
                                <span className="text-muted-foreground italic">{tCommon('tbd')}</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              {match.homeScore !== null && (
                                <span className={cn(
                                  "font-bold text-xs min-w-[1rem] text-center",
                                  match.winnerTeamId === match.homeTeamId ? "text-primary" : "text-muted-foreground"
                                )}>
                                  {match.homeScore}
                                </span>
                              )}
                              {match.winnerTeamId && match.winnerTeamId === match.homeTeamId && (
                                <Trophy className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                          </div>

                          {/* Divider with status */}
                          <div className="flex items-center gap-2 px-2">
                            <div className="flex-1 h-px bg-border" />
                            {isActive && (
                              <Badge className="bg-primary/10 text-primary text-xs px-1.5 py-0">
                                <Play className="h-3 w-3 mr-0.5 fill-current animate-pulse" />
                                {tCommon('live')}
                              </Badge>
                            )}
                            {!isActive && !isCompleted && (
                              <span className="text-xs text-muted-foreground">{tCommon('vs')}</span>
                            )}
                            {isCompleted && (
                              <CheckCircle className="h-3 w-3 text-primary" />
                            )}
                            <div className="flex-1 h-px bg-border" />
                          </div>

                          {/* Away Team */}
                          <div
                            className={cn(
                              "flex items-center justify-between py-2.5 px-3 rounded transition-colors",
                              match.winnerTeamId === match.awayTeamId
                                ? "bg-primary/10 text-primary"
                                : match.status === "COMPLETED"
                                ? "bg-muted/50"
                                : "bg-secondary/50"
                            )}
                          >
                            <span className="truncate flex-1 text-xs font-medium">
                              {match.awayTeam?.name ? (
                                <span className="text-foreground">{match.awayTeam.name}</span>
                              ) : match.awayPlaceholderGroup ? (
                                <span className="text-amber-600 dark:text-amber-400 italic">
                                  {getPlaceholderLabel(
                                    match.awayPlaceholderGroup.name,
                                    match.awayPlaceholderRank
                                  )}
                                </span>
                              ) : match.round === 1 && !match.awayTeamId && !match.awayPlaceholderGroup && (match.homeTeamId || match.homePlaceholderGroup) ? (
                                <span className="text-muted-foreground italic">{tCommon('bye')}</span>
                              ) : (
                                <span className="text-muted-foreground italic">{tCommon('tbd')}</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              {match.awayScore !== null && (
                                <span className={cn(
                                  "font-bold text-xs min-w-[1rem] text-center",
                                  match.winnerTeamId === match.awayTeamId ? "text-primary" : "text-muted-foreground"
                                )}>
                                  {match.awayScore}
                                </span>
                              )}
                              {match.winnerTeamId && match.winnerTeamId === match.awayTeamId && (
                                <Trophy className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );

                    return (
                      <div key={match.id}>
                        {hasDetails ? (
                          <ScoreDetailsDialog match={match} t={t} tCommon={tCommon}>
                            {matchCard}
                          </ScoreDetailsDialog>
                        ) : (
                          matchCard
                        )}

                        {/* Connector lines */}
                        {!isLastRound && (
                          <>
                            <div 
                              className="absolute bg-border"
                              style={{
                                top: `${matchCenterY}px`,
                                left: `${MATCH_CARD_WIDTH}px`,
                                width: `${CONNECTOR_WIDTH / 2}px`,
                                height: "1px",
                              }}
                            />
                            
                            {matchIndex % 2 === 0 && matchIndex + 1 < matches.length && (
                              <>
                                <div 
                                  className="absolute bg-border"
                                  style={{
                                    top: `${matchCenterY}px`,
                                    left: `${MATCH_CARD_WIDTH + CONNECTOR_WIDTH / 2}px`,
                                    width: "1px",
                                    height: `${yPositions[matchIndex + 1] - yPositions[matchIndex]}px`,
                                  }}
                                />
                                
                                <div 
                                  className="absolute bg-border"
                                  style={{
                                    top: `${(matchCenterY + yPositions[matchIndex + 1] + MATCH_CARD_HEIGHT / 2) / 2}px`,
                                    left: `${MATCH_CARD_WIDTH + CONNECTOR_WIDTH / 2}px`,
                                    width: `${CONNECTOR_WIDTH / 2}px`,
                                    height: "1px",
                                  }}
                                />
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

