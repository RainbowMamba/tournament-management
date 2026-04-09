"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Court } from "@prisma/client";

export type CourtWithUsage = Court & {
  _count: {
    tournaments: number;
    matches: number;
  };
  tournaments: Array<{
    tournament: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  // Current activity on this venue (list of active matches per court number)
  activeMatches: Array<{
    id: string;
    status: string;
    courtNumber: number | null;
    tournament: {
      id: string;
      name: string;
    };
    homeTeam: { name: string } | null;
    awayTeam: { name: string } | null;
  }>;
  // Occupied court numbers within this venue
  occupiedCourtNumbers: number[];
};

/**
 * Get all registered courts (venues) with usage information
 */
export async function getCourts(): Promise<CourtWithUsage[]> {
  const courts = await prisma.court.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          tournaments: true,
          matches: true,
        },
      },
      tournaments: {
        include: {
          tournament: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
      matches: {
        where: {
          status: { in: ["ON_COURT", "PENDING"] },
          courtId: { not: null },
        },
        orderBy: [{ status: "asc" }, { courtNumber: "asc" }], // ON_COURT first, then by court number
        include: {
          tournament: {
            select: {
              id: true,
              name: true,
            },
          },
          homeTeam: {
            select: { name: true },
          },
          awayTeam: {
            select: { name: true },
          },
        },
      },
    },
  });

  return courts.map((court) => ({
    ...court,
    activeMatches: court.matches.map((m) => ({
      id: m.id,
      status: m.status,
      courtNumber: m.courtNumber,
      tournament: m.tournament,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
    })),
    occupiedCourtNumbers: court.matches
      .filter((m) => m.courtNumber !== null)
      .map((m) => m.courtNumber as number),
    matches: undefined as never, // Remove the raw matches array
  }));
}

/**
 * Get a single court by ID
 */
export async function getCourt(id: string): Promise<Court | null> {
  return prisma.court.findUnique({
    where: { id },
  });
}

/**
 * Create a new court (venue)
 */
export async function createCourt(data: { name: string; location?: string; numCourts?: number }) {
  const { name, location, numCourts = 1 } = data;

  if (!name.trim()) {
    return { error: "Court name is required" };
  }

  if (numCourts < 1 || numCourts > 50) {
    return { error: "Number of courts must be between 1 and 50" };
  }

  // Check for duplicate name
  const existing = await prisma.court.findUnique({
    where: { name: name.trim() },
  });

  if (existing) {
    return { error: "A venue with this name already exists" };
  }

  try {
    const court = await prisma.court.create({
      data: {
        name: name.trim(),
        location: location?.trim() || null,
        numCourts,
      },
    });

    revalidatePath("/courts");
    return { success: true, court };
  } catch (error) {
    console.error("Failed to create court:", error);
    return { error: "Failed to create venue. Please try again." };
  }
}

/**
 * Update an existing court (venue)
 */
export async function updateCourt(
  id: string,
  data: { name?: string; location?: string; numCourts?: number }
) {
  const { name, location, numCourts } = data;

  const court = await prisma.court.findUnique({
    where: { id },
  });

  if (!court) {
    return { error: "Venue not found" };
  }

  // Check for duplicate name if name is being changed
  if (name && name.trim() !== court.name) {
    const existing = await prisma.court.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return { error: "A venue with this name already exists" };
    }
  }

  // Validate numCourts
  if (numCourts !== undefined && (numCourts < 1 || numCourts > 50)) {
    return { error: "Number of courts must be between 1 and 50" };
  }

  try {
    const updated = await prisma.court.update({
      where: { id },
      data: {
        name: name?.trim() || court.name,
        location: location !== undefined ? (location?.trim() || null) : court.location,
        numCourts: numCourts !== undefined ? numCourts : court.numCourts,
      },
    });

    revalidatePath("/courts");
    return { success: true, court: updated };
  } catch (error) {
    console.error("Failed to update court:", error);
    return { error: "Failed to update venue. Please try again." };
  }
}

/**
 * Delete a court (venue) - only if not in use by any tournament
 */
export async function deleteCourt(id: string) {
  const court = await prisma.court.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          tournaments: true,
          matches: true,
        },
      },
    },
  });

  if (!court) {
    return { error: "Venue not found" };
  }

  // Check if court is in use
  if (court._count.tournaments > 0) {
    return { error: "Cannot delete venue that is assigned to tournaments" };
  }

  if (court._count.matches > 0) {
    return { error: "Cannot delete venue that has match history" };
  }

  try {
    await prisma.court.delete({
      where: { id },
    });

    revalidatePath("/courts");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete court:", error);
    return { error: "Failed to delete venue. Please try again." };
  }
}

/**
 * Get courts (venues) available for selection in tournament creation
 * Returns all venues with their current usage status
 */
