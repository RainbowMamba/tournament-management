"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LayoutGrid, Play, AlertCircle, Trophy, X, Minus, Plus, GripVertical, Shuffle, ArrowDownNarrowWide, Lock } from "lucide-react";
import { assignMatchToCourt, unassignMatchFromCourt, startMatch, completeMatch, autoAssignMatches } from "@/lib/actions/match";
import { getCourtMatches } from "@/lib/actions/court";
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

// Cross-tournament match type (from other tournaments)
type CrossTournamentMatch = {
  id: string;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  courtNumber: number | null;
  tournamentId: string;
  tournamentName: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  courtId: string;
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

// Individual court slot within a venue
type CourtSlot = {
  venueId: string;
  venueName: string;
  courtNumber: number;
  slotId: string; // venueId:courtNumber
};

// Draggable Match Component
function DraggableMatch({
  match,
  children,
  disabled = false,
}: {
  match: Match;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: match.id,
    data: { match },
    disabled,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none",
        isDragging && "opacity-50 z-50"
      )}
      suppressHydrationWarning
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

// Droppable Court Slot Component
function DroppableCourtSlot({
  slot,
  children,
  isActive,
  isBlocked,
}: {
  slot: CourtSlot;
  children: React.ReactNode;
  isActive: boolean;
  isBlocked?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: slot.slotId,
    data: { slot },
    disabled: isBlocked,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-3 rounded-lg border transition-all",
        isActive && "border-primary bg-primary/5 ring-1 ring-primary/20",
        isBlocked && !isActive && "border-amber-500/50 bg-amber-500/5",
        !isActive && !isBlocked && "border-border bg-secondary/30",
        isOver && !isActive && !isBlocked && "border-primary/50 ring-2 ring-primary/30 bg-primary/5"
      )}
    >
      {children}
    </div>
  );
}

