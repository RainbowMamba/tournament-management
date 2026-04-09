"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LayoutGrid, Play, AlertCircle, Circle, Trophy, Minus, Plus } from "lucide-react";
import { startMatch, completeMatch } from "@/lib/actions/match";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Match = {
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
  homePlaceholderGroupId?: string | null;
  homePlaceholderRank?: number | null;
  homePlaceholderGroup?: { id: string; name: string } | null;
  awayPlaceholderGroupId?: string | null;
  awayPlaceholderRank?: number | null;
  awayPlaceholderGroup?: { id: string; name: string } | null;
};

type Court = {
  id: string;
  name: string;
  numCourts: number;
  location?: string | null;
};

type Group = {
  id: string;
  name: string;
  index: number;
};

type Stage = {
  id: string;
  type: "QUALIFYING" | "MAIN";
  groups?: Group[];
};

type TournamentWithRelations = {
  id: string;
  name: string;
  hasQualifying: boolean;
  status: "DRAFT" | "ACTIVE" | "COMPLETED";
  courts: Court[];
  matches: Match[];
  stages: Stage[];
};

type Props = {
  tournament: TournamentWithRelations;
};

export function CourtViewStaff({ tournament }: Props) {
  const router = useRouter();
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [scoreDetails, setScoreDetails] = useState<string>("");

  const pendingMatches = tournament.matches.filter(
    (m) => m.status === "PENDING" && !m.courtId && m.homeTeamId && m.awayTeamId
  );
  const scheduledMatches = tournament.matches.filter(
    (m) => m.status === "PENDING" && m.courtId
  );
  const onCourtMatches = tournament.matches.filter((m) => m.status === "ON_COURT");
  const completedMatches = tournament.matches.filter((m) => m.status === "COMPLETED");

  // Build a map from groupId to group info
  const groupMap = new Map<string, { name: string; stageName: string }>();
  tournament.stages.forEach((stage) => {
    const stageName = stage.type === "QUALIFYING" ? "Qualifying" : "Main";
    if (stage.groups && Array.isArray(stage.groups)) {
      stage.groups.forEach((group) => {
        groupMap.set(group.id, { name: group.name, stageName });
      });
    }
  });

  // Get match on a specific court slot
  function getMatchOnSlot(venueId: string, courtNumber: number): Match | undefined {
    return tournament.matches.find(
      (m) => m.courtId === venueId && m.courtNumber === courtNumber && m.status !== "COMPLETED"
    );
  }

  // Get round name for main draw matches
  function getRoundName(round: number): string {
    const mainStage = tournament.stages.find((s) => s.type === "MAIN");
    if (!mainStage) return `Round ${round}`;
    
    const mainDrawMatches = tournament.matches.filter((m) => m.stageId === mainStage.id);
    const maxRound = Math.max(...mainDrawMatches.map((m) => m.round), 1);
    
    const roundsFromFinal = maxRound - round;
    
    if (roundsFromFinal === 0) return "Final";
    if (roundsFromFinal === 1) return "Semi-final";
    if (roundsFromFinal === 2) return "Quarter-final";
    if (roundsFromFinal === 3) return "Round of 16";
    if (roundsFromFinal === 4) return "Round of 32";
    
    return `Round ${round}`;
  }

  // Get a descriptive label for a match
  function getMatchLabel(match: Match): string {
    const stage = tournament.stages.find((s) => s.id === match.stageId);
    
    if (stage?.type === "QUALIFYING" && match.groupId) {
      const groupInfo = groupMap.get(match.groupId);
      if (groupInfo) {
        return `Group ${groupInfo.name}`;
      }
      return `Q #${match.matchNumber}`;
    } else if (stage?.type === "MAIN") {
      return getRoundName(match.round);
    }
    
    return `#${match.matchNumber}`;
  }

  async function handleStartMatch(matchId: string) {
    const result = await startMatch(matchId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Match started!");
      router.refresh();
    }
  }

  async function handleCompleteMatch(winnerTeamId: string) {
    if (!resultMatch) return;

    setIsSubmitting(true);
    const result = await completeMatch(resultMatch.id, winnerTeamId, {
      homeScore,
      awayScore,
      scoreDetails: scoreDetails || undefined,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Match completed!");
      router.refresh();
    }

    setIsSubmitting(false);
    setResultMatch(null);
    setHomeScore(0);
    setAwayScore(0);
    setScoreDetails("");
  }

  function openResultDialog(match: Match) {
    setResultMatch(match);
    setHomeScore(0);
    setAwayScore(0);
    setScoreDetails("");
  }

  function determineWinner(): string | null {
    if (!resultMatch) return null;
    if (homeScore > awayScore && resultMatch.homeTeamId) return resultMatch.homeTeamId;
    else if (awayScore > homeScore && resultMatch.awayTeamId) return resultMatch.awayTeamId;
    return null;
  }

  // Group pending matches by their groupId
  function getMatchesByGroup() {
    const grouped: Record<string, { groupName: string; stageName: string; matches: Match[] }> = {};
    const noGroup: Match[] = [];

    pendingMatches.forEach((match) => {
      if (match.groupId && groupMap.has(match.groupId)) {
        const groupInfo = groupMap.get(match.groupId)!;
        const key = match.groupId;
        if (!grouped[key]) {
          grouped[key] = {
            groupName: groupInfo.name,
            stageName: groupInfo.stageName,
            matches: [],
          };
        }
        grouped[key].matches.push(match);
      } else {
        noGroup.push(match);
      }
    });

    const sortedGroups = Object.values(grouped).sort((a, b) =>
      a.groupName.localeCompare(b.groupName)
    );

    return { groupedMatches: sortedGroups, ungroupedMatches: noGroup };
  }

  const { groupedMatches, ungroupedMatches } = getMatchesByGroup();

  if (tournament.matches.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No matches yet</h3>
          <p className="text-muted-foreground text-center max-w-sm">
            Matches haven&apos;t been generated for this tournament yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready to Play</CardDescription>
            <CardTitle className="text-2xl">{pendingMatches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scheduled</CardDescription>
            <CardTitle className="text-2xl">{scheduledMatches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On Court</CardDescription>
            <CardTitle className="text-2xl text-primary">{onCourtMatches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">{completedMatches.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Venues Grid */}
      <div className="space-y-6">
        {tournament.courts.map((venue) => {
          const venueMatches = tournament.matches.filter(
            (m) => m.courtId === venue.id && m.status !== "COMPLETED"
          );
          const hasLiveMatch = venueMatches.some((m) => m.status === "ON_COURT");

          return (
            <Card key={venue.id} className={cn(hasLiveMatch && "ring-2 ring-primary/30")}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {venue.name}
                      {hasLiveMatch && (
                        <Badge className="bg-primary/10 text-primary animate-pulse">
                          <Play className="h-3 w-3 mr-1 fill-current" />
                          Live
                        </Badge>
                      )}
                    </CardTitle>
                    {venue.location && (
                      <CardDescription className="text-sm">{venue.location}</CardDescription>
                    )}
                  </div>
                  <Badge variant="outline">{venue.numCourts} courts</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: venue.numCourts }, (_, i) => i + 1).map((courtNum) => {
                    const match = getMatchOnSlot(venue.id, courtNum);
                    const isLive = match?.status === "ON_COURT";
                    const isScheduled = match?.status === "PENDING" && match.courtId;

                    return (
                      <div
                        key={courtNum}
                        className={cn(
                          "p-3 rounded-lg border transition-all",
                          isLive && "border-primary bg-primary/5 ring-1 ring-primary/20",
                          !isLive && match && "border-border bg-secondary/30",
                          !match && "border-border bg-secondary/20"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Court #{courtNum}</span>
                          {isLive && (
                            <Badge variant="default" className="text-xs">
                              <Play className="h-2 w-2 mr-1 fill-current" />
                              Live
                            </Badge>
                          )}
                        </div>

                        {match ? (
                          <div className="space-y-2">
                            <div className="p-2 bg-background rounded border">
                              <div className="flex items-center justify-between mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {getMatchLabel(match)}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs mb-2">
                                <span className="font-medium truncate">{match.homeTeam?.name || "TBD"}</span>
                                <span className="text-muted-foreground mx-1">vs</span>
                                <span className="font-medium truncate">{match.awayTeam?.name || "TBD"}</span>
                              </div>
                            </div>
                            {isScheduled && (
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => handleStartMatch(match.id)}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Start Match
                              </Button>
                            )}
                            {isLive && (
                              <Button
                                size="sm"
                                variant="default"
                                className="w-full"
                                onClick={() => openResultDialog(match)}
                              >
                                <Trophy className="h-3 w-3 mr-1" />
                                Enter Result
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground border border-dashed rounded">
                            <LayoutGrid className="h-6 w-6 mx-auto mb-1 opacity-50" />
                            <p className="text-xs">No match</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upcoming Matches */}
      {pendingMatches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Upcoming Matches</h3>
              <p className="text-sm text-muted-foreground">
                Matches waiting to be assigned to courts (staff cannot assign courts)
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {pendingMatches.length} matches
            </Badge>
          </div>

          {/* Grouped Matches (Qualifying) */}
          {groupedMatches.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">Qualifying Round</h4>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groupedMatches.map((group) => (
                  <Card key={group.groupName} className="overflow-hidden">
                    <CardHeader className="pb-2 bg-secondary/30">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">
                          Group {group.groupName}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {group.matches.length} matches
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {group.stageName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {group.matches.map((match) => (
                          <div
                            key={match.id}
                            className="flex items-center gap-2 p-2 border rounded-md text-sm bg-background"
                          >
                            <Badge variant="outline" className="text-xs shrink-0">
                              #{match.matchNumber}
                            </Badge>
                            <div className="truncate flex-1 min-w-0">
                              <span className="font-medium">{match.homeTeam?.name || "TBD"}</span>
                              <span className="text-muted-foreground mx-1">vs</span>
                              <span className="font-medium">{match.awayTeam?.name || "TBD"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Ungrouped Matches (Main Draw / Bracket) */}
          {ungroupedMatches.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">Main Draw</h4>
              <Card>
                <CardHeader className="pb-2 bg-secondary/30">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      Bracket Matches
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {ungroupedMatches.length} matches
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Elimination bracket
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ungroupedMatches.map((match) => (
                      <div
                        key={match.id}
                        className="flex items-center gap-2 p-2.5 border rounded-md text-sm bg-background"
                      >
                        <Badge variant="outline" className="text-xs shrink-0">
                          {getRoundName(match.round)}
                        </Badge>
                        <div className="truncate flex-1 min-w-0">
                          <span className="font-medium">{match.homeTeam?.name || "TBD"}</span>
                          <span className="text-muted-foreground mx-1">vs</span>
                          <span className="font-medium">{match.awayTeam?.name || "TBD"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Enter Result Dialog */}
      <Dialog open={!!resultMatch} onOpenChange={() => setResultMatch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Match Result</DialogTitle>
            <DialogDescription>Enter the final score</DialogDescription>
          </DialogHeader>
          {resultMatch && (
            <div className="py-4 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-center space-y-3">
                  <p className={cn("font-medium text-sm truncate", homeScore > awayScore && "text-primary")}>
                    {resultMatch.homeTeam?.name}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setHomeScore(Math.max(0, homeScore - 1))} disabled={isSubmitting}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input type="number" min="0" value={homeScore}
                      onChange={(e) => setHomeScore(Math.max(0, parseInt(e.target.value) || 0))}
                      className={cn("w-16 text-center text-2xl font-bold h-12", homeScore > awayScore && "border-primary text-primary")}
                      disabled={isSubmitting} />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setHomeScore(homeScore + 1)} disabled={isSubmitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {homeScore > awayScore && (
                    <Badge className="bg-primary/10 text-primary"><Trophy className="h-3 w-3 mr-1" />Winner</Badge>
                  )}
                </div>
                <div className="text-muted-foreground font-bold text-xl">vs</div>
                <div className="flex-1 text-center space-y-3">
                  <p className={cn("font-medium text-sm truncate", awayScore > homeScore && "text-primary")}>
                    {resultMatch.awayTeam?.name}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setAwayScore(Math.max(0, awayScore - 1))} disabled={isSubmitting}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input type="number" min="0" value={awayScore}
                      onChange={(e) => setAwayScore(Math.max(0, parseInt(e.target.value) || 0))}
                      className={cn("w-16 text-center text-2xl font-bold h-12", awayScore > homeScore && "border-primary text-primary")}
                      disabled={isSubmitting} />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setAwayScore(awayScore + 1)} disabled={isSubmitting}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {awayScore > homeScore && (
                    <Badge className="bg-primary/10 text-primary"><Trophy className="h-3 w-3 mr-1" />Winner</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scoreDetails">Score Details (optional)</Label>
                <Input
                  id="scoreDetails"
                  placeholder="e.g., 6-4, 7-5"
                  value={scoreDetails}
                  onChange={(e) => setScoreDetails(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultMatch(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const winner = determineWinner();
                if (winner) {
                  handleCompleteMatch(winner);
                } else {
                  toast.error("Please enter valid scores");
                }
              }}
              disabled={isSubmitting || !determineWinner()}
            >
              {isSubmitting ? "Submitting..." : "Complete Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