export async function getAvailableCourts() {
  const courts = await prisma.court.findMany({
    orderBy: { name: "asc" },
    include: {
      matches: {
        where: {
          status: { in: ["ON_COURT", "PENDING"] },
          courtId: { not: null },
        },
        select: {
          courtNumber: true,
          status: true,
          tournament: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return courts.map((court) => {
    const occupiedNumbers = court.matches
      .filter((m) => m.courtNumber !== null)
      .map((m) => m.courtNumber as number);
    
    const availableCount = court.numCourts - occupiedNumbers.length;
    
    return {
      id: court.id,
      name: court.name,
      location: court.location,
      numCourts: court.numCourts,
      occupiedCount: occupiedNumbers.length,
      availableCount,
      isFullyOccupied: availableCount === 0,
      occupiedBy: court.matches.length > 0 
        ? [...new Set(court.matches.map((m) => m.tournament.name))]
        : [],
    };
  });
}

/**
 * Get courts assigned to a specific tournament
 */
export async function getTournamentCourts(tournamentId: string) {
  const tournamentCourts = await prisma.tournamentCourt.findMany({
    where: { tournamentId },
    include: {
      court: true,
    },
    orderBy: {
      court: { name: "asc" },
    },
  });

  return tournamentCourts.map((tc) => tc.court);
}

/**
 * Check if a specific court number within a venue is occupied
 */
export async function isCourtNumberOccupied(
  courtId: string,
  courtNumber: number
): Promise<{
  occupied: boolean;
  match?: {
    id: string;
    status: string;
    tournamentId: string;
    tournamentName: string;
  };
}> {
  const activeMatch = await prisma.match.findFirst({
    where: {
      courtId,
      courtNumber,
      status: { in: ["ON_COURT", "PENDING"] },
    },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (activeMatch) {
    return {
      occupied: true,
      match: {
        id: activeMatch.id,
        status: activeMatch.status,
        tournamentId: activeMatch.tournament.id,
        tournamentName: activeMatch.tournament.name,
      },
    };
  }

  return { occupied: false };
}

/**
 * Get available court numbers within a venue (for assignment)
 */
export async function getAvailableCourtNumbers(courtId: string): Promise<number[]> {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      matches: {
        where: {
          status: { in: ["ON_COURT", "PENDING"] },
        },
        select: { courtNumber: true },
      },
    },
  });

  if (!court) return [];

  const occupiedNumbers = new Set(
    court.matches
      .filter((m) => m.courtNumber !== null)
      .map((m) => m.courtNumber as number)
  );

  const available: number[] = [];
  for (let i = 1; i <= court.numCourts; i++) {
    if (!occupiedNumbers.has(i)) {
      available.push(i);
    }
  }

  return available;
}

export type CourtMatch = {
  id: string;
  status: string;
  courtNumber: number | null;
  tournament: { id: string; name: string };
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
};

/**
 * Get all matches on a venue (for cross-tournament court view)
 */
export async function getCourtMatches(courtId: string): Promise<CourtMatch[]> {
  const matches = await prisma.match.findMany({
    where: {
      courtId,
      status: { in: ["ON_COURT", "PENDING"] },
    },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
        },
      },
      homeTeam: {
        select: { id: true, name: true },
      },
      awayTeam: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ courtNumber: "asc" }, { status: "asc" }, { createdAt: "asc" }],
  });

  return matches.map((m) => ({
    id: m.id,
    status: m.status,
    courtNumber: m.courtNumber,
    tournament: m.tournament,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
  }));
}

/**
 * Get court usage summary for a venue
 */
export async function getCourtUsageSummary(courtId: string) {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      matches: {
        where: {
          status: { in: ["ON_COURT", "PENDING"] },
        },
        include: {
          tournament: {
            select: { id: true, name: true },
          },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  if (!court) return null;

  // Build a map of court number to match info
  const courtStatus: Array<{
    courtNumber: number;
    status: "available" | "scheduled" | "playing";
    match?: {
      id: string;
      tournamentName: string;
      homeTeam: string;
      awayTeam: string;
    };
  }> = [];

  for (let i = 1; i <= court.numCourts; i++) {
    const match = court.matches.find((m) => m.courtNumber === i);
    if (match) {
      courtStatus.push({
        courtNumber: i,
        status: match.status === "ON_COURT" ? "playing" : "scheduled",
        match: {
          id: match.id,
          tournamentName: match.tournament.name,
          homeTeam: match.homeTeam?.name || "TBD",
          awayTeam: match.awayTeam?.name || "TBD",
        },
      });
    } else {
      courtStatus.push({
        courtNumber: i,
        status: "available",
      });
    }
  }

  return {
    id: court.id,
    name: court.name,
    location: court.location,
    numCourts: court.numCourts,
    courts: courtStatus,
    availableCount: courtStatus.filter((c) => c.status === "available").length,
    playingCount: courtStatus.filter((c) => c.status === "playing").length,
    scheduledCount: courtStatus.filter((c) => c.status === "scheduled").length,
  };
}
