"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Tournament, TournamentStatus } from "@prisma/client";

/**
 * Fisher-Yates shuffle algorithm for randomizing array order
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export type TournamentListItem = Tournament & {
  _count: {
    teams: number;
    matches: number;
    tournamentCourts: number;
  };
};

export type CreateTournamentInput = {
  name: string;
  location?: string;
  startDate?: string;
  courtIds: string[]; // Array of court IDs to assign to this tournament
  hasQualifying: boolean;
  numGroups?: number;
  groupDistribution?: number[]; // Array of team counts per group (e.g., [3, 3, 2, 2])
  teamsAdvancing?: number;
  tiebreakerPriority?: "HEAD_TO_HEAD" | "GAMES_WON"; // Tiebreaker priority for qualifying
  totalTeams?: number;
  teams: string[];
};

export async function createTournament(input: CreateTournamentInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  // Verify the user exists in the database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!user) {
    return { error: "User account not found. Please sign out and sign in again." };
  }

  const {
    name,
    location,
    startDate,
    courtIds,
    hasQualifying,
    numGroups,
    groupDistribution,
    teamsAdvancing,
    tiebreakerPriority,
    totalTeams,
    teams,
  } = input;

  // Validation
  if (!name.trim()) {
    return { error: "Tournament name is required" };
  }

  if (!courtIds || courtIds.length < 1) {
    return { error: "At least one court is required" };
  }

  // Validate that all courts exist
  const existingCourts = await prisma.court.findMany({
    where: { id: { in: courtIds } },
    select: { id: true },
  });

  if (existingCourts.length !== courtIds.length) {
    return { error: "One or more selected courts do not exist" };
  }

  // Validate date if provided
  let parsedStartDate: Date | null = null;
  if (startDate) {
    parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime())) {
      return { error: "Invalid start date" };
    }
    // Check for reasonable date range (1900-2100)
    const year = parsedStartDate.getFullYear();
    if (year < 1900 || year > 2100) {
      return { error: "Start date must be between year 1900 and 2100" };
    }
  }

  if (hasQualifying) {
    if (!numGroups || numGroups < 1) {
      return { error: "Number of groups is required for qualifying" };
    }
    if (!groupDistribution || groupDistribution.length !== numGroups) {
      return { error: "Group distribution is required for qualifying" };
    }
    const minTeamsInGroup = Math.min(...groupDistribution);
    if (minTeamsInGroup < 2) {
      return { error: "At least 2 teams per group are required" };
    }
    if (!teamsAdvancing || teamsAdvancing < 1) {
      return { error: "At least 1 team must advance from each group" };
    }
    if (teamsAdvancing > minTeamsInGroup) {
      return { error: "Teams advancing cannot exceed the smallest group size" };
    }
    const expectedTeams = groupDistribution.reduce((a, b) => a + b, 0);
    if (teams.length !== expectedTeams) {
      return { error: `Expected ${expectedTeams} teams, got ${teams.length}` };
    }
  } else {
    if (!totalTeams || totalTeams < 2) {
      return { error: "At least 2 teams are required" };
    }
    if (teams.length !== totalTeams) {
      return { error: `Expected ${totalTeams} teams, got ${teams.length}` };
    }
  }

  // Wrap all database operations in a transaction
  let tournamentId: string;

  try {
    tournamentId = await prisma.$transaction(async (tx) => {
      // Create tournament
      const tournament = await tx.tournament.create({
        data: {
          name,
          location: location || null,
          startDate: parsedStartDate,
          hasQualifying,
          tiebreakerPriority: hasQualifying ? (tiebreakerPriority || "HEAD_TO_HEAD") : "HEAD_TO_HEAD",
          status: "DRAFT",
          ownerId: session.user.id,
        },
      });

      // Create TournamentCourt entries (assign courts to tournament)
      await tx.tournamentCourt.createMany({
        data: courtIds.map((courtId) => ({
          tournamentId: tournament.id,
          courtId,
        })),
      });

      if (hasQualifying) {
        // Calculate max teams per group for reference
        const maxTeamsPerGroup = Math.max(...groupDistribution!);

        // Create qualifying stage
        const qualifyingStage = await tx.stage.create({
          data: {
            type: "QUALIFYING",
            numGroups: numGroups!,
            teamsPerGroup: maxTeamsPerGroup, // Store max for reference
            teamsAdvancing: teamsAdvancing!,
            tournamentId: tournament.id,
          },
        });

        // Randomly shuffle teams before assigning to groups
        const shuffledTeams = shuffleArray(teams);

        // Create groups and assign teams with uneven distribution
        const groupNames = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        let teamIndex = 0;

        for (let g = 0; g < numGroups!; g++) {
          const teamsInThisGroup = groupDistribution![g];

          const group = await tx.group.create({
            data: {
              name: groupNames[g],
              index: g,
              stageId: qualifyingStage.id,
            },
          });

          // Create teams for this group (may have different counts)
          for (let t = 0; t < teamsInThisGroup; t++) {
            await tx.team.create({
              data: {
                name: shuffledTeams[teamIndex],
                tournamentId: tournament.id,
                groupId: group.id,
                seed: t + 1,
              },
            });
            teamIndex++;
          }
        }

        // Create main stage (empty, will be populated after qualifying)
        await tx.stage.create({
          data: {
            type: "MAIN",
            tournamentId: tournament.id,
          },
        });
      } else {
        // Create main stage directly
        await tx.stage.create({
          data: {
            type: "MAIN",
            totalTeams: totalTeams!,
            tournamentId: tournament.id,
          },
        });

        // Create teams
        for (let i = 0; i < teams.length; i++) {
          await tx.team.create({
            data: {
              name: teams[i],
              tournamentId: tournament.id,
              seed: i + 1,
            },
          });
        }
      }

      return tournament.id;
    });
  } catch (error) {
    console.error("Failed to create tournament:", error);
    return { error: "Failed to create tournament. Please try again." };
  }

  revalidatePath("/tournaments");
  redirect(`/tournaments/${tournamentId}`);
}

export async function getTournaments(): Promise<TournamentListItem[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  return prisma.tournament.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          teams: true,
          matches: true,
          tournamentCourts: true,
        },
      },
    },
  });
}

export async function getTournament(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const tournament = await prisma.tournament.findFirst({
    where: {
      id,
      ownerId: session.user.id,
    },
    include: {
      tournamentCourts: {
        include: {
          court: true,
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      stages: {
        include: {
          groups: {
            include: {
              teams: { orderBy: { seed: "asc" } },
            },
            orderBy: { index: "asc" },
          },
        },
      },
      teams: { orderBy: { seed: "asc" } },
      matches: {
        include: {
          homeTeam: true,
          awayTeam: true,
          winnerTeam: true,
          court: true,
          homePlaceholderGroup: true,
          awayPlaceholderGroup: true,
        },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      },
    },
  });

  if (!tournament) return null;

  // Transform to include courts array for backward compatibility
  return {
    ...tournament,
    courts: tournament.tournamentCourts.map((tc) => tc.court),
  };
}

export async function deleteTournament(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id, ownerId: session.user.id },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  await prisma.tournament.delete({ where: { id } });
  revalidatePath("/tournaments");
  return { success: true };
}

export async function updateTournamentStatus(
  id: string,
  status: "DRAFT" | "ACTIVE" | "COMPLETED"
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id, ownerId: session.user.id },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  await prisma.tournament.update({
    where: { id },
    data: { status },
  });

  revalidatePath(`/tournaments/${id}`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Public (Guest) Actions - No Authentication Required
// ─────────────────────────────────────────────────────────────

export type PublicTournamentListItem = {
  id: string;
  name: string;
  location: string | null;
  startDate: Date | null;
  status: TournamentStatus;
  hasQualifying: boolean;
  _count: {
    teams: number;
    matches: number;
    tournamentCourts: number;
  };
  courts: Array<{ id: string; name: string }>;
};

/**
 * Get all public tournaments (ACTIVE and COMPLETED only)
 * No authentication required - for guest viewing
 */