export function CourtView({ tournament }: Props) {
  const router = useRouter();
  const t = useTranslations('courtView');
  const tCommon = useTranslations('common');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [resultMatch, setResultMatch] = useState<Match | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [scoreDetails, setScoreDetails] = useState<string>("");
  
  // Cross-tournament matches state (grouped by venue)
  const [crossTournamentMatches, setCrossTournamentMatches] = useState<Map<string, CrossTournamentMatch[]>>(new Map());
  
  // Drag and drop state
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [replaceConfirmation, setReplaceConfirmation] = useState<{
    matchToAssign: Match;
    matchToReplace: Match;
    slot: CourtSlot;
  } | null>(null);
  
  // Optimistic UI state
  const [optimisticAssignment, setOptimisticAssignment] = useState<{
    matchId: string;
    match: Match;
    targetSlot: CourtSlot;
  } | null>(null);

  // Auto-assignment state
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // Configure pointer sensor with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build list of all court slots
  const allCourtSlots: CourtSlot[] = [];
  for (const venue of tournament.courts) {
    for (let num = 1; num <= venue.numCourts; num++) {
      allCourtSlots.push({
        venueId: venue.id,
        venueName: venue.name,
        courtNumber: num,
        slotId: `${venue.id}:${num}`,
      });
    }
  }

  // Fetch cross-tournament matches for each venue
  useEffect(() => {
    async function fetchCrossTournamentMatches() {
      const matchesByVenueId = new Map<string, CrossTournamentMatch[]>();
      
      for (const venue of tournament.courts) {
        const matches = await getCourtMatches(venue.id);
        // Filter out matches from the current tournament
        const externalMatches = matches
          .filter((m) => m.tournament.id !== tournament.id)
          .map((m) => ({
            id: m.id,
            status: m.status as "PENDING" | "ON_COURT" | "COMPLETED",
            courtNumber: m.courtNumber,
            tournamentId: m.tournament.id,
            tournamentName: m.tournament.name,
            homeTeamName: m.homeTeam?.name || null,
            awayTeamName: m.awayTeam?.name || null,
            courtId: venue.id,
          }));
        
        if (externalMatches.length > 0) {
          matchesByVenueId.set(venue.id, externalMatches);
        }
      }
      
      setCrossTournamentMatches(matchesByVenueId);
    }
    
    fetchCrossTournamentMatches();
  }, [tournament.courts, tournament.id]);

  const pendingMatches = tournament.matches.filter(
    (m) => m.status === "PENDING" && !m.courtId && m.homeTeamId && m.awayTeamId
  );
  const scheduledMatches = tournament.matches.filter(
    (m) => m.status === "PENDING" && m.courtId
  );
  const onCourtMatches = tournament.matches.filter((m) => m.status === "ON_COURT");
  const completedMatches = tournament.matches.filter((m) => m.status === "COMPLETED");

  // Check if a court slot is blocked by another tournament
  function getExternalMatchOnSlot(venueId: string, courtNumber: number): CrossTournamentMatch | undefined {
    const externalMatches = crossTournamentMatches.get(venueId);
    if (!externalMatches) return undefined;
    return externalMatches.find((m) => m.courtNumber === courtNumber);
  }

  // Get our match on a slot
  function getOurMatchOnSlot(venueId: string, courtNumber: number): Match | undefined {
    return tournament.matches.find(
      (m) => m.courtId === venueId && m.courtNumber === courtNumber && m.status !== "COMPLETED"
    );
  }

  // Helper function to get teams that are assigned to a court (playing or scheduled)
  function getTeamsAssignedToCourt(): Set<string> {
    const teamsAssigned = new Set<string>();
    const assignedMatches = [...onCourtMatches, ...scheduledMatches];
    for (const match of assignedMatches) {
      if (match.homeTeamId) teamsAssigned.add(match.homeTeamId);
      if (match.awayTeamId) teamsAssigned.add(match.awayTeamId);
    }
    return teamsAssigned;
  }

  // Check if a match has any team that's already assigned to a court
  function getMatchConflict(match: Match): { hasConflict: boolean; conflictingTeams: string[] } {
    const teamsAssigned = getTeamsAssignedToCourt();
    const conflictingTeams: string[] = [];
    
    if (match.homeTeamId && teamsAssigned.has(match.homeTeamId)) {
      conflictingTeams.push(match.homeTeam?.name || "Home team");
    }
    if (match.awayTeamId && teamsAssigned.has(match.awayTeamId)) {
      conflictingTeams.push(match.awayTeam?.name || "Away team");
    }
    
    return { hasConflict: conflictingTeams.length > 0, conflictingTeams };
  }

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

  function getShortRoundLabel(match: Match): string {
    const mainStage = tournament.stages.find((s) => s.type === "MAIN");
    if (!mainStage || match.stageId !== mainStage.id) {
      return `#${match.matchNumber}`;
    }
    
    const mainDrawMatches = tournament.matches.filter((m) => m.stageId === mainStage.id);
    const maxRound = Math.max(...mainDrawMatches.map((m) => m.round), 1);
    const roundsFromFinal = maxRound - match.round;
    const matchesInRound = mainDrawMatches.filter((m) => m.round === match.round);
    const matchIndexInRound = matchesInRound.findIndex((m) => m.id === match.id) + 1;
    const numMatchesInRound = matchesInRound.length;
    
    let roundPrefix: string;
    if (roundsFromFinal === 0) roundPrefix = "F";
    else if (roundsFromFinal === 1) roundPrefix = "SF";
    else if (roundsFromFinal === 2) roundPrefix = "QF";
    else if (roundsFromFinal === 3) roundPrefix = "R16";
    else if (roundsFromFinal === 4) roundPrefix = "R32";
    else if (roundsFromFinal === 5) roundPrefix = "R64";
    else roundPrefix = `R${match.round}`;
    
    if (numMatchesInRound > 1) {
      return `${roundPrefix} #${matchIndexInRound}`;
    }
    return roundPrefix;
  }

  function getMatchLabel(match: Match): string {
    const stage = tournament.stages.find((s) => s.id === match.stageId);
    
    if (stage?.type === "QUALIFYING" && match.groupId) {
      const groupInfo = groupMap.get(match.groupId);
      if (groupInfo) return `Group ${groupInfo.name}`;
      return `Q #${match.matchNumber}`;
    } else if (stage?.type === "MAIN") {
      return getRoundName(match.round);
    }
    
    return `#${match.matchNumber}`;
  }

  function getMatchesByGroup() {
    const grouped: Record<string, { groupName: string; stageName: string; matches: Match[] }> = {};
    const noGroup: Match[] = [];

    pendingMatches.forEach((match) => {
      if (match.groupId && groupMap.has(match.groupId)) {
        const groupInfo = groupMap.get(match.groupId)!;
        if (!grouped[match.groupId]) {
          grouped[match.groupId] = { groupName: groupInfo.name, stageName: groupInfo.stageName, matches: [] };
        }
        grouped[match.groupId].matches.push(match);
      } else {
        noGroup.push(match);
      }
    });

    const sortedGroups = Object.values(grouped).sort((a, b) => a.groupName.localeCompare(b.groupName));
    return { groupedMatches: sortedGroups, ungroupedMatches: noGroup };
  }

  const { groupedMatches, ungroupedMatches } = getMatchesByGroup();

  // Drag and drop handlers
  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const match = active.data.current?.match as Match | undefined;
    if (match) setActiveMatch(match);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveMatch(null);

    if (!over) return;

    const draggedMatch = active.data.current?.match as Match | undefined;
    const droppedOnSlot = over.data.current?.slot as CourtSlot | undefined;

    if (!draggedMatch || !droppedOnSlot) return;

    // Check if match is already on this slot
    if (draggedMatch.courtId === droppedOnSlot.venueId && draggedMatch.courtNumber === droppedOnSlot.courtNumber) return;

    // Check if slot is blocked by another tournament
    const externalMatch = getExternalMatchOnSlot(droppedOnSlot.venueId, droppedOnSlot.courtNumber);
    if (externalMatch) {
      toast.error(
        `${droppedOnSlot.venueName} Court #${droppedOnSlot.courtNumber} is being used by "${externalMatch.tournamentName}".`
      );
      return;
    }

    // Check if any team in this match is already assigned to a court
    const conflict = getMatchConflict(draggedMatch);
    if (conflict.hasConflict) {
      toast.error(
        `${conflict.conflictingTeams.join(" and ")} ${conflict.conflictingTeams.length > 1 ? "are" : "is"} already assigned to a court.`
      );
      return;
    }

    // Check if there's an existing match on this slot
    const existingMatch = getOurMatchOnSlot(droppedOnSlot.venueId, droppedOnSlot.courtNumber);
    if (existingMatch) {
      if (existingMatch.status === "ON_COURT") {
        toast.error("Cannot replace a live match. Please wait for it to complete.");
        return;
      } else if (existingMatch.status === "PENDING") {
        setReplaceConfirmation({
          matchToAssign: draggedMatch,
          matchToReplace: existingMatch,
          slot: droppedOnSlot,
        });
        return;
      }
    }

    await performAssignment(draggedMatch, droppedOnSlot);
  }

  async function performAssignment(match: Match, slot: CourtSlot) {
    setOptimisticAssignment({ matchId: match.id, match, targetSlot: slot });
    
    const result = await assignMatchToCourt(match.id, slot.venueId, slot.courtNumber);
    
    if (result.error) {
      toast.error(result.error);
      setOptimisticAssignment(null);
    } else {
      toast.success(`Match assigned to ${slot.venueName} Court #${slot.courtNumber}`);
      router.refresh();
      setTimeout(() => setOptimisticAssignment(null), 100);
    }
  }

  async function handleConfirmReplace() {
    if (!replaceConfirmation) return;

    const conflict = getMatchConflict(replaceConfirmation.matchToAssign);
    if (conflict.hasConflict) {
      toast.error(`${conflict.conflictingTeams.join(" and ")} already assigned to a court.`);
      setReplaceConfirmation(null);
      return;
    }

    setIsSubmitting(true);
    setOptimisticAssignment({
      matchId: replaceConfirmation.matchToAssign.id,
      match: replaceConfirmation.matchToAssign,
      targetSlot: replaceConfirmation.slot,
    });
    setReplaceConfirmation(null);

    const unassignResult = await unassignMatchFromCourt(replaceConfirmation.matchToReplace.id);
    if (unassignResult.error) {
      toast.error(unassignResult.error);
      setIsSubmitting(false);
      setOptimisticAssignment(null);
      return;
    }

    const assignResult = await assignMatchToCourt(
      replaceConfirmation.matchToAssign.id,
      replaceConfirmation.slot.venueId,
      replaceConfirmation.slot.courtNumber
    );

    if (assignResult.error) {
      toast.error(assignResult.error);
      setOptimisticAssignment(null);
    } else {
      toast.success("Match replaced successfully");
      router.refresh();
      setTimeout(() => setOptimisticAssignment(null), 100);
    }

    setIsSubmitting(false);
  }

  async function handleAssignMatch() {
    if (!selectedMatch || !selectedSlot) return;

    const [venueId, courtNumStr] = selectedSlot.split(":");
    const courtNumber = parseInt(courtNumStr, 10);

    const externalMatch = getExternalMatchOnSlot(venueId, courtNumber);
    if (externalMatch) {
      toast.error(`This court is being used by "${externalMatch.tournamentName}".`);
      return;
    }

    const conflict = getMatchConflict(selectedMatch);
    if (conflict.hasConflict) {
      toast.error(`${conflict.conflictingTeams.join(" and ")} already assigned to a court.`);
      return;
    }

    setIsSubmitting(true);
    const result = await assignMatchToCourt(selectedMatch.id, venueId, courtNumber);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Match assigned to court");
      router.refresh();
    }
    
    setIsSubmitting(false);
    setIsAssigning(false);
    setSelectedMatch(null);
    setSelectedSlot("");
  }

  async function handleUnassignMatch(matchId: string) {
    const result = await unassignMatchFromCourt(matchId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Match unassigned from court");
      router.refresh();
    }
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

  function openAssignDialog(match: Match) {
    setSelectedMatch(match);
    setIsAssigning(true);
  }

  function getAvailableSlots(): CourtSlot[] {
    const ourOccupiedSlots = new Set(
      tournament.matches
        .filter((m) => m.status !== "COMPLETED" && m.courtId && m.courtNumber)
        .map((m) => `${m.courtId}:${m.courtNumber}`)
    );
    
    const externalOccupiedSlots = new Set<string>();
    crossTournamentMatches.forEach((matches, venueId) => {
      matches.forEach((m) => {
        if (m.courtNumber) externalOccupiedSlots.add(`${venueId}:${m.courtNumber}`);
      });
    });
    
    return allCourtSlots.filter(
      (slot) => !ourOccupiedSlots.has(slot.slotId) && !externalOccupiedSlots.has(slot.slotId)
    );
  }

  const qualifyingPendingMatches = pendingMatches.filter((m) => {
    const stage = tournament.stages.find((s) => s.id === m.stageId);
    return stage?.type === "QUALIFYING";
  });
  const mainDrawPendingMatches = pendingMatches.filter((m) => {
    const stage = tournament.stages.find((s) => s.id === m.stageId);
    return stage?.type === "MAIN";
  });

  async function handleAutoAssign(stageType: "QUALIFYING" | "MAIN", mode: "sequential" | "random") {
    setIsAutoAssigning(true);
    const result = await autoAssignMatches(tournament.id, stageType, mode);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Successfully assigned ${result.assignedCount} match${result.assignedCount === 1 ? "" : "es"}`);
      router.refresh();
    }
    
    setIsAutoAssigning(false);
  }

  if (tournament.matches.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('noMatches')}</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            {t('noMatchesDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('readyToPlay')}</CardDescription>
                <CardTitle className="text-2xl">{pendingMatches.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('scheduled')}</CardDescription>
                <CardTitle className="text-2xl">{scheduledMatches.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('onCourt')}</CardDescription>
                <CardTitle className="text-2xl text-primary">{onCourtMatches.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t('completed')}</CardDescription>
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
              const externalMatches = crossTournamentMatches.get(venue.id) || [];
              const hasLiveMatch = venueMatches.some((m) => m.status === "ON_COURT") ||
                externalMatches.some((m) => m.status === "ON_COURT");

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
                      <Badge variant="outline">{t('courts', { count: venue.numCourts })}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {Array.from({ length: venue.numCourts }, (_, i) => i + 1).map((courtNum) => {
                        const slot: CourtSlot = {
                          venueId: venue.id,
                          venueName: venue.name,
                          courtNumber: courtNum,
                          slotId: `${venue.id}:${courtNum}`,
                        };

                        const ourMatch = getOurMatchOnSlot(venue.id, courtNum);
                        const externalMatch = getExternalMatchOnSlot(venue.id, courtNum);
                        const isBlocked = !!externalMatch;
                        const isLive = ourMatch?.status === "ON_COURT" || externalMatch?.status === "ON_COURT";
                        
                        // Check optimistic assignment
                        const optimisticMatch = optimisticAssignment?.targetSlot.slotId === slot.slotId
                          ? optimisticAssignment.match
                          : null;
                        const isOptimistic = !!optimisticMatch && !ourMatch;

                        const displayMatch = ourMatch || optimisticMatch;

                        return (
                          <DroppableCourtSlot key={courtNum} slot={slot} isActive={isLive} isBlocked={isBlocked}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{t('court', { number: courtNum })}</span>
                              {isLive && (
                                <Badge variant="default" className="text-xs">
                                  <Play className="h-2 w-2 mr-1 fill-current" />
                                  {tCommon('live')}
                                </Badge>
                              )}
                              {isBlocked && !isLive && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                                      <Lock className="h-2 w-2 mr-1" />
                                      {tCommon('inUse')}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{externalMatch?.tournamentName}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            {/* External match */}
                            {externalMatch && (
                              <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20 text-sm">
                                <div className="flex items-center justify-between mb-1">
                                  <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-700">
                                    {externalMatch.tournamentName}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{externalMatch.homeTeamName || "TBD"}</span>
                                  <span>vs</span>
                                  <span>{externalMatch.awayTeamName || "TBD"}</span>
                                </div>
                              </div>
                            )}

                            {/* Our match */}
                            {displayMatch && !externalMatch && (
                              <div className="space-y-2">
                                {!isLive && !isOptimistic ? (
                                  <DraggableMatch match={displayMatch}>
                                    <div className="p-2 bg-background rounded border cursor-grab active:cursor-grabbing">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                                          <Badge variant="outline" className="text-xs">
                                            {getMatchLabel(displayMatch)}
                                          </Badge>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 w-5 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleUnassignMatch(displayMatch.id);
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium truncate">{displayMatch.homeTeam?.name || "TBD"}</span>
                                        <span className="text-muted-foreground mx-1">vs</span>
                                        <span className="font-medium truncate">{displayMatch.awayTeam?.name || "TBD"}</span>
                                      </div>
                                    </div>
                                  </DraggableMatch>
                                ) : (
                                  <div className={cn(
                                    "p-2 rounded border",
                                    isOptimistic ? "bg-primary/10 border-primary/20 animate-pulse" : "bg-background"
                                  )}>
                                    <div className="flex items-center justify-between mb-1">
                                      <Badge variant="outline" className="text-xs">
                                        {getMatchLabel(displayMatch)}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-medium truncate">{displayMatch.homeTeam?.name || "TBD"}</span>
                                      <span className="text-muted-foreground mx-1">vs</span>
                                      <span className="font-medium truncate">{displayMatch.awayTeam?.name || "TBD"}</span>
                                    </div>
                                  </div>
                                )}

                                <div className="flex gap-1">
                                  {!isLive && !isOptimistic && (
                                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handleStartMatch(displayMatch.id)}>
                                      <Play className="h-3 w-3 mr-1" />
                                      Start
                                    </Button>
                                  )}
                                  {isLive && (
                                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openResultDialog(displayMatch)}>
                                      <Trophy className="h-3 w-3 mr-1" />
                                      Result
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Empty slot */}
                            {!displayMatch && !externalMatch && (
                              <div className="text-center py-4 text-muted-foreground border border-dashed rounded">
                                <LayoutGrid className="h-6 w-6 mx-auto mb-1 opacity-50" />
                                <p className="text-xs">{t('dropMatchHere')}</p>
                              </div>
                            )}
                          </DroppableCourtSlot>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Unassigned Matches */}
          {pendingMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{t('unassignedMatches')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('dragMatchHelp')}
                  </p>
                </div>
                <Badge variant="secondary">{t('matchesCount', { count: pendingMatches.length })}</Badge>
              </div>

              {/* Qualifying matches */}
              {groupedMatches.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm text-muted-foreground">{t('qualifyingRound')}</h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleAutoAssign("QUALIFYING", "sequential")}
                        disabled={isAutoAssigning || qualifyingPendingMatches.length === 0}>
                        <ArrowDownNarrowWide className="h-4 w-4 mr-1" />{t('sequential')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleAutoAssign("QUALIFYING", "random")}
                        disabled={isAutoAssigning || qualifyingPendingMatches.length === 0}>
                        <Shuffle className="h-4 w-4 mr-1" />{t('random')}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupedMatches.map((group) => (
                      <Card key={group.groupName} className="overflow-hidden">
                        <CardHeader className="pb-2 bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Group {group.groupName}</CardTitle>
                            <Badge variant="outline" className="text-xs">{group.matches.length}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-2">
                          <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {group.matches.filter((m) => optimisticAssignment?.matchId !== m.id).map((match) => (
                              <DraggableMatch key={match.id} match={match}>
                                <button onClick={() => openAssignDialog(match)}
                                  className="w-full flex items-center gap-2 p-2 border rounded hover:bg-secondary/50 cursor-grab text-left text-sm">
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  <Badge variant="outline" className="text-xs">#{match.matchNumber}</Badge>
                                  <div className="truncate flex-1">
                                    <span className="font-medium">{match.homeTeam?.name || "TBD"}</span>
                                    <span className="text-muted-foreground mx-1">vs</span>
                                    <span className="font-medium">{match.awayTeam?.name || "TBD"}</span>
                                  </div>
                                </button>
                              </DraggableMatch>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Main draw matches */}
              {ungroupedMatches.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm text-muted-foreground">{t('mainDraw')}</h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleAutoAssign("MAIN", "sequential")}
                        disabled={isAutoAssigning || mainDrawPendingMatches.length === 0}>
                        <ArrowDownNarrowWide className="h-4 w-4 mr-1" />{t('sequential')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleAutoAssign("MAIN", "random")}
                        disabled={isAutoAssigning || mainDrawPendingMatches.length === 0}>
                        <Shuffle className="h-4 w-4 mr-1" />{t('random')}
                      </Button>
                    </div>
                  </div>
                  <Card>
                    <CardHeader className="pb-2 bg-secondary/30">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{t('bracketMatches')}</CardTitle>
                        <Badge variant="outline" className="text-xs">{ungroupedMatches.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {ungroupedMatches.filter((m) => optimisticAssignment?.matchId !== m.id).map((match) => (
                          <DraggableMatch key={match.id} match={match}>
                            <button onClick={() => openAssignDialog(match)}
                              className="w-full flex items-center gap-2 p-2.5 border rounded hover:bg-secondary/50 cursor-grab text-left text-sm">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <Badge variant="outline" className="text-xs">{getShortRoundLabel(match)}</Badge>
                              <div className="truncate flex-1">
                                <span className="font-medium">{match.homeTeam?.name || "TBD"}</span>
                                <span className="text-muted-foreground mx-1">vs</span>
                                <span className="font-medium">{match.awayTeam?.name || "TBD"}</span>
                              </div>
                            </button>
                          </DraggableMatch>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Drag Overlay */}
          <DragOverlay>
            {activeMatch ? (
              <div className="p-2.5 border rounded bg-background shadow-lg text-sm opacity-90">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">#{activeMatch.matchNumber}</Badge>
                  <div className="truncate">
                    <span className="font-medium">{activeMatch.homeTeam?.name || "TBD"}</span>
                    <span className="text-muted-foreground mx-1">vs</span>
                    <span className="font-medium">{activeMatch.awayTeam?.name || "TBD"}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </div>

        {/* Assign Dialog */}
        <Dialog open={isAssigning} onOpenChange={setIsAssigning}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('assignMatch.title')}</DialogTitle>
              <DialogDescription>
                {selectedMatch && (
                  <>{selectedMatch.homeTeam?.name} {tCommon('vs')} {selectedMatch.awayTeam?.name}</>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                <SelectTrigger>
                  <SelectValue placeholder={t('assignMatch.selectCourt')} />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableSlots().map((slot) => (
                    <SelectItem key={slot.slotId} value={slot.slotId}>
                      {slot.venueName} - {t('court', { number: slot.courtNumber })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getAvailableSlots().length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">{t('assignMatch.allCourtsInUse')}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssigning(false)}>{tCommon('cancel')}</Button>
              <Button onClick={handleAssignMatch} disabled={!selectedSlot || isSubmitting}>
                {isSubmitting ? tCommon('assigning') : tCommon('assign')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Replace Confirmation Dialog */}
        <Dialog open={!!replaceConfirmation} onOpenChange={() => setReplaceConfirmation(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('replaceMatch.title')}</DialogTitle>
              <DialogDescription>
                {t('replaceMatch.description', { venue: replaceConfirmation?.slot.venueName || '', court: replaceConfirmation?.slot.courtNumber || 0 })}
              </DialogDescription>
            </DialogHeader>
            {replaceConfirmation && (
              <div className="py-4 space-y-4">
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="text-xs text-muted-foreground mb-1">{t('replaceMatch.current')}</p>
                  <p className="font-medium text-sm">
                    #{replaceConfirmation.matchToReplace.matchNumber}: {replaceConfirmation.matchToReplace.homeTeam?.name || tCommon('tbd')} {tCommon('vs')} {replaceConfirmation.matchToReplace.awayTeam?.name || tCommon('tbd')}
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-xs text-muted-foreground mb-1">{t('replaceMatch.new')}</p>
                  <p className="font-medium text-sm">
                    #{replaceConfirmation.matchToAssign.matchNumber}: {replaceConfirmation.matchToAssign.homeTeam?.name || tCommon('tbd')} {tCommon('vs')} {replaceConfirmation.matchToAssign.awayTeam?.name || tCommon('tbd')}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplaceConfirmation(null)} disabled={isSubmitting}>{tCommon('cancel')}</Button>
              <Button onClick={handleConfirmReplace} disabled={isSubmitting}>
                {isSubmitting ? t('replaceMatch.replacing') : t('replaceMatch.replace')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enter Result Dialog */}
        <Dialog open={!!resultMatch} onOpenChange={() => setResultMatch(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('enterResult.title')}</DialogTitle>
              <DialogDescription>{t('enterResult.subtitle')}</DialogDescription>
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
                      <Badge className="bg-primary/10 text-primary"><Trophy className="h-3 w-3 mr-1" />{tCommon('winner')}</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground font-semibold text-lg">-</div>
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
                      <Badge className="bg-primary/10 text-primary"><Trophy className="h-3 w-3 mr-1" />{tCommon('winner')}</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scoreDetails" className="text-xs text-muted-foreground">{t('enterResult.scoreDetails')}</Label>
                  <Input id="scoreDetails" placeholder={t('enterResult.scoreDetailsPlaceholder')} value={scoreDetails}
                    onChange={(e) => setScoreDetails(e.target.value)} disabled={isSubmitting} />
                </div>
                {homeScore === awayScore && homeScore > 0 && (
                  <p className="text-sm text-amber-600 text-center">{t('enterResult.scoresTied')}</p>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setResultMatch(null)}>{tCommon('cancel')}</Button>
              <Button onClick={() => { const winner = determineWinner(); if (winner) handleCompleteMatch(winner); }}
                disabled={isSubmitting || homeScore === awayScore}>
                {isSubmitting ? tCommon('saving') : t('enterResult.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DndContext>
    </TooltipProvider>
  );
}
