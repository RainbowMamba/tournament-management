"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { generateRoundRobinMatches, generateBracketMatches, calculateGroupStandings, separateGroupPlayers } from "@/lib/tournament";
import type { TiebreakerPriority } from "@/lib/tournament";
import type { Stage } from "@prisma/client";
import { logger } from "@/lib/logger";

function isSerializationError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

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
              teams: {
                select: { id: true },
                orderBy: { seed: "asc" },
              },
            },
          },
        },
      },
      teams: {
        select: { id: true },
        orderBy: { seed: "asc" },
      },
      _count: { select: { matches: true } },
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  if (tournament._count.matches > 0) {
    return { error: "Matches already generated" };
  }

  const qualifyingStage = tournament.stages.find((s: Stage) => s.type === "QUALIFYING");
  const mainStage = tournament.stages.find((s: Stage) => s.type === "MAIN");

  if (!mainStage) {
    return { error: "Main stage not found" };
  }

  if (!tournament.hasQualifying || !qualifyingStage) {
    // Generate main draw bracket directly
    const teamIds = tournament.teams.map((t) => t.id);
    const bracketMatches = generateBracketMatches(teamIds);

    try {
      await prisma.$transaction(async (tx) => {
        // Re-check inside tx: serializable isolation prevents concurrent double-generation
        const existingCount = await tx.match.count({ where: { tournamentId } });
        if (existingCount > 0) throw new Error("ALREADY_GENERATED");

        const createdMatches = await tx.match.createManyAndReturn({
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

        const matchNumberToId = new Map(createdMatches.map((m) => [m.matchNumber, m.id]));
        const ops: Promise<unknown>[] = [];

        for (const match of bracketMatches) {
          if (match.nextMatchNumber) {
            const currentId = matchNumberToId.get(match.matchNumber);
            const nextId = matchNumberToId.get(match.nextMatchNumber);
            if (currentId && nextId) {
              ops.push(tx.match.update({ where: { id: currentId }, data: { nextMatchId: nextId } }));
            }
          }
        }

        for (const match of bracketMatches.filter((m) => m.round === 1)) {
          const hasHome = match.homeTeamId !== null;
          const hasAway = match.awayTeamId !== null;
          const byeTeamId = (hasHome && !hasAway) ? match.homeTeamId : (!hasHome && hasAway) ? match.awayTeamId : null;

          if (byeTeamId && match.nextMatchNumber) {
            const currentId = matchNumberToId.get(match.matchNumber);
            const nextId = matchNumberToId.get(match.nextMatchNumber);
            if (currentId && nextId) {
              ops.push(tx.match.update({ where: { id: currentId }, data: { status: "COMPLETED", winnerTeamId: byeTeamId } }));
              ops.push(tx.match.update({
                where: { id: nextId },
                data: match.nextMatchSlot === 0 ? { homeTeamId: byeTeamId } : { awayTeamId: byeTeamId },
              }));
            }
          }
        }

        await Promise.all(ops);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if ((e as Error).message === "ALREADY_GENERATED") return { error: "Matches already generated" };
      if (isSerializationError(e)) return { error: "Another operation is in progress. Please try again." };
      throw e;
    }

    revalidatePath(`/tournaments/${tournamentId}`);
    return { success: true };
  }

  // Generate round-robin matches for each qualifying group
  const matchesToCreate: Array<{
    tournamentId: string;
    stageId: string;
    groupId: string | null;
    round: number;
    matchNumber: number;
    homeTeamId: string | null;
    awayTeamId: string | null;
  }> = [];

  let globalMatchNumber = 0;
  for (const group of qualifyingStage.groups) {
    const teamIds = group.teams.map((t) => t.id);
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

  try {
    await prisma.$transaction(async (tx) => {
      const existingCount = await tx.match.count({ where: { tournamentId } });
      if (existingCount > 0) throw new Error("ALREADY_GENERATED");
      if (matchesToCreate.length > 0) {
        await tx.match.createMany({ data: matchesToCreate });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if ((e as Error).message === "ALREADY_GENERATED") return { error: "Matches already generated" };
    if (isSerializationError(e)) return { error: "Another operation is in progress. Please try again." };
    throw e;
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true };
}

export async function assignMatchToCourt(matchId: string, courtId: string, courtNumber: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  // Authorization check outside tx (stable ownership data)
  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: {
      tournament: { select: { id: true, ownerId: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!match || match.tournament.ownerId !== session.user.id) {
    return { error: "Match not found" };
  }

  // Court validation outside tx (court structure doesn't change during assignment)
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    select: { id: true, name: true, numCourts: true },
  });

  if (!court) {
    return { error: "Venue not found" };
  }

  if (courtNumber < 1 || courtNumber > court.numCourts) {
    return { error: `Invalid court number. Venue has ${court.numCourts} courts.` };
  }

  // All conflict checks + assignment inside a serializable transaction.
  // Serializable isolation creates predicate locks on the court-slot read,
  // so two concurrent requests cannot both successfully assign to the same slot.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshMatch = await tx.match.findUnique({
        where: { id: matchId },
        select: { status: true, homeTeamId: true, awayTeamId: true },
      });

      if (!freshMatch || freshMatch.status !== "PENDING") {
        return { error: "Match cannot be assigned" };
      }

      const courtOccupied = await tx.match.findFirst({
        where: {
          courtId,
          courtNumber,
          status: { in: ["PENDING", "ON_COURT"] },
        },
        select: { id: true, tournamentId: true, tournament: { select: { name: true } } },
      });

      if (courtOccupied) {
        if (courtOccupied.tournamentId === match.tournamentId) {
          return { error: "This court already has a match assigned. Unassign it first." };
        }
        return {
          error: `${court.name} Court #${courtNumber} is being used by "${courtOccupied.tournament.name}". Wait for their match to complete.`,
        };
      }

      const teamIds = [freshMatch.homeTeamId, freshMatch.awayTeamId].filter(Boolean) as string[];
      if (teamIds.length > 0) {
        const conflictingMatches = await tx.match.findMany({
          where: {
            id: { not: matchId },
            tournamentId: match.tournamentId,
            courtId: { not: null },
            status: { in: ["PENDING", "ON_COURT"] },
            OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
          },
          select: {
            status: true,
            homeTeamId: true,
            awayTeamId: true,
            court: { select: { name: true } },
          },
        });

        if (conflictingMatches.length > 0) {
          const conflictingTeams: string[] = [];
          for (const cm of conflictingMatches) {
            if (freshMatch.homeTeamId && (cm.homeTeamId === freshMatch.homeTeamId || cm.awayTeamId === freshMatch.homeTeamId)) {
              conflictingTeams.push(match.homeTeam?.name || "Home team");
            }
            if (freshMatch.awayTeamId && (cm.homeTeamId === freshMatch.awayTeamId || cm.awayTeamId === freshMatch.awayTeamId)) {
              conflictingTeams.push(match.awayTeam?.name || "Away team");
            }
          }
          const uniqueTeams = [...new Set(conflictingTeams)];
          const courtName = conflictingMatches[0].court?.name || "a court";
          const isPlaying = conflictingMatches[0].status === "ON_COURT";
          return {
            error: `${uniqueTeams.join(" and ")} ${uniqueTeams.length > 1 ? "are" : "is"} already ${isPlaying ? "playing" : "assigned"} on ${courtName}. A player cannot be assigned to multiple matches at the same time.`,
          };
        }
      }

      await tx.match.update({
        where: { id: matchId },
        data: { courtId, courtNumber },
      });

      return { success: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.success) {
      revalidatePath(`/tournaments/${match.tournamentId}`);
    }
    return result;
  } catch (e) {
    if (isSerializationError(e)) {
      return { error: "Another assignment is in progress. Please try again." };
    }
    throw e;
  }
}

export async function unassignMatchFromCourt(matchId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { tournament: { select: { id: true, ownerId: true } } },
  });

  if (!match || match.tournament.ownerId !== session.user.id) {
    return { error: "Match not found" };
  }

  // Atomic conditional: only unassigns if match is still PENDING
  const updated = await prisma.match.updateMany({
    where: { id: matchId, status: "PENDING" },
    data: { courtId: null, courtNumber: null },
  });

  if (updated.count === 0) {
    return { error: "Match cannot be unassigned" };
  }

  revalidatePath(`/tournaments/${match.tournamentId}`);
  return { success: true };
}

export async function startMatch(matchId: string) {
  const session = await auth();

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    include: { tournament: { select: { id: true, ownerId: true } } },
  });

  if (!match) {
    return { error: "Match not found" };
  }

  const isOwner = session?.user?.id && match.tournament.ownerId === session.user.id;
  let isStaff = false;
  if (!isOwner) {
    const { isTournamentVerified } = await import("@/lib/staff-session");
    isStaff = await isTournamentVerified(match.tournamentId);
  }

  if (!isOwner && !isStaff) {
    return { error: "Unauthorized" };
  }

  if (!match.courtId) {
    return { error: "Match must be assigned to a court first" };
  }

  // Atomic conditional: only starts if match is still PENDING
  const updated = await prisma.match.updateMany({
    where: { id: matchId, status: "PENDING" },
    data: { status: "ON_COURT" },
  });

  if (updated.count === 0) {
    return { error: "Match cannot be started" };
  }

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
      tournament: { select: { id: true, ownerId: true } },
      stage: { select: { id: true, type: true } },
    },
  });

  if (!match) {
    return { error: "Match not found" };
  }

  const isOwner = session?.user?.id && match.tournament.ownerId === session.user.id;
  let isStaff = false;
  if (!isOwner) {
    const { isTournamentVerified } = await import("@/lib/staff-session");
    isStaff = await isTournamentVerified(match.tournamentId);
  }

  if (!isOwner && !isStaff) {
    return { error: "Unauthorized" };
  }

  if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
    return { error: "Invalid winner" };
  }

  // Atomic conditional: only completes if match is not already COMPLETED.
  // Uses updateMany so only one concurrent request proceeds; the other gets count=0.
  const updated = await prisma.match.updateMany({
    where: { id: matchId, status: { not: "COMPLETED" } },
    data: {
      status: "COMPLETED",
      winnerTeamId,
      homeScore: scores?.homeScore ?? null,
      awayScore: scores?.awayScore ?? null,
      scoreDetails: scores?.scoreDetails ?? null,
      completedAt: new Date(),
      courtId: null,
      courtNumber: null,
    },
  });

  if (updated.count === 0) {
    return { error: "Match already completed" };
  }

  // Advance winner to next bracket match
  if (match.stage.type === "MAIN" && match.nextMatchId) {
    await prisma.match.update({
      where: { id: match.nextMatchId },
      data: match.nextMatchSlot === 0
        ? { homeTeamId: winnerTeamId }
        : { awayTeamId: winnerTeamId },
    });
  }

  // Resolve qualifying group placeholders if group is now complete
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
            select: { id: true, index: true },
            orderBy: { index: "asc" },
          },
        },
      },
      _count: {
        select: {
          matches: { where: { stage: { type: "MAIN" } } },
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

  if (tournament._count.matches > 0) {
    return { error: "Main draw already generated" };
  }

  if (!qualifyingStage) {
    return { error: "No qualifying stage found" };
  }

  const teamsAdvancing = qualifyingStage.teamsAdvancing ?? 1;
  const numGroups = qualifyingStage.groups.length;
  const totalSlots = numGroups * teamsAdvancing;

  if (totalSlots < 2) {
    return { error: "Not enough slots for main draw" };
  }

  const placeholderSlots: Array<{ groupId: string; rank: number; groupIndex: number }> = [];
  for (let rank = 1; rank <= teamsAdvancing; rank++) {
    for (const group of qualifyingStage.groups) {
      placeholderSlots.push({ groupId: group.id, rank, groupIndex: group.index });
    }
  }

  const reorderedSlots = separateGroupPlayers(placeholderSlots);
  const slotIds = reorderedSlots.map((_, i) => `PLACEHOLDER_${i}`);
  const bracketMatches = generateBracketMatches(slotIds);

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

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check inside tx to prevent concurrent double-generation
      const existingCount = await tx.match.count({ where: { stageId: mainStage.id } });
      if (existingCount > 0) throw new Error("ALREADY_GENERATED");

      const createdMatches = await tx.match.createManyAndReturn({
        data: matchData,
        select: {
          id: true,
          matchNumber: true,
          homePlaceholderGroupId: true,
          homePlaceholderRank: true,
          awayPlaceholderGroupId: true,
          awayPlaceholderRank: true,
          nextMatchSlot: true,
        },
      });

      const matchNumberToId = new Map(createdMatches.map((m) => [m.matchNumber, m.id]));
      const ops: Promise<unknown>[] = [];

      for (const match of bracketMatches) {
        if (match.nextMatchNumber) {
          const currentId = matchNumberToId.get(match.matchNumber);
          const nextId = matchNumberToId.get(match.nextMatchNumber);
          if (currentId && nextId) {
            ops.push(tx.match.update({ where: { id: currentId }, data: { nextMatchId: nextId } }));
          }
        }
      }

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
          ops.push(tx.match.update({ where: { id: fMatch.id }, data: { status: "COMPLETED" } }));
          ops.push(tx.match.update({
            where: { id: nextId },
            data: fMatch.nextMatchSlot === 0
              ? { homePlaceholderGroupId: fMatch.homePlaceholderGroupId, homePlaceholderRank: fMatch.homePlaceholderRank }
              : { awayPlaceholderGroupId: fMatch.homePlaceholderGroupId, awayPlaceholderRank: fMatch.homePlaceholderRank },
          }));
        } else if (!hasHome && hasAway) {
          ops.push(tx.match.update({ where: { id: fMatch.id }, data: { status: "COMPLETED" } }));
          ops.push(tx.match.update({
            where: { id: nextId },
            data: fMatch.nextMatchSlot === 0
              ? { homePlaceholderGroupId: fMatch.awayPlaceholderGroupId, homePlaceholderRank: fMatch.awayPlaceholderRank }
              : { awayPlaceholderGroupId: fMatch.awayPlaceholderGroupId, awayPlaceholderRank: fMatch.awayPlaceholderRank },
          }));
        }
      }

      await Promise.all(ops);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if ((e as Error).message === "ALREADY_GENERATED") return { error: "Main draw already generated" };
    if (isSerializationError(e)) return { error: "Another operation is in progress. Please try again." };
    throw e;
  }

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
  const [qualifyingStage, mainStage, tournamentRow] = await Promise.all([
    prisma.stage.findFirst({
      where: { tournamentId, type: "QUALIFYING" },
      select: {
        id: true,
        teamsAdvancing: true,
        groups: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            teams: { select: { id: true } },
            matches: {
              select: {
                status: true,
                homeTeamId: true,
                awayTeamId: true,
                winnerTeamId: true,
                homeScore: true,
                awayScore: true,
              },
            },
          },
        },
      },
    }),
    prisma.stage.findFirst({
      where: { tournamentId, type: "MAIN" },
      select: { id: true },
    }),
    prisma.tournament.findFirst({
      where: { id: tournamentId },
      select: { tiebreakerPriority: true },
    }),
  ]);

  if (!qualifyingStage || !mainStage || !tournamentRow) return;

  const tiebreakerPriority = tournamentRow.tiebreakerPriority as TiebreakerPriority;
  const teamsAdvancing = qualifyingStage.teamsAdvancing ?? 1;
  const completedGroupStandings: Array<{ groupId: string; rank: number; teamId: string }> = [];

  for (const group of qualifyingStage.groups) {
    const groupMatches = group.matches;
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

  const completedGroupIds = [...new Set(completedGroupStandings.map((s) => s.groupId))];
  const standingsMap = new Map(
    completedGroupStandings.map((s) => [`${s.groupId}:${s.rank}`, s.teamId])
  );

  // Read placeholders + write resolved teams atomically: two concurrent
  // completeMatch calls on sibling groups would otherwise race here, with
  // each reading a stale snapshot before either writes.
  try {
    await prisma.$transaction(
      async (tx) => {
        const placeholderMatches = await tx.match.findMany({
          where: {
            stageId: mainStage.id,
            OR: [
              { homePlaceholderGroupId: { in: completedGroupIds } },
              { awayPlaceholderGroupId: { in: completedGroupIds } },
            ],
          },
          select: {
            id: true,
            homePlaceholderGroupId: true,
            homePlaceholderRank: true,
            awayPlaceholderGroupId: true,
            awayPlaceholderRank: true,
            homeTeamId: true,
            awayTeamId: true,
          },
        });

        for (const match of placeholderMatches) {
          const updateData: { homeTeamId?: string; awayTeamId?: string } = {};

          if (match.homePlaceholderGroupId && match.homePlaceholderRank && !match.homeTeamId) {
            const teamId = standingsMap.get(`${match.homePlaceholderGroupId}:${match.homePlaceholderRank}`);
            if (teamId) updateData.homeTeamId = teamId;
          }
          if (match.awayPlaceholderGroupId && match.awayPlaceholderRank && !match.awayTeamId) {
            const teamId = standingsMap.get(`${match.awayPlaceholderGroupId}:${match.awayPlaceholderRank}`);
            if (teamId) updateData.awayTeamId = teamId;
          }

          if (Object.keys(updateData).length > 0) {
            await tx.match.update({ where: { id: match.id }, data: updateData });
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    if (isSerializationError(e)) {
      logger.warn("resolveGroupPlaceholders serialization conflict; will retry on next match completion", {
        tournamentId,
      });
      return;
    }
    throw e;
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
        include: { court: true },
        orderBy: { court: { name: "asc" } },
      },
      stages: true,
      matches: {
        select: {
          id: true,
          status: true,
          stageId: true,
          groupId: true,
          matchNumber: true,
          courtId: true,
          courtNumber: true,
          homeTeamId: true,
          awayTeamId: true,
        },
      },
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  const tournamentCourts = tournament.tournamentCourts.map((tc) => tc.court);

  if (tournamentCourts.length === 0) {
    return { error: "No courts assigned to this tournament" };
  }

  const targetStage = tournament.stages.find((s) => s.type === stageType);
  if (!targetStage) {
    return { error: `${stageType === "QUALIFYING" ? "Qualifying" : "Main draw"} stage not found` };
  }

  // Teams already on a court (from matches fetched above - tournament-scoped only)
  const assignedMatches = tournament.matches.filter(
    (m) => m.courtId && (m.status === "PENDING" || m.status === "ON_COURT")
  );
  const teamsAssignedToCourt = new Set<string>();
  for (const m of assignedMatches) {
    if (m.homeTeamId) teamsAssignedToCourt.add(m.homeTeamId);
    if (m.awayTeamId) teamsAssignedToCourt.add(m.awayTeamId);
  }

  // Court slots occupied by ANY tournament (cross-tournament check)
  const tournamentCourtIds = tournamentCourts.map((c) => c.id);
  const occupiedCourts = await prisma.match.findMany({
    where: {
      courtId: { in: tournamentCourtIds },
      status: { in: ["PENDING", "ON_COURT"] },
    },
    select: { courtId: true, courtNumber: true },
  });

  const occupiedSlots = new Set(
    occupiedCourts
      .filter((m) => m.courtNumber !== null)
      .map((m) => `${m.courtId}:${m.courtNumber}`)
  );

  const availableSlots: Array<{ courtId: string; courtNumber: number }> = [];
  for (const venue of tournamentCourts) {
    for (let num = 1; num <= venue.numCourts; num++) {
      if (!occupiedSlots.has(`${venue.id}:${num}`)) {
        availableSlots.push({ courtId: venue.id, courtNumber: num });
      }
    }
  }

  if (availableSlots.length === 0) {
    return { error: "No available courts" };
  }

  let unassignedMatches = tournament.matches.filter(
    (m) =>
      m.stageId === targetStage.id &&
      m.status === "PENDING" &&
      !m.courtId &&
      m.homeTeamId &&
      m.awayTeamId
  );

  unassignedMatches = unassignedMatches.filter((match) => {
    const homeConflict = match.homeTeamId && teamsAssignedToCourt.has(match.homeTeamId);
    const awayConflict = match.awayTeamId && teamsAssignedToCourt.has(match.awayTeamId);
    return !homeConflict && !awayConflict;
  });

  if (unassignedMatches.length === 0) {
    return { error: "No eligible matches to assign" };
  }

  if (mode === "sequential") {
    unassignedMatches.sort((a, b) => {
      if (a.groupId && b.groupId) {
        if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
      } else if (a.groupId && !b.groupId) {
        return -1;
      } else if (!a.groupId && b.groupId) {
        return 1;
      }
      return a.matchNumber - b.matchNumber;
    });
  } else {
    for (let i = unassignedMatches.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unassignedMatches[i], unassignedMatches[j]] = [unassignedMatches[j], unassignedMatches[i]];
    }
  }

  const assignments: { matchId: string; courtId: string; courtNumber: number }[] = [];
  const newlyAssignedTeams = new Set<string>();
  let slotIndex = 0;

  for (const match of unassignedMatches) {
    if (slotIndex >= availableSlots.length) break;

    const homeConflict = match.homeTeamId && newlyAssignedTeams.has(match.homeTeamId);
    const awayConflict = match.awayTeamId && newlyAssignedTeams.has(match.awayTeamId);
    if (homeConflict || awayConflict) continue;

    assignments.push({
      matchId: match.id,
      courtId: availableSlots[slotIndex].courtId,
      courtNumber: availableSlots[slotIndex].courtNumber,
    });

    if (match.homeTeamId) newlyAssignedTeams.add(match.homeTeamId);
    if (match.awayTeamId) newlyAssignedTeams.add(match.awayTeamId);
    slotIndex++;
  }

  if (assignments.length === 0) {
    return { error: "No matches could be assigned due to player conflicts" };
  }

  // Re-validate each assignment inside a serializable transaction.
  // Prevents races with concurrent assignMatchToCourt or autoAssignMatches calls.
  let assignedCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        const occupied = await tx.match.findFirst({
          where: {
            courtId: assignment.courtId,
            courtNumber: assignment.courtNumber,
            status: { in: ["PENDING", "ON_COURT"] },
          },
          select: { id: true },
        });
        if (occupied) continue;

        const result = await tx.match.updateMany({
          where: {
            id: assignment.matchId,
            status: "PENDING",
            courtId: null,
          },
          data: { courtId: assignment.courtId, courtNumber: assignment.courtNumber },
        });
        if (result.count > 0) assignedCount++;
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (isSerializationError(e)) {
      return { error: "Another assignment is in progress. Please try again." };
    }
    throw e;
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true, assignedCount };
}
