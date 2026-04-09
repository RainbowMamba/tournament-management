"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { generateRoundRobinMatches, generateBracketMatches, calculateGroupStandings, separateGroupPlayers } from "@/lib/tournament";
import type { TiebreakerPriority } from "@/lib/tournament";
import type { Stage, Team } from "@prisma/client";

export async function generateMatches(tournamentId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, ownerId: session.user.id },
    include: {
      stages: {
        include: {
          groups: {
            include: {
              teams: { orderBy: { seed: "asc" } },
            },
          },
        },
      },
      teams: { orderBy: { seed: "asc" } },
      matches: true,
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  if (tournament.matches.length > 0) {
    return { error: "Matches already generated" };
  }

  const qualifyingStage = tournament.stages.find((s: Stage) => s.type === "QUALIFYING");
  const mainStage = tournament.stages.find((s: Stage) => s.type === "MAIN");

  if (!mainStage) {
    return { error: "Main stage not found" };
  }

  const matchesToCreate: Array<{
    tournamentId: string;
    stageId: string;
    groupId: string | null;
    round: number;
    matchNumber: number;
    homeTeamId: string | null;
    awayTeamId: string | null;
    nextMatchId?: string;
    nextMatchSlot?: number;
  }> = [];

  if (tournament.hasQualifying && qualifyingStage) {
    // Generate round-robin matches for each group
    let globalMatchNumber = 0;
    
    for (const group of qualifyingStage.groups) {
      const teamIds = group.teams.map((t: Team) => t.id);
      const groupMatches = generateRoundRobinMatches(teamIds);

      for (const match of groupMatches) {
        globalMatchNumber++;
        matchesToCreate.push({
          tournamentId: tournament.id,
          stageId: qualifyingStage.id,
          groupId: group.id,
          round: match.round,
          matchNumber: globalMatchNumber,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
        });
      }
    }
  } else {
    // Generate main draw bracket directly
    const teamIds = tournament.teams.map((t: Team) => t.id);
    const bracketMatches = generateBracketMatches(teamIds);

    // Batch create all matches at once
    const createdMatches = await prisma.match.createManyAndReturn({
      data: bracketMatches.map((match) => ({
        tournamentId: tournament.id,
        stageId: mainStage.id,
        groupId: null,
        round: match.round,
        matchNumber: match.matchNumber,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        nextMatchSlot: match.nextMatchSlot,
      })),
      select: { id: true, matchNumber: true },
    });

    // Build matchNumber -> id lookup
    const matchNumberToId = new Map(createdMatches.map((m) => [m.matchNumber, m.id]));

    // Batch link matches to their next match + handle byes in one transaction
    const updates: ReturnType<typeof prisma.match.update>[] = [];

    // Link matches to next match
    for (const match of bracketMatches) {
      if (match.nextMatchNumber) {
        const currentId = matchNumberToId.get(match.matchNumber);
        const nextId = matchNumberToId.get(match.nextMatchNumber);
        if (currentId && nextId) {
          updates.push(
            prisma.match.update({
              where: { id: currentId },
              data: { nextMatchId: nextId },
            })
          );
        }
      }
    }

    // Handle first-round byes
    const firstRoundMatches = bracketMatches.filter((m) => m.round === 1);
    for (const match of firstRoundMatches) {
      const hasHome = match.homeTeamId !== null;
      const hasAway = match.awayTeamId !== null;
      const byeTeamId = (hasHome && !hasAway) ? match.homeTeamId : (!hasHome && hasAway) ? match.awayTeamId : null;

      if (byeTeamId && match.nextMatchNumber) {
        const currentId = matchNumberToId.get(match.matchNumber);
        const nextId = matchNumberToId.get(match.nextMatchNumber);
        if (currentId && nextId) {
          updates.push(
            prisma.match.update({
              where: { id: currentId },
              data: { status: "COMPLETED", winnerTeamId: byeTeamId },
            })
          );
          updates.push(
            prisma.match.update({
              where: { id: nextId },
              data: match.nextMatchSlot === 0
                ? { homeTeamId: byeTeamId }
                : { awayTeamId: byeTeamId },
            })
          );
        }
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    revalidatePath(`/tournaments/${tournamentId}`);
    return { success: true };
  }

  // Create qualifying matches
  if (matchesToCreate.length > 0) {
    await prisma.match.createMany({
      data: matchesToCreate,
    });
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}

export async function assignMatchToCourt(matchId: string, courtId: string, courtNumber: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { 
      tournament: true,
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (!match || match.tournament.ownerId !== session.user.id) {
    return { error: "Match not found" };
  }

  if (match.status !== "PENDING") {
    return { error: "Match cannot be assigned" };
  }

  // Validate court number against venue's numCourts
  const court = await prisma.court.findUnique({
    where: { id: courtId },
  });

  if (!court) {
    return { error: "Venue not found" };
  }

  if (courtNumber < 1 || courtNumber > court.numCourts) {
    return { error: `Invalid court number. Venue has ${court.numCourts} courts.` };
  }

  // Check if this specific court number is occupied by ANY match (cross-tournament check)
  const courtOccupied = await prisma.match.findFirst({
    where: {
      courtId,
      courtNumber,
      status: { in: ["PENDING", "ON_COURT"] },
    },
    include: {
      tournament: {
        select: { id: true, name: true },
      },
    },
  });

  if (courtOccupied) {
    if (courtOccupied.tournamentId === match.tournamentId) {
      // Same tournament - this is a replacement scenario handled by UI
      // For direct API call, we'll block it
      return { error: "This court already has a match assigned. Unassign it first." };
    } else {
      // Different tournament - cross-tournament conflict
      return {
        error: `${court.name} Court #${courtNumber} is being used by "${courtOccupied.tournament.name}". Wait for their match to complete.`,
      };
    }
  }

  // Check if any team in this match is already assigned to a court within the same tournament
  const teamIds = [match.homeTeamId, match.awayTeamId].filter(Boolean) as string[];
  
  if (teamIds.length > 0) {
    const assignedMatches = await prisma.match.findMany({
      where: {
        id: { not: matchId }, // Exclude the current match
        tournamentId: match.tournamentId,
        courtId: { not: null }, // Has a court assigned
        status: { in: ["PENDING", "ON_COURT"] }, // Either scheduled or playing
        OR: [
          { homeTeamId: { in: teamIds } },
          { awayTeamId: { in: teamIds } },
        ],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        court: true,
      },
    });

    if (assignedMatches.length > 0) {
      // Find which team(s) are already assigned to a court
      const conflictingTeams: string[] = [];
      for (const assignedMatch of assignedMatches) {
        if (match.homeTeamId && (assignedMatch.homeTeamId === match.homeTeamId || assignedMatch.awayTeamId === match.homeTeamId)) {
          conflictingTeams.push(match.homeTeam?.name || "Home team");
        }
        if (match.awayTeamId && (assignedMatch.homeTeamId === match.awayTeamId || assignedMatch.awayTeamId === match.awayTeamId)) {
          conflictingTeams.push(match.awayTeam?.name || "Away team");
        }
      }
      
      const uniqueTeams = [...new Set(conflictingTeams)];
      const courtName = assignedMatches[0].court?.name || "a court";
      const isPlaying = assignedMatches[0].status === "ON_COURT";
      
      return { 
        error: `${uniqueTeams.join(" and ")} ${uniqueTeams.length > 1 ? "are" : "is"} already ${isPlaying ? "playing" : "assigned"} on ${courtName}. A player cannot be assigned to multiple matches at the same time.` 
      };
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { courtId, courtNumber },
  });

  revalidatePath(`/tournaments/${match.tournamentId}`);
  return { success: true };
}

export async function unassignMatchFromCourt(matchId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { tournament: true },
  });

  if (!match || match.tournament.ownerId !== session.user.id) {
    return { error: "Match not found" };
  }

  if (match.status !== "PENDING") {
    return { error: "Match cannot be unassigned" };
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { courtId: null, courtNumber: null },
  });

  revalidatePath(`/tournaments/${match.tournamentId}`);
  return { success: true };
}

export async function startMatch(matchId: string) {
  const session = await auth();
  
  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { tournament: true },
  });

  if (!match) {
    return { error: "Match not found" };
  }

  // Check if user is tournament owner
  const isOwner = session?.user?.id && match.tournament.ownerId === session.user.id;
  
  // Check if user is staff with verified access
  let isStaff = false;
  if (!isOwner) {
    const { isTournamentVerified } = await import("@/lib/staff-session");
    isStaff = await isTournamentVerified(match.tournamentId);
  }

  if (!isOwner && !isStaff) {
    return { error: "Unauthorized" };
  }

  if (match.status !== "PENDING") {
    return { error: "Match cannot be started" };
  }

  if (!match.courtId) {
    return { error: "Match must be assigned to a court first" };
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status: "ON_COURT" },
  });

  revalidatePath(`/tournaments/${match.tournamentId}`);
  revalidatePath(`/staff/tournaments/${match.tournamentId}`);
  return { success: true };
}

