"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { resolveGroupPlaceholders } from "./match";

function isSerializationError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AffectedMatchPreview = {
  id: string;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  round: number;
  matchNumber: number;
  stageType: "QUALIFYING" | "MAIN";
  groupId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  willReset: boolean;
};

export type CorrectMatchResultResponse =
  | { success: true; cascadedMatchCount: number }
  | { needsConfirmation: true; affectedMatches: AffectedMatchPreview[] }
  | { error: string };

type TargetMatchInfo = {
  id: string;
  nextMatchId: string | null;
  groupId: string | null;
  tournamentId: string;
  stage: { type: "QUALIFYING" | "MAIN" };
};

// BFS through bracket nextMatch links + (for qualifying) main-draw matches whose
// placeholder points at the affected group. Includes PENDING matches only when
// a placeholder-resolved team slot needs clearing — those still need cleanup
// even though their status doesn't change.
async function collectAffectedMatches(
  client: DbClient,
  target: TargetMatchInfo
): Promise<{ affectedIds: Set<string>; affectedGroupIds: Set<string> }> {
  const affectedIds = new Set<string>();
  const affectedGroupIds = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  if (target.nextMatchId) queue.push(target.nextMatchId);

  if (target.stage.type === "QUALIFYING" && target.groupId) {
    const groupMatches = await client.match.findMany({
      where: { groupId: target.groupId },
      select: { status: true },
    });
    const allCompleted =
      groupMatches.length > 0 &&
      groupMatches.every((m) => m.status === "COMPLETED");
    if (allCompleted) {
      affectedGroupIds.add(target.groupId);
      const mdMatches = await client.match.findMany({
        where: {
          tournamentId: target.tournamentId,
          stage: { type: "MAIN" },
          OR: [
            { homePlaceholderGroupId: target.groupId },
            { awayPlaceholderGroupId: target.groupId },
          ],
        },
        select: { id: true },
      });
      for (const m of mdMatches) queue.push(m.id);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const m = await client.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        nextMatchId: true,
        homeTeamId: true,
        awayTeamId: true,
        homePlaceholderGroupId: true,
        awayPlaceholderGroupId: true,
      },
    });
    if (!m) continue;

    let shouldInclude = false;
    if (m.status === "COMPLETED" || m.status === "ON_COURT") {
      shouldInclude = true;
    } else if (m.status === "PENDING") {
      if (
        m.homePlaceholderGroupId &&
        affectedGroupIds.has(m.homePlaceholderGroupId) &&
        m.homeTeamId !== null
      ) {
        shouldInclude = true;
      }
      if (
        m.awayPlaceholderGroupId &&
        affectedGroupIds.has(m.awayPlaceholderGroupId) &&
        m.awayTeamId !== null
      ) {
        shouldInclude = true;
      }
    }
    if (!shouldInclude) continue;

    affectedIds.add(m.id);
    if (m.nextMatchId) queue.push(m.nextMatchId);
  }

  return { affectedIds, affectedGroupIds };
}

