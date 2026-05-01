"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  generateInitialSchedule,
  type CourtSlot,
  type QualifyingOptions,
  type ScheduleInputMatch,
} from "@/lib/tournament/schedule";

function isSerializationError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

export type GenerateInitialCourtScheduleInput = {
  tournamentId: string;
  // ISO datetime string from <input type="datetime-local">
  qualifyingStartTime: string | null;
  qualifyingDurationMin: number;
  // null => main starts immediately after qualifying ends
  mainStartTime: string | null;
  mainDurationMin: number;
  // Subset of tournament's court slots to use
  selectedCourts: CourtSlot[];
  // Optional preferences applied to qualifying matches only.
  qualifyingOptions?: QualifyingOptions;
};

export async function generateInitialCourtSchedule(input: GenerateInitialCourtScheduleInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  if (input.qualifyingDurationMin <= 0 || input.mainDurationMin <= 0) {
    return { error: "Match duration must be greater than 0" };
  }

  if (input.selectedCourts.length === 0) {
    return { error: "At least one court must be selected" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id: input.tournamentId, ownerId: session.user.id },
    include: {
      tournamentCourts: { include: { court: true } },
      stages: true,
      matches: {
        select: {
          id: true,
          status: true,
          stageId: true,
          round: true,
          matchNumber: true,
          homeTeamId: true,
          awayTeamId: true,
          nextMatchId: true,
          groupId: true,
          group: { select: { name: true } },
        },
      },
    },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  // Validate selected courts belong to tournament's venues
  const venueIds = new Set(tournament.tournamentCourts.map((tc) => tc.courtId));
  const venueNumCourts = new Map(
    tournament.tournamentCourts.map((tc) => [tc.courtId, tc.court.numCourts]),
  );
  for (const c of input.selectedCourts) {
    if (!venueIds.has(c.courtId)) {
      return { error: "Selected court is not part of this tournament" };
    }
    const max = venueNumCourts.get(c.courtId) ?? 0;
    if (c.courtNumber < 1 || c.courtNumber > max) {
      return { error: `Invalid court number ${c.courtNumber}` };
    }
  }

  const stageById = new Map(tournament.stages.map((s) => [s.id, s.type]));

  // Only PENDING matches with both teams (or null teams = main draw placeholders) eligible
  const eligible = tournament.matches.filter((m) => m.status === "PENDING");

  if (eligible.length === 0) {
    return { error: "No pending matches to schedule" };
  }

  const scheduleMatches: ScheduleInputMatch[] = eligible.map((m) => ({
    id: m.id,
    stageType: stageById.get(m.stageId) ?? "MAIN",
    round: m.round,
    matchNumber: m.matchNumber,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    nextMatchId: m.nextMatchId,
    groupId: m.groupId,
    groupName: m.group?.name ?? null,
  }));

  const qualifyingStart = input.qualifyingStartTime ? new Date(input.qualifyingStartTime) : null;
  const mainStart = input.mainStartTime ? new Date(input.mainStartTime) : null;

  const hasQualifying = scheduleMatches.some((m) => m.stageType === "QUALIFYING");
  if (hasQualifying && !qualifyingStart) {
    return { error: "Qualifying start time is required" };
  }

  const hasMain = scheduleMatches.some((m) => m.stageType === "MAIN");
  if (hasMain && !hasQualifying && !mainStart) {
    return { error: "Main draw start time is required" };
  }

  const result = generateInitialSchedule({
    matches: scheduleMatches,
    courts: input.selectedCourts,
    qualifyingStartTime: qualifyingStart,
    qualifyingDurationMin: input.qualifyingDurationMin,
    qualifyingOptions: input.qualifyingOptions,
    mainStartTime: mainStart,
    mainDurationMin: input.mainDurationMin,
  });

  if (result.assignments.length === 0) {
    return { error: "No matches could be scheduled" };
  }

  // Apply: clear existing schedule on PENDING matches, then write new assignments.
  // Only the schedule-only fields are touched. Live courtId/courtNumber and
  // status are independent — the timetable does not shift when matches start
  // or finish, and starting/completing a match does not edit the schedule.
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.match.updateMany({
          where: { tournamentId: input.tournamentId, status: "PENDING" },
          data: {
            scheduledAt: null,
            scheduledCourtId: null,
            scheduledCourtNumber: null,
          },
        });

        for (const a of result.assignments) {
          await tx.match.updateMany({
            where: { id: a.matchId, status: "PENDING" },
            data: {
              scheduledAt: a.scheduledAt,
              scheduledCourtId: a.courtId,
              scheduledCourtNumber: a.courtNumber,
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (isSerializationError(e)) {
      return { error: "Another assignment is in progress. Please try again." };
    }
    throw e;
  }

  revalidatePath(`/tournaments/${input.tournamentId}`);
  revalidatePath(`/tournaments/${input.tournamentId}/timeline`);
  return { success: true, scheduledCount: result.assignments.length };
}

export type SwapOrMoveInput = {
  matchId: string;
  targetCourtId: string;
  targetCourtNumber: number;
  targetScheduledAt: string; // ISO
};

// Drag-and-drop reschedule. Moves a PENDING match to a new (court, time) slot.
// If another PENDING match already occupies the target slot in the same
// tournament, the two matches swap places. Validates that neither move creates
// a same-time team conflict.
export async function swapOrMoveScheduledMatch(input: SwapOrMoveInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const targetTime = new Date(input.targetScheduledAt);
  if (Number.isNaN(targetTime.getTime())) {
    return { error: "Invalid target time" };
  }

  const sourceMatch = await prisma.match.findFirst({
    where: { id: input.matchId },
    include: {
      tournament: { select: { id: true, ownerId: true } },
    },
  });

  if (!sourceMatch || sourceMatch.tournament.ownerId !== session.user.id) {
    return { error: "Match not found" };
  }
  if (sourceMatch.status !== "PENDING") {
    return { error: "Only pending matches can be moved" };
  }
  if (
    !sourceMatch.scheduledAt ||
    !sourceMatch.scheduledCourtId ||
    sourceMatch.scheduledCourtNumber === null
  ) {
    return { error: "Source match has no schedule" };
  }

  const tournamentId = sourceMatch.tournamentId;

  // Validate target slot belongs to one of this tournament's courts.
  const tc = await prisma.tournamentCourt.findFirst({
    where: { tournamentId, courtId: input.targetCourtId },
    include: { court: { select: { numCourts: true } } },
  });
  if (!tc) {
    return { error: "Target court is not part of this tournament" };
  }
  if (input.targetCourtNumber < 1 || input.targetCourtNumber > tc.court.numCourts) {
    return { error: "Invalid target court number" };
  }

  // No-op: target equals current slot.
  if (
    sourceMatch.scheduledCourtId === input.targetCourtId &&
    sourceMatch.scheduledCourtNumber === input.targetCourtNumber &&
    sourceMatch.scheduledAt.getTime() === targetTime.getTime()
  ) {
    return { success: true, swapped: false };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Re-read source inside tx (status / schedule may have changed).
        const fresh = await tx.match.findUnique({
          where: { id: input.matchId },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            scheduledCourtId: true,
            scheduledCourtNumber: true,
            homeTeamId: true,
            awayTeamId: true,
          },
        });
        if (
          !fresh ||
          fresh.status !== "PENDING" ||
          !fresh.scheduledAt ||
          !fresh.scheduledCourtId ||
          fresh.scheduledCourtNumber === null
        ) {
          return { error: "Source match is no longer eligible" };
        }

        // Find any PENDING match currently sitting at the target schedule slot.
        const targetMatch = await tx.match.findFirst({
          where: {
            tournamentId,
            status: "PENDING",
            scheduledCourtId: input.targetCourtId,
            scheduledCourtNumber: input.targetCourtNumber,
            scheduledAt: targetTime,
          },
          select: {
            id: true,
            homeTeamId: true,
            awayTeamId: true,
          },
        });

        const sourceTeams = [fresh.homeTeamId, fresh.awayTeamId].filter(Boolean) as string[];
        const targetTeams = targetMatch
          ? ([targetMatch.homeTeamId, targetMatch.awayTeamId].filter(Boolean) as string[])
          : [];

        // Schedule-consistency check: would the printed timetable show
        // sourceMatch's teams in two places at targetTime?
        if (sourceTeams.length > 0) {
          const conflicts = await tx.match.findMany({
            where: {
              tournamentId,
              status: "PENDING",
              scheduledAt: targetTime,
              id: { notIn: [fresh.id, ...(targetMatch ? [targetMatch.id] : [])] },
              OR: [
                { homeTeamId: { in: sourceTeams } },
                { awayTeamId: { in: sourceTeams } },
              ],
            },
            select: { id: true },
          });
          if (conflicts.length > 0) {
            return { error: "A team in the moved match is already scheduled at the target time" };
          }
        }

        // Same check for the swap target: target's teams at source's original time.
        if (targetMatch && targetTeams.length > 0) {
          const conflicts = await tx.match.findMany({
            where: {
              tournamentId,
              status: "PENDING",
              scheduledAt: fresh.scheduledAt,
              id: { notIn: [fresh.id, targetMatch.id] },
              OR: [
                { homeTeamId: { in: targetTeams } },
                { awayTeamId: { in: targetTeams } },
              ],
            },
            select: { id: true },
          });
          if (conflicts.length > 0) {
            return { error: "A team in the swapped match would conflict at the new time" };
          }
        }

        if (targetMatch) {
          // Swap schedule slots between source and target.
          await tx.match.update({
            where: { id: targetMatch.id },
            data: {
              scheduledCourtId: fresh.scheduledCourtId,
              scheduledCourtNumber: fresh.scheduledCourtNumber,
              scheduledAt: fresh.scheduledAt,
            },
          });
          await tx.match.update({
            where: { id: fresh.id },
            data: {
              scheduledCourtId: input.targetCourtId,
              scheduledCourtNumber: input.targetCourtNumber,
              scheduledAt: targetTime,
            },
          });
          return { success: true, swapped: true };
        }

        await tx.match.update({
          where: { id: fresh.id },
          data: {
            scheduledCourtId: input.targetCourtId,
            scheduledCourtNumber: input.targetCourtNumber,
            scheduledAt: targetTime,
          },
        });
        return { success: true, swapped: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if ("error" in result) return result;

    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}/timeline`);
    return result;
  } catch (e) {
    if (isSerializationError(e)) {
      return { error: "Another assignment is in progress. Please try again." };
    }
    throw e;
  }
}