export async function completeMatch(
  matchId: string, 
  winnerTeamId: string,
  scores?: { homeScore: number; awayScore: number; scoreDetails?: string }
) {
  const session = await auth();

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { 
      tournament: true,
      stage: true,
    },
  });

  if (!match) {
    return { error: "Match not found" };
  }

  // Check if user is tournament owner
  const isOwner = session?.user?.id && match.tournament.ownerId === session.user.id;
  
  // Check if user is staff with verified access
  let isStaff = false;
  if (!isOwner) {
    const { isTournamentVerified } = await import("@/lib/staff-session");
    isStaff = await isTournamentVerified(match.tournamentId);
  }

  if (!isOwner && !isStaff) {
    return { error: "Unauthorized" };
  }

  if (match.status === "COMPLETED") {
    return { error: "Match already completed" };
  }

  // Validate winner is one of the teams
  if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
    return { error: "Invalid winner" };
  }

  // Update match
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: "COMPLETED",
      winnerTeam: { connect: { id: winnerTeamId } },
      homeScore: scores?.homeScore ?? null,
      awayScore: scores?.awayScore ?? null,
      scoreDetails: scores?.scoreDetails ?? null,
      completedAt: new Date(),
      court: match.courtId ? { disconnect: true } : undefined, // Free up the court
    },
  });

  // If this is a main draw match, advance winner to next match
  if (match.stage.type === "MAIN" && match.nextMatchId) {
    const updateData = match.nextMatchSlot === 0
      ? { homeTeam: { connect: { id: winnerTeamId } } }
      : { awayTeam: { connect: { id: winnerTeamId } } };

    await prisma.match.update({
      where: { id: match.nextMatchId },
      data: updateData,
    });
  }

  // If this is a qualifying match, check if group is complete and resolve placeholders
  if (match.stage.type === "QUALIFYING") {
    await resolveGroupPlaceholders(match.tournamentId);
  }

  revalidatePath(`/tournaments/${match.tournamentId}`);
  revalidatePath(`/staff/tournaments/${match.tournamentId}`);
  return { success: true };
}