export async function getPublicTournaments(search?: string): Promise<PublicTournamentListItem[]> {
  const whereClause: {
    status: { in: TournamentStatus[] };
    OR?: Array<{
      name?: { contains: string; mode: "insensitive" };
      tournamentCourts?: { some: { court: { name: { contains: string; mode: "insensitive" } } } };
    }>;
  } = {
    status: { in: ["ACTIVE", "COMPLETED"] },
  };

  // Add search filter if provided
  if (search && search.trim()) {
    whereClause.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { tournamentCourts: { some: { court: { name: { contains: search.trim(), mode: "insensitive" } } } } },
    ];
  }

  const tournaments = await prisma.tournament.findMany({
    where: whereClause,
    orderBy: [
      { status: "asc" }, // ACTIVE first, then COMPLETED
      { startDate: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      status: true,
      hasQualifying: true,
      tournamentCourts: {
        select: {
          court: {
            select: { id: true, name: true },
          },
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      _count: {
        select: {
          teams: true,
          matches: true,
          tournamentCourts: true,
        },
      },
    },
  });

  // Transform to include courts array
  return tournaments.map((t) => ({
    ...t,
    courts: t.tournamentCourts.map((tc) => tc.court),
  }));
}

/**
 * Get a single tournament for public viewing
 * No authentication required - for guest viewing
 * Only returns ACTIVE and COMPLETED tournaments
 */
export async function getPublicTournament(id: string) {
  const tournament = await prisma.tournament.findFirst({
    where: {
      id,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    include: {
      tournamentCourts: {
        include: {
          court: true,
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      stages: {
        include: {
          groups: {
            include: {
              teams: { orderBy: { seed: "asc" } },
            },
            orderBy: { index: "asc" },
          },
        },
      },
      teams: { orderBy: { seed: "asc" } },
      matches: {
        include: {
          homeTeam: true,
          awayTeam: true,
          winnerTeam: true,
          court: true,
          homePlaceholderGroup: true,
          awayPlaceholderGroup: true,
        },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      },
    },
  });

  if (!tournament) return null;

  // Transform to include courts array for backward compatibility
  return {
    ...tournament,
    courts: tournament.tournamentCourts.map((tc) => tc.court),
  };
}

// ─────────────────────────────────────────────────────────────
// Staff Access Actions
// ─────────────────────────────────────────────────────────────

/**
 * Generate a secure random code for staff access
 */
function generateSecureCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing characters (0, O, I, 1)
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate or regenerate staff code for a tournament
 */
export async function generateStaffCode(tournamentId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, ownerId: session.user.id },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  const code = generateSecureCode();

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { staffCode: code },
  });

  revalidatePath(`/tournaments/${tournamentId}`);
  return { success: true, code };
}

/**
 * Verify staff code for a tournament
 */
export async function verifyStaffCode(tournamentId: string, code: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId },
    select: { id: true, staffCode: true },
  });

  if (!tournament) {
    return { error: "Tournament not found" };
  }

  if (!tournament.staffCode) {
    return { error: "No staff code set for this tournament" };
  }

  if (tournament.staffCode !== code.trim().toUpperCase()) {
    return { error: "Invalid verification code" };
  }

  return { success: true };
}