// Reset a single downstream match. Two things happen:
//  1. The match itself goes back to PENDING (or stays PENDING) with score/winner cleared.
//  2. Its slot in the *next* match is unset, so the now-invalid winner doesn't linger downstream.
// Placeholder-driven team slots are cleared so resolveGroupPlaceholders can re-fill them.
async function resetMatchInTx(
  tx: Prisma.TransactionClient,
  matchId: string,
  affectedGroupIds: Set<string>
): Promise<void> {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      winnerTeamId: true,
      nextMatchId: true,
      nextMatchSlot: true,
      homePlaceholderGroupId: true,
      awayPlaceholderGroupId: true,
    },
  });
  if (!m) return;

  const wasCompletedOrOnCourt =
    m.status === "COMPLETED" || m.status === "ON_COURT";

  const updates: Prisma.MatchUpdateInput = {};

  if (wasCompletedOrOnCourt) {
    updates.status = "PENDING";
    updates.winnerTeam = { disconnect: true };
    updates.homeScore = null;
    updates.awayScore = null;
    updates.scoreDetails = null;
    updates.completedAt = null;
    updates.court = { disconnect: true };
    updates.courtNumber = null;
  }

  if (
    m.homePlaceholderGroupId &&
    affectedGroupIds.has(m.homePlaceholderGroupId)
  ) {
    updates.homeTeam = { disconnect: true };
  }
  if (
    m.awayPlaceholderGroupId &&
    affectedGroupIds.has(m.awayPlaceholderGroupId)
  ) {
    updates.awayTeam = { disconnect: true };
  }

  if (Object.keys(updates).length > 0) {
    await tx.match.update({ where: { id: matchId }, data: updates });
  }

  if (wasCompletedOrOnCourt && m.winnerTeamId && m.nextMatchId) {
    await tx.match.update({
      where: { id: m.nextMatchId },
      data:
        m.nextMatchSlot === 0
          ? { homeTeam: { disconnect: true } }
          : { awayTeam: { disconnect: true } },
    });
  }
}

