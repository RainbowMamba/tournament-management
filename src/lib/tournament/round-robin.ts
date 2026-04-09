export type TiebreakerPriority = "HEAD_TO_HEAD" | "GAMES_WON";

export type MatchResult = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type TeamStanding = {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
};

/**
 * Calculate standings for a group of teams based on match results
 * Applies tiebreaker rules according to the specified priority
 */
export function calculateGroupStandings(
  teamIds: string[],
  matches: MatchResult[],
  tiebreakerPriority: TiebreakerPriority = "HEAD_TO_HEAD"
): TeamStanding[] {
  // Calculate basic stats for each team
  const standings: TeamStanding[] = teamIds.map((teamId) => {
    const teamMatches = matches.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
    );
    
    let wins = 0;
    let losses = 0;
    let gamesWon = 0;
    let gamesLost = 0;
    let played = 0;

    for (const match of teamMatches) {
      if (match.status !== "COMPLETED") continue;
      played++;

      if (match.winnerTeamId === teamId) {
        wins++;
      } else {
        losses++;
      }

      // Calculate games from scores
      if (match.homeTeamId === teamId) {
        gamesWon += match.homeScore ?? 0;
        gamesLost += match.awayScore ?? 0;
      } else {
        gamesWon += match.awayScore ?? 0;
        gamesLost += match.homeScore ?? 0;
      }
    }

    return {
      teamId,
      played,
      wins,
      losses,
      gamesWon,
      gamesLost,
      gameDiff: gamesWon - gamesLost,
    };
  });

  // Sort by wins first
  standings.sort((a, b) => b.wins - a.wins);

  // Apply tiebreaker for teams with same wins
  const result: TeamStanding[] = [];
  let i = 0;

  while (i < standings.length) {
    // Find all teams with the same number of wins
    const currentWins = standings[i].wins;
    const tiedTeams: TeamStanding[] = [];
    
    while (i < standings.length && standings[i].wins === currentWins) {
      tiedTeams.push(standings[i]);
      i++;
    }

    if (tiedTeams.length === 1) {
      // No tie, just add the team
      result.push(tiedTeams[0]);
    } else {
      // Apply tiebreaker
      const sortedTiedTeams = applyTiebreaker(tiedTeams, matches, tiebreakerPriority);
      result.push(...sortedTiedTeams);
    }
  }

  return result;
}

/**
 * Apply tiebreaker rules to teams with the same number of wins
 */
function applyTiebreaker(
  teams: TeamStanding[],
  matches: MatchResult[],
  priority: TiebreakerPriority
): TeamStanding[] {
  const teamIds = teams.map((t) => t.teamId);

  if (priority === "HEAD_TO_HEAD") {
    // First try head-to-head, then games won
    return sortByHeadToHead(teams, matches, teamIds) 
      ?? sortByGamesWon(teams);
  } else {
    // First try games won, then head-to-head
    const byGames = sortByGameDiff(teams);
    if (byGames) return byGames;
    return sortByHeadToHead(teams, matches, teamIds) ?? teams;
  }
}

/**
 * Sort teams by head-to-head record among tied teams
 * Returns null if still tied after H2H comparison
 */
function sortByHeadToHead(
  teams: TeamStanding[],
  matches: MatchResult[],
  tiedTeamIds: string[]
): TeamStanding[] | null {
  // Calculate H2H wins among tied teams only
  const h2hWins = new Map<string, number>();
  
  for (const teamId of tiedTeamIds) {
    h2hWins.set(teamId, 0);
  }

  // Find matches between tied teams
  const h2hMatches = matches.filter(
    (m) =>
      m.status === "COMPLETED" &&
      m.homeTeamId &&
      m.awayTeamId &&
      tiedTeamIds.includes(m.homeTeamId) &&
      tiedTeamIds.includes(m.awayTeamId)
  );

  for (const match of h2hMatches) {
    if (match.winnerTeamId && tiedTeamIds.includes(match.winnerTeamId)) {
      h2hWins.set(match.winnerTeamId, (h2hWins.get(match.winnerTeamId) ?? 0) + 1);
    }
  }

  // Sort by H2H wins
  const sorted = [...teams].sort((a, b) => {
    const aH2H = h2hWins.get(a.teamId) ?? 0;
    const bH2H = h2hWins.get(b.teamId) ?? 0;
    if (bH2H !== aH2H) return bH2H - aH2H;
    // If still tied on H2H, fall through to games
    return b.gameDiff - a.gameDiff;
  });

  return sorted;
}

/**
 * Sort teams by games won (actually game differential first, then total games won)
 */
function sortByGamesWon(teams: TeamStanding[]): TeamStanding[] {
  return [...teams].sort((a, b) => {
    // First by game differential
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    // Then by total games won
    return b.gamesWon - a.gamesWon;
  });
}

/**
 * Sort teams by game differential
 * Returns null if all teams have the same differential
 */
function sortByGameDiff(teams: TeamStanding[]): TeamStanding[] | null {
  const sorted = [...teams].sort((a, b) => {
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    return b.gamesWon - a.gamesWon;
  });

  // Check if all teams still have the same differential
  const allSame = sorted.every((t) => t.gameDiff === sorted[0].gameDiff);
  if (allSame) return null;

  return sorted;
}

/**
 * Generate round-robin matches for a group of teams
 * Uses the circle method (rotating partners) to ensure every team plays every other team
 */
export function generateRoundRobinMatches(
  teamIds: string[]
): Array<{ homeTeamId: string; awayTeamId: string; round: number; matchNumber: number }> {
  const matches: Array<{
    homeTeamId: string;
    awayTeamId: string;
    round: number;
    matchNumber: number;
  }> = [];

  const n = teamIds.length;
  
  // Need even number of teams; if odd, add a "bye" placeholder
  const teams = [...teamIds];
  const hasBye = n % 2 !== 0;
  if (hasBye) {
    teams.push("BYE");
  }

  const numTeams = teams.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  let matchNumber = 0;

  for (let round = 0; round < numRounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = (round + match) % (numTeams - 1);
      let away = (numTeams - 1 - match + round) % (numTeams - 1);

      // Last team stays in place
      if (match === 0) {
        away = numTeams - 1;
      }

      const homeTeam = teams[home];
      const awayTeam = teams[away];

      // Skip matches involving the bye
      if (homeTeam !== "BYE" && awayTeam !== "BYE") {
        matchNumber++;
        matches.push({
          homeTeamId: homeTeam,
          awayTeamId: awayTeam,
          round: round + 1,
          matchNumber,
        });
      }
    }
  }

  return matches;
}

