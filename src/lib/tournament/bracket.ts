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
 * Reorder placeholder slots to separate players from the same group
 * into opposite halves of the bracket (so they only meet in the final)
 * 
 * Strategy:
 * 1. Group players by their groupId
 * 2. For each group, distribute players between upper and lower halves
 * 3. Reorder the final array so that when bracket positions are applied,
 *    players from the same group end up in opposite halves
 * 
 * @param placeholderSlots Array of placeholders with groupId, rank, and groupIndex
 * @returns Reordered array of placeholder slots
 */
export function separateGroupPlayers<T extends { groupId: string; rank: number; groupIndex: number }>(
  placeholderSlots: T[]
): T[] {
  if (placeholderSlots.length < 2) {
    return placeholderSlots;
  }

  // Find the bracket size (next power of 2)
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(placeholderSlots.length)));
  const halfSize = bracketSize / 2;

  // Group placeholders by groupId
  const byGroup = new Map<string, T[]>();
  for (const slot of placeholderSlots) {
    if (!byGroup.has(slot.groupId)) {
      byGroup.set(slot.groupId, []);
    }
    byGroup.get(slot.groupId)!.push(slot);
  }

  // Separate into upper and lower halves
  const upperHalf: T[] = [];
  const lowerHalf: T[] = [];

  // Process groups, distributing players across halves
  const groups = Array.from(byGroup.entries()).sort((a, b) => {
    // Sort by group index for consistency
    return a[1][0].groupIndex - b[1][0].groupIndex;
  });

  for (const [groupId, players] of groups) {
    // Sort players by rank (1st, 2nd, 3rd, etc.)
    const sortedPlayers = [...players].sort((a, b) => a.rank - b.rank);
    
    // Distribute players across halves, alternating to separate them
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      
      // Alternate: even indices (0, 2, 4...) go to upper, odd (1, 3, 5...) go to lower
      // This ensures 1st and 2nd from same group are in opposite halves
      if (i % 2 === 0) {
        upperHalf.push(player);
      } else {
        lowerHalf.push(player);
      }
    }
  }

  // Get bracket positions to understand the seeding structure
  const bracketPositions = generateBracketPositions(bracketSize);
  
  // The bracketPositions array maps: position index -> seed number
  // For example, for size 8: [1, 8, 4, 5, 2, 7, 3, 6]
  // This means: position 0 gets seed 1, position 1 gets seed 8, etc.
  // Positions 0-3 are upper half, positions 4-7 are lower half
  
  // We need to create a mapping: seed number -> which half it should be in
  // Then assign our separated players to seeds accordingly
  
  // Create arrays to track which seeds go to which half
  const upperSeeds: number[] = [];
  const lowerSeeds: number[] = [];
  
  for (let pos = 0; pos < bracketSize; pos++) {
    const seed = bracketPositions[pos];
    if (pos < halfSize) {
      upperSeeds.push(seed);
    } else {
      lowerSeeds.push(seed);
    }
  }
  
  // Sort seeds to process them in order
  upperSeeds.sort((a, b) => a - b);
  lowerSeeds.sort((a, b) => a - b);
  
  // Now assign our separated players to seeds
  // We'll create a result array where result[i] is the player for seed i+1
  const result: (T | null)[] = new Array(placeholderSlots.length).fill(null);
  
  let upperIdx = 0;
  let lowerIdx = 0;
  
  // Assign upper half players to upper half seeds
  for (const seed of upperSeeds) {
    if (seed <= placeholderSlots.length && upperIdx < upperHalf.length) {
      result[seed - 1] = upperHalf[upperIdx];
      upperIdx++;
    }
  }
  
  // Assign lower half players to lower half seeds
  for (const seed of lowerSeeds) {
    if (seed <= placeholderSlots.length && lowerIdx < lowerHalf.length) {
      result[seed - 1] = lowerHalf[lowerIdx];
      lowerIdx++;
    }
  }
  
  // If we have leftover players (e.g., when bracket size > actual players),
  // fill remaining slots alternating between halves
  let remainingUpper = upperHalf.slice(upperIdx);
  let remainingLower = lowerHalf.slice(lowerIdx);
  let remaining = [...remainingUpper, ...remainingLower];
  
  for (let i = 0; i < result.length && remaining.length > 0; i++) {
    if (result[i] === null) {
      result[i] = remaining.shift()!;
    }
  }
  
  // Return in seed order (1, 2, 3, ...)
  return result.filter((item): item is T => item !== null);
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