export async function correctMatchResult(
  matchId: string,
  newResult: {
    winnerTeamId: string;
    homeScore: number;
    awayScore: number;
    scoreDetails?: string;
  },
  reason: string,
  confirmCascade: boolean = false
): Promise<CorrectMatchResultResponse> {
  if (!reason || reason.trim().length === 0) {
    return { error: "Reason is required" };
  }
  if (newResult.homeScore === newResult.awayScore) {
    return { error: "Scores must differ to determine a winner" };
  }
  if (newResult.homeScore < 0 || newResult.awayScore < 0) {
    return { error: "Scores cannot be negative" };
  }

  const session = await auth();

  const targetMatch = await prisma.match.findFirst({
    where: { id: matchId },
    include: {
      tournament: { select: { id: true, ownerId: true } },
      stage: { select: { type: true } },
    },
  });

  if (!targetMatch) {
    return { error: "Match not found" };
  }

  const isOwner =
    !!session?.user?.id && targetMatch.tournament.ownerId === session.user.id;
  let isStaff = false;
  if (!isOwner) {
    const { isTournamentVerified } = await import("@/lib/staff-session");
    isStaff = await isTournamentVerified(targetMatch.tournamentId);
  }
  if (!isOwner && !isStaff) {
    return { error: "Unauthorized" };
  }

  if (targetMatch.status !== "COMPLETED") {
    return { error: "Only completed matches can be edited" };
  }

  if (
    newResult.winnerTeamId !== targetMatch.homeTeamId &&
    newResult.winnerTeamId !== targetMatch.awayTeamId
  ) {
    return { error: "Invalid winner" };
  }

  const winnerScore =
    newResult.winnerTeamId === targetMatch.homeTeamId
      ? newResult.homeScore
      : newResult.awayScore;
  const loserScore =
    newResult.winnerTeamId === targetMatch.homeTeamId
      ? newResult.awayScore
      : newResult.homeScore;
  if (winnerScore <= loserScore) {
    return { error: "Winner score must be higher than the other side's score" };
  }

  const tournamentId = targetMatch.tournamentId;

  // Dry-run preview: if any downstream match would be touched and the caller
  // hasn't confirmed yet, return the impact list so the UI can ask the user.
  if (!confirmCascade) {
    const { affectedIds } = await collectAffectedMatches(prisma, {
      id: targetMatch.id,
      nextMatchId: targetMatch.nextMatchId,
      groupId: targetMatch.groupId,
      tournamentId: targetMatch.tournamentId,
      stage: { type: targetMatch.stage.type },
    });

    if (affectedIds.size > 0) {
      const affectedDetails = await prisma.match.findMany({
        where: { id: { in: Array.from(affectedIds) } },
        select: {
          id: true,
          status: true,
          round: true,
          matchNumber: true,
          groupId: true,
          stage: { select: { type: true } },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      });
      return {
        needsConfirmation: true,
        affectedMatches: affectedDetails.map((m) => ({
          id: m.id,
          status: m.status,
          round: m.round,
          matchNumber: m.matchNumber,
          stageType: m.stage.type,
          groupId: m.groupId,
          homeTeamName: m.homeTeam?.name ?? null,
          awayTeamName: m.awayTeam?.name ?? null,
          willReset: m.status === "COMPLETED" || m.status === "ON_COURT",
        })),
      };
    }
  }

  const correctedBy = isOwner ? `owner:${session!.user!.id}` : "staff";

  let cascadedCount = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Re-read target inside tx so we snapshot a consistent original state.
        const fresh = await tx.match.findUnique({
          where: { id: matchId },
          select: {
            id: true,
            status: true,
            winnerTeamId: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            scoreDetails: true,
            nextMatchId: true,
            nextMatchSlot: true,
            tournamentId: true,
            groupId: true,
            stage: { select: { type: true } },
          },
        });
        if (!fresh || fresh.status !== "COMPLETED") {
          throw new Error("MATCH_STATE_CHANGED");
        }
        if (
          newResult.winnerTeamId !== fresh.homeTeamId &&
          newResult.winnerTeamId !== fresh.awayTeamId
        ) {
          throw new Error("INVALID_WINNER");
        }

        const { affectedIds, affectedGroupIds } = await collectAffectedMatches(
          tx,
          {
            id: fresh.id,
            nextMatchId: fresh.nextMatchId,
            groupId: fresh.groupId,
            tournamentId: fresh.tournamentId,
            stage: { type: fresh.stage.type },
          }
        );
        cascadedCount = affectedIds.size;

        for (const affId of affectedIds) {
          await resetMatchInTx(tx, affId, affectedGroupIds);
        }

        await tx.match.update({
          where: { id: matchId },
          data: {
            winnerTeam: { connect: { id: newResult.winnerTeamId } },
            homeScore: newResult.homeScore,
            awayScore: newResult.awayScore,
            scoreDetails: newResult.scoreDetails ?? null,
            completedAt: new Date(),
          },
        });

        if (fresh.stage.type === "MAIN" && fresh.nextMatchId) {
          await tx.match.update({
            where: { id: fresh.nextMatchId },
            data:
              fresh.nextMatchSlot === 0
                ? { homeTeam: { connect: { id: newResult.winnerTeamId } } }
                : { awayTeam: { connect: { id: newResult.winnerTeamId } } },
          });
        }

        await tx.matchResultCorrection.create({
          data: {
            tournamentId,
            matchId,
            originalWinnerTeamId: fresh.winnerTeamId,
            originalHomeScore: fresh.homeScore,
            originalAwayScore: fresh.awayScore,
            originalScoreDetails: fresh.scoreDetails,
            newWinnerTeamId: newResult.winnerTeamId,
            newHomeScore: newResult.homeScore,
            newAwayScore: newResult.awayScore,
            newScoreDetails: newResult.scoreDetails ?? null,
            cascadedMatchIds: Array.from(affectedIds),
            reason: reason.trim(),
            correctedBy,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "MATCH_STATE_CHANGED") {
      return { error: "Match state changed. Please refresh and retry." };
    }
    if (msg === "INVALID_WINNER") {
      return { error: "Invalid winner" };
    }
    if (isSerializationError(e)) {
      return { error: "Another operation is in progress. Please try again." };
    }
    throw e;
  }

  // Group standings may have shifted — re-resolve placeholders (idempotent).
  if (targetMatch.stage.type === "QUALIFYING") {
    await resolveGroupPlaceholders(tournamentId);
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/staff/tournaments/${tournamentId}`);
  return { success: true, cascadedMatchCount: cascadedCount };
}
