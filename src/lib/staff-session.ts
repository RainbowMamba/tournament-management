"use server";

import { cookies } from "next/headers";

const STAFF_VERIFIED_COOKIE = "staff_verified_tournaments";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Get list of verified tournament IDs from session
 */
export async function getVerifiedTournaments(): Promise<string[]> {
  const cookieStore = await cookies();
  const verified = cookieStore.get(STAFF_VERIFIED_COOKIE);
  
  if (!verified?.value) {
    return [];
  }

  try {
    return JSON.parse(verified.value) as string[];
  } catch {
    return [];
  }
}

/**
 * Add a tournament ID to verified list
 */
export async function addVerifiedTournament(tournamentId: string): Promise<void> {
  const cookieStore = await cookies();
  const current = await getVerifiedTournaments();
  
  if (!current.includes(tournamentId)) {
    const updated = [...current, tournamentId];
    cookieStore.set(STAFF_VERIFIED_COOKIE, JSON.stringify(updated), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }
}

/**
 * Check if a tournament is verified
 */
export async function isTournamentVerified(tournamentId: string): Promise<boolean> {
  const verified = await getVerifiedTournaments();
  return verified.includes(tournamentId);
}

/**
 * Clear all verified tournaments (logout)
 */
export async function clearVerifiedTournaments(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_VERIFIED_COOKIE);
}

/**
 * Remove a specific tournament from verified list
 */
export async function removeVerifiedTournament(tournamentId: string): Promise<void> {
  const cookieStore = await cookies();
  const current = await getVerifiedTournaments();
  const updated = current.filter((id) => id !== tournamentId);
  
  if (updated.length === 0) {
    cookieStore.delete(STAFF_VERIFIED_COOKIE);
  } else {
    cookieStore.set(STAFF_VERIFIED_COOKIE, JSON.stringify(updated), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }
}