export async function generateMainDraw(tournamentId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, ownerId: session.user.id },
    include: {
      stages: {
        include: {
          groups: {
            include: {
              teams: true,
            },
            orderBy: { index: "asc" },
          },
          matches: true,
        },
      },
      matches: {
        where: {
          stage: { type: "MAIN" },
        },
      },
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  const mainStage = tournament.stages.find((s: { type: string }) => s.type === "MAIN");
  const qualifyingStage = tournament.stages.find((s: { type: string }) => s.type === "QUALIFYING");

  if (!mainStage) {
    return { error: "Main stage not found" };
  }

  if (tournament.matches.length > 0) {
    return { error: "Main draw already generated" };
  }

  if (!qualifyingStage) {
    return { error: "No qualifying stage found" };
  }

  const teamsAdvancing = qualifyingStage.teamsAdvancing ?? 1;
  const numGroups = qualifyingStage.groups.length;
  
  // Create placeholder slots: each group sends teamsAdvancing number of teams
  // Total slots = numGroups * teamsAdvancing
  const totalSlots = numGroups * teamsAdvancing;
  
  if (totalSlots < 2) {
    return { error: "Not enough slots for main draw" };
  }

  // Create placeholder entries: [{groupId, rank, groupIndex}]
  // Seeding order: 1st from A, 1st from B, ..., 2nd from A, 2nd from B, ...
  const placeholderSlots: Array<{ groupId: string; rank: number; groupIndex: number }> = [];
  
  for (let rank = 1; rank <= teamsAdvancing; rank++) {
    for (const group of qualifyingStage.groups) {
      placeholderSlots.push({
        groupId: group.id,
        rank,
        groupIndex: group.index,
      });
    }
  }

  // Reorder placeholder slots to separate players from the same group
  // into opposite halves of the bracket (so they only meet in the final)
  const reorderedSlots = separateGroupPlayers(placeholderSlots);

  // Generate bracket structure using placeholder indices as "team IDs"
  // Use the reordered slots to ensure group separation
  const slotIds = reorderedSlots.map((_, i) => `PLACEHOLDER_${i}`);
  const bracketMatches = generateBracketMatches(slotIds);

  // Batch create all matches with placeholders
  const matchData = bracketMatches.map((match) => {
    const homeSlotIndex = match.homeTeamId ? parseInt(match.homeTeamId.replace("PLACEHOLDER_", "")) : null;
    const awaySlotIndex = match.awayTeamId ? parseInt(match.awayTeamId.replace("PLACEHOLDER_", "")) : null;
    const homePlaceholder = homeSlotIndex !== null ? reorderedSlots[homeSlotIndex] : null;
    const awayPlaceholder = awaySlotIndex !== null ? reorderedSlots[awaySlotIndex] : null;

    return {
      tournamentId: tournament.id,
      stageId: mainStage.id,
      groupId: null as string | null,
      round: match.round,
      matchNumber: match.matchNumber,
      homeTeamId: null as string | null,
      awayTeamId: null as string | null,
      homePlaceholderGroupId: homePlaceholder?.groupId ?? null,
      homePlaceholderRank: homePlaceholder?.rank ?? null,
      awayPlaceholderGroupId: awayPlaceholder?.groupId ?? null,
      awayPlaceholderRank: awayPlaceholder?.rank ?? null,
      nextMatchSlot: match.nextMatchSlot,
    };
  });

  const createdMatches = await prisma.match.createManyAndReturn({
    data: matchData,
    select: { id: true, matchNumber: true, homePlaceholderGroupId: true, homePlaceholderRank: true, awayPlaceholderGroupId: true, awayPlaceholderRank: true, nextMatchSlot: true },
  });

  // Build matchNumber -> match lookup
  const matchNumberToId = new Map(createdMatches.map((m) => [m.matchNumber, m.id]));

  // Batch all linking and bye handling in one transaction
  const updates: ReturnType<typeof prisma.match.update>[] = [];

  // Link matches to next match
  for (const match of bracketMatches) {
    if (match.nextMatchNumber) {
      const currentId = matchNumberToId.get(match.matchNumber);
      const nextId = matchNumberToId.get(match.nextMatchNumber);
      if (currentId && nextId) {
        updates.push(
          prisma.match.update({
            where: { id: currentId },
            data: { nextMatchId: nextId },
          })
        );
      }
    }
  }

  // Handle first-round byes using the data we already have (no extra query needed)
  const firstRoundCreated = createdMatches.filter((m) => {
    const bracket = bracketMatches.find((b) => b.matchNumber === m.matchNumber);
    return bracket?.round === 1;
  });

  for (const fMatch of firstRoundCreated) {
    const hasHome = fMatch.homePlaceholderGroupId !== null;
    const hasAway = fMatch.awayPlaceholderGroupId !== null;
    const bracket = bracketMatches.find((b) => b.matchNumber === fMatch.matchNumber)!;
    const nextId = bracket.nextMatchNumber ? matchNumberToId.get(bracket.nextMatchNumber) : null;

    if (!nextId) continue;

    if (hasHome && !hasAway) {
      updates.push(
        prisma.match.update({
          where: { id: fMatch.id },
          data: { status: "COMPLETED" },
        })
      );
      updates.push(
        prisma.match.update({
          where: { id: nextId },
          data: fMatch.nextMatchSlot === 0
            ? { homePlaceholderGroupId: fMatch.homePlaceholderGroupId, homePlaceholderRank: fMatch.homePlaceholderRank }
            : { awayPlaceholderGroupId: fMatch.homePlaceholderGroupId, awayPlaceholderRank: fMatch.homePlaceholderRank },
        })
      );
    } else if (!hasHome && hasAway) {
      updates.push(
        prisma.match.update({
          where: { id: fMatch.id },
          data: { status: "COMPLETED" },
        })
      );
      updates.push(
        prisma.match.update({
          where: { id: nextId },
          data: fMatch.nextMatchSlot === 0
            ? { homePlaceholderGroupId: fMatch.awayPlaceholderGroupId, homePlaceholderRank: fMatch.awayPlaceholderRank }
            : { awayPlaceholderGroupId: fMatch.awayPlaceholderGroupId, awayPlaceholderRank: fMatch.awayPlaceholderRank },
        })
      );
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  // Check if any groups are already complete and resolve their placeholders
  await resolveGroupPlaceholders(tournamentId);

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}

/**
 * Resolve group placeholders when group stage is complete
 * Called after completing a qualifying match or after generating main draw
 * Uses the tournament's tiebreaker priority setting for ranking teams
 */
export async function resolveGroupPlaceholders(tournamentId: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId },
    include: {
      stages: {
        include: {
          groups: {
            include: {
              teams: true,
            },
            orderBy: { index: "asc" },
          },
          matches: true,
        },
      },
    },
  });

  if (!tournament) return;

  const qualifyingStage = tournament.stages.find((s) => s.type === "QUALIFYING");
  const mainStage = tournament.stages.find((s) => s.type === "MAIN");

  if (!qualifyingStage || !mainStage) return;

  const qualifyingMatches = qualifyingStage.matches;
  const tiebreakerPriority = tournament.tiebreakerPriority as TiebreakerPriority;

  // Determine which groups are complete and calculate standings
  const teamsAdvancing = qualifyingStage.teamsAdvancing ?? 1;
  const completedGroupStandings: Array<{ groupId: string; rank: number; teamId: string }> = [];

  for (const group of qualifyingStage.groups) {
    const groupMatches = qualifyingMatches.filter((m) => m.groupId === group.id);
    const allCompleted = groupMatches.every((m) => m.status === "COMPLETED");

    if (!allCompleted || groupMatches.length === 0) continue;

    const teamIds = group.teams.map((t) => t.id);
    const matchResults = groupMatches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      winnerTeamId: m.winnerTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
    }));

    const standings = calculateGroupStandings(teamIds, matchResults, tiebreakerPriority);

    for (let rank = 1; rank <= teamsAdvancing && rank <= standings.length; rank++) {
      completedGroupStandings.push({
        groupId: group.id,
        rank,
        teamId: standings[rank - 1].teamId,
      });
    }
  }

  if (completedGroupStandings.length === 0) return;

  // Fetch all main draw placeholder matches in one query
  const completedGroupIds = [...new Set(completedGroupStandings.map((s) => s.groupId))];
  const allPlaceholderMatches = await prisma.match.findMany({
    where: {
      stageId: mainStage.id,
      OR: [
        { homePlaceholderGroupId: { in: completedGroupIds } },
        { awayPlaceholderGroupId: { in: completedGroupIds } },
      ],
    },
  });

  // Build a lookup: "groupId:rank" -> teamId
  const standingsMap = new Map(
    completedGroupStandings.map((s) => [`${s.groupId}:${s.rank}`, s.teamId])
  );

  // Batch all updates in one transaction
  const updates: ReturnType<typeof prisma.match.update>[] = [];

  for (const match of allPlaceholderMatches) {
    const updateData: { homeTeamId?: string; awayTeamId?: string } = {};

    if (match.homePlaceholderGroupId && match.homePlaceholderRank) {
      const teamId = standingsMap.get(`${match.homePlaceholderGroupId}:${match.homePlaceholderRank}`);
      if (teamId) updateData.homeTeamId = teamId;
    }
    if (match.awayPlaceholderGroupId && match.awayPlaceholderRank) {
      const teamId = standingsMap.get(`${match.awayPlaceholderGroupId}:${match.awayPlaceholderRank}`);
      if (teamId) updateData.awayTeamId = teamId;
    }

    if (Object.keys(updateData).length > 0) {
      updates.push(
        prisma.match.update({
          where: { id: match.id },
          data: updateData,
        })
      );
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function autoAssignMatches(
  tournamentId: string,
  stageType: "QUALIFYING" | "MAIN",
  mode: "sequential" | "random"
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, ownerId: session.user.id },
    include: {
      tournamentCourts: {
        include: {
          court: true,
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      stages: true,
      matches: {
        include: {
          homeTeam: true,
          awayTeam: true,
          stage: true,
        },
      },
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  // Get courts assigned to this tournament
  const tournamentCourts = tournament.tournamentCourts.map((tc) => tc.court);

  if (tournamentCourts.length === 0) {
    return { error: "No courts assigned to this tournament" };
  }

  // Find the target stage
  const targetStage = tournament.stages.find((s) => s.type === stageType);
  if (!targetStage) {
    return { error: `${stageType === "QUALIFYING" ? "Qualifying" : "Main draw"} stage not found` };
  }

  // Get all matches that are currently assigned to a court (PENDING with courtId or ON_COURT)
  // This includes matches from THIS tournament only for team conflict checking
  const assignedMatches = tournament.matches.filter(
    (m) => m.courtId && (m.status === "PENDING" || m.status === "ON_COURT")
  );

  // Get teams that are already assigned to a court
  const teamsAssignedToCourt = new Set<string>();
  for (const match of assignedMatches) {
    if (match.homeTeamId) teamsAssignedToCourt.add(match.homeTeamId);
    if (match.awayTeamId) teamsAssignedToCourt.add(match.awayTeamId);
  }

  // Get court IDs for this tournament
  const tournamentCourtIds = tournamentCourts.map((c) => c.id);

  // Check which individual courts are occupied (by ANY tournament - cross-tournament check)
  const occupiedCourts = await prisma.match.findMany({
    where: {
      courtId: { in: tournamentCourtIds },
      status: { in: ["PENDING", "ON_COURT"] },
    },
    select: { courtId: true, courtNumber: true },
  });

  // Build a set of occupied court slots (courtId + courtNumber)
  const occupiedSlots = new Set(
    occupiedCourts
      .filter((m) => m.courtNumber !== null)
      .map((m) => `${m.courtId}:${m.courtNumber}`)
  );

  // Build list of available court slots (courtId + courtNumber pairs)
  const availableSlots: Array<{ courtId: string; courtNumber: number; venueName: string }> = [];
  for (const venue of tournamentCourts) {
    for (let num = 1; num <= venue.numCourts; num++) {
      const slotKey = `${venue.id}:${num}`;
      if (!occupiedSlots.has(slotKey)) {
        availableSlots.push({
          courtId: venue.id,
          courtNumber: num,
          venueName: venue.name,
        });
      }
    }
  }

  if (availableSlots.length === 0) {
    return { error: "No available courts" };
  }

  // Get unassigned matches for the target stage that have both teams set
  let unassignedMatches = tournament.matches.filter(
    (m) =>
      m.stageId === targetStage.id &&
      m.status === "PENDING" &&
      !m.courtId &&
      m.homeTeamId &&
      m.awayTeamId
  );

  // Filter out matches where any team is already assigned to a court
  unassignedMatches = unassignedMatches.filter((match) => {
    const homeConflict = match.homeTeamId && teamsAssignedToCourt.has(match.homeTeamId);
    const awayConflict = match.awayTeamId && teamsAssignedToCourt.has(match.awayTeamId);
    return !homeConflict && !awayConflict;
  });

  if (unassignedMatches.length === 0) {
    return { error: "No eligible matches to assign" };
  }

  // Sort matches for sequential mode (by group, then by match number)
  if (mode === "sequential") {
    unassignedMatches.sort((a, b) => {
      // First sort by group (null groups go last)
      if (a.groupId && b.groupId) {
        if (a.groupId !== b.groupId) {
          return a.groupId.localeCompare(b.groupId);
        }
      } else if (a.groupId && !b.groupId) {
        return -1;
      } else if (!a.groupId && b.groupId) {
        return 1;
      }
      // Then by match number
      return a.matchNumber - b.matchNumber;
    });
  } else {
    // Shuffle for random mode
    for (let i = unassignedMatches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unassignedMatches[i], unassignedMatches[j]] = [unassignedMatches[j], unassignedMatches[i]];
    }
  }

  // Assign matches to court slots
  const assignments: { matchId: string; courtId: string; courtNumber: number }[] = [];
  const newlyAssignedTeams = new Set<string>();
  let slotIndex = 0;

  for (const match of unassignedMatches) {
    if (slotIndex >= availableSlots.length) break;

    // Check if any team from this match was already assigned in this batch
    const homeConflict = match.homeTeamId && newlyAssignedTeams.has(match.homeTeamId);
    const awayConflict = match.awayTeamId && newlyAssignedTeams.has(match.awayTeamId);

    if (homeConflict || awayConflict) {
      continue; // Skip this match, try the next one
    }

    // Assign the match
    assignments.push({
      matchId: match.id,
      courtId: availableSlots[slotIndex].courtId,
      courtNumber: availableSlots[slotIndex].courtNumber,
    });

    // Mark teams as assigned
    if (match.homeTeamId) newlyAssignedTeams.add(match.homeTeamId);
    if (match.awayTeamId) newlyAssignedTeams.add(match.awayTeamId);

    slotIndex++;
  }

  if (assignments.length === 0) {
    return { error: "No matches could be assigned due to player conflicts" };
  }

  // Perform all assignments in a transaction
  await prisma.$transaction(
    assignments.map((a) =>
      prisma.match.update({
        where: { id: a.matchId },
        data: { courtId: a.courtId, courtNumber: a.courtNumber },
      })
    )
  );

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true, assignedCount: assignments.length };
}
