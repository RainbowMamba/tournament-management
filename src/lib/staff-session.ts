"use server";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const STAFF_VERIFIED_COOKIE = "staff_verified_tournaments";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "STAFF_SESSION_SECRET or AUTH_SECRET must be set to sign staff session cookies"
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function encode(ids: string[]): string {
  const payload = JSON.stringify(ids);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

function decode(value: string): string[] {
  const dot = value.lastIndexOf(".");
  if (dot < 0) return [];
  const encodedPayload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return [];
  }
  if (!verify(payload, signature)) return [];
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string")
      ? (parsed as string[])
      : [];
  } catch {
    return [];
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE,
  path: "/",
};

/**
 * Get list of verified tournament IDs from session
 */
export async function getVerifiedTournaments(): Promise<string[]> {
  const cookieStore = await cookies();
  const verified = cookieStore.get(STAFF_VERIFIED_COOKIE);

  if (!verified?.value) {
    return [];
  }

  return decode(verified.value);
}

/**
 * Add a tournament ID to verified list
 */
export async function addVerifiedTournament(tournamentId: string): Promise<void> {
  const cookieStore = await cookies();
  const current = await getVerifiedTournaments();

  if (!current.includes(tournamentId)) {
    const updated = [...current, tournamentId];
    cookieStore.set(STAFF_VERIFIED_COOKIE, encode(updated), COOKIE_OPTS);
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
    cookieStore.set(STAFF_VERIFIED_COOKIE, encode(updated), COOKIE_OPTS);
  }
}
