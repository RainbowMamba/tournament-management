/**
 * Generate single-elimination bracket matches
 * Handles byes for non-power-of-2 team counts
 */
export function generateBracketMatches(
  teamIds: string[]
): Array<{
  homeTeamId: string | null;
  awayTeamId: string | null;
  round: number;
  matchNumber: number;
  nextMatchNumber: number | null;
  nextMatchSlot: number | null; // 0 = home, 1 = away
}> {
  const n = teamIds.length;
  
  if (n < 2) {
    return [];
  }

  // Find the next power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const numByes = bracketSize - n;
  const numRounds = Math.log2(bracketSize);

  // Seed teams (1-based seeding)
  const seededTeams = [...teamIds];
  
  // Create bracket positions
  // Standard bracket seeding: 1 vs 16, 8 vs 9, 5 vs 12, 4 vs 13, etc.
  const bracketPositions = generateBracketPositions(bracketSize);
  
  // Assign teams to positions, with nulls for byes
  const slots: (string | null)[] = new Array(bracketSize).fill(null);
  
  for (let i = 0; i < bracketSize; i++) {
    const seedIndex = bracketPositions[i] - 1;
    if (seedIndex < seededTeams.length) {
      slots[i] = seededTeams[seedIndex];
    }
  }

  const matches: Array<{
    homeTeamId: string | null;
    awayTeamId: string | null;
    round: number;
    matchNumber: number;
    nextMatchNumber: number | null;
    nextMatchSlot: number | null;
  }> = [];

  let globalMatchNumber = 0;
  let matchNumberByRound: number[][] = [];

  // Generate matches for each round
  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    matchNumberByRound[round] = [];

    for (let i = 0; i < matchesInRound; i++) {
      globalMatchNumber++;
      matchNumberByRound[round].push(globalMatchNumber);

      let homeTeamId: string | null = null;
      let awayTeamId: string | null = null;

      if (round === 1) {
        // First round: use seeded slots
        homeTeamId = slots[i * 2];
        awayTeamId = slots[i * 2 + 1];
      }
      // Later rounds: teams will be filled in as matches complete

      // Calculate next match
      let nextMatchNumber: number | null = null;
      let nextMatchSlot: number | null = null;

      if (round < numRounds) {
        const nextMatchIndex = Math.floor(i / 2);
        const nextRoundMatches = bracketSize / Math.pow(2, round + 1);
        
        // Next match number = total matches before next round + position in next round
        let totalBefore = 0;
        for (let r = 1; r <= round; r++) {
          totalBefore += bracketSize / Math.pow(2, r);
        }
        nextMatchNumber = totalBefore + nextMatchIndex + 1;
        nextMatchSlot = i % 2; // 0 for home, 1 for away
      }

      matches.push({
        homeTeamId,
        awayTeamId,
        round,
        matchNumber: globalMatchNumber,
        nextMatchNumber,
        nextMatchSlot,
      });
    }
  }

  return matches;
}

/**
 * Generate standard bracket positions for proper seeding
 * Ensures top seeds meet only in later rounds
 */
function generateBracketPositions(size: number): number[] {
  if (size === 2) {
    return [1, 2];
  }

  const halfSize = size / 2;
  const upperHalf = generateBracketPositions(halfSize);
  const lowerHalf = upperHalf.map((seed) => size + 1 - seed);

  const result: number[] = [];
  for (let i = 0; i < halfSize; i++) {
    result.push(upperHalf[i], lowerHalf[i]);
  }

  return result;
}

/**
 * Reorder placeholder slots so seeds align with rank (group winners take top
 * seeds and receive byes first) while keeping same-group players in opposite
 * halves of the bracket whenever possible.
 *
 * Returns slots in seed order (index 0 → seed 1, index 1 → seed 2, ...).
 */
export function separateGroupPlayers<T extends { groupId: string; rank: number; groupIndex: number }>(
  placeholderSlots: T[]
): T[] {
  if (placeholderSlots.length < 2) {
    return placeholderSlots;
  }

  const bracketSize = Math.pow(2, Math.ceil(Math.log2(placeholderSlots.length)));
  const halfSize = bracketSize / 2;
  const bracketPositions = generateBracketPositions(bracketSize);

  // Real seeds (1..n) split by which bracket half their position lives in.
  const upperSeeds: number[] = [];
  const lowerSeeds: number[] = [];
  for (let pos = 0; pos < bracketSize; pos++) {
    const seed = bracketPositions[pos];
    if (seed > placeholderSlots.length) continue;
    if (pos < halfSize) upperSeeds.push(seed);
    else lowerSeeds.push(seed);
  }
  upperSeeds.sort((a, b) => a - b);
  lowerSeeds.sort((a, b) => a - b);

  // Process teams in canonical seed order: rank ascending, then group index.
  const sortedTeams = [...placeholderSlots].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.groupIndex - b.groupIndex;
  });

  const seedToTeam: (T | undefined)[] = new Array(placeholderSlots.length + 1);
  const groupCounts = new Map<string, { upper: number; lower: number }>();
  let upperIdx = 0;
  let lowerIdx = 0;

  for (const team of sortedTeams) {
    const counts = groupCounts.get(team.groupId) ?? { upper: 0, lower: 0 };
    const upperFull = upperIdx >= upperSeeds.length;
    const lowerFull = lowerIdx >= lowerSeeds.length;

    let half: "upper" | "lower";
    if (upperFull) {
      half = "lower";
    } else if (lowerFull) {
      half = "upper";
    } else if (counts.upper < counts.lower) {
      // Prefer the half where this group has fewer teams (separation).
      half = "upper";
    } else if (counts.lower < counts.upper) {
      half = "lower";
    } else {
      // Tie: assign to the half whose next available seed is lower (better seed).
      half = upperSeeds[upperIdx] <= lowerSeeds[lowerIdx] ? "upper" : "lower";
    }

    if (half === "upper") {
      seedToTeam[upperSeeds[upperIdx]] = team;
      upperIdx++;
      counts.upper++;
    } else {
      seedToTeam[lowerSeeds[lowerIdx]] = team;
      lowerIdx++;
      counts.lower++;
    }
    groupCounts.set(team.groupId, counts);
  }

  const result: T[] = [];
  for (let seed = 1; seed <= placeholderSlots.length; seed++) {
    const team = seedToTeam[seed];
    if (team) result.push(team);
  }
  return result;
}

/**
 * Advance winner to the next match
 */
export function getAdvancementInfo(
  matchNumber: number,
  matches: Array<{
    matchNumber: number;
    nextMatchNumber: number | null;
    nextMatchSlot: number | null;
  }>
): { nextMatchNumber: number; slot: "home" | "away" } | null {
  const match = matches.find((m) => m.matchNumber === matchNumber);
  if (!match || !match.nextMatchNumber) {
    return null;
  }

  return {
    nextMatchNumber: match.nextMatchNumber,
    slot: match.nextMatchSlot === 0 ? "home" : "away",
  };
}