/**
 * Get all tournaments for staff view (ACTIVE and COMPLETED only)
 */
export async function getStaffTournaments(search?: string): Promise<PublicTournamentListItem[]> {
  const whereClause: {
    status: { in: TournamentStatus[] };
    OR?: Array<{
      name?: { contains: string; mode: "insensitive" };
      tournamentCourts?: { some: { court: { name: { contains: string; mode: "insensitive" } } } };
    }>;
  } = {
    status: { in: ["ACTIVE", "COMPLETED"] },
  };

  // Add search filter if provided
  if (search && search.trim()) {
    whereClause.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { tournamentCourts: { some: { court: { name: { contains: search.trim(), mode: "insensitive" } } } } },
    ];
  }

  const tournaments = await prisma.tournament.findMany({
    where: whereClause,
    orderBy: [
      { status: "asc" }, // ACTIVE first, then COMPLETED
      { startDate: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      status: true,
      hasQualifying: true,
      tournamentCourts: {
        select: {
          court: {
            select: { id: true, name: true },
          },
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      _count: {
        select: {
          teams: true,
          matches: true,
          tournamentCourts: true,
        },
      },
    },
  });

  // Transform to include courts array
  return tournaments.map((t) => ({
    ...t,
    courts: t.tournamentCourts.map((tc) => tc.court),
  }));
}

/**
 * Get a single tournament for staff view
 * Only returns if code was verified (check session)
 */
export async function getStaffTournament(id: string) {
  const { isTournamentVerified } = await import("@/lib/staff-session");
  
  // Check if tournament is verified in session
  const isVerified = await isTournamentVerified(id);
  if (!isVerified) {
    return null;
  }

  const tournament = await prisma.tournament.findFirst({
    where: {
      id,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    include: {
      tournamentCourts: {
        include: {
          court: true,
        },
        orderBy: {
          court: { name: "asc" },
        },
      },
      stages: {
        include: {
          groups: {
            include: {
              teams: { orderBy: { seed: "asc" } },
            },
            orderBy: { index: "asc" },
          },
        },
      },
      teams: { orderBy: { seed: "asc" } },
      matches: {
        include: {
          homeTeam: true,
          awayTeam: true,
          winnerTeam: true,
          court: true,
          homePlaceholderGroup: true,
          awayPlaceholderGroup: true,
        },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      },
    },
  });

  if (!tournament) return null;

  // Transform to include courts array for backward compatibility
  return {
    ...tournament,
    courts: tournament.tournamentCourts.map((tc) => tc.court),
  };
}
