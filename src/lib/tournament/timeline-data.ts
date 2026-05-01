import { buildMainMatchLabels } from "./labels";

type StageLike = {
  id: string;
  type: "QUALIFYING" | "MAIN";
  groups: Array<{ id: string; name: string }>;
};

type MatchLike = {
  id: string;
  round: number;
  matchNumber: number;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  stageId: string;
  groupId: string | null;
  scheduledAt: Date | null;
  scheduledCourtId: string | null;
  scheduledCourtNumber: number | null;
  nextMatchId: string | null;
  nextMatchSlot: number | null;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  homePlaceholderRank: number | null;
  homePlaceholderGroup: { id: string; name: string } | null;
  awayPlaceholderRank: number | null;
  awayPlaceholderGroup: { id: string; name: string } | null;
};

export type TimelineScheduledMatch = {
  id: string;
  scheduledAt: string;
  courtId: string;
  courtNumber: number;
  status: "PENDING" | "ON_COURT" | "COMPLETED";
  stageType: "QUALIFYING" | "MAIN";
  round: number;
  matchNumber: number;
  mainLabel: string | null;
  qualifyingGroupName: string | null;
  qualifyingIndexInGroup: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homePlaceholder: { groupName: string; rank: number } | null;
  awayPlaceholder: { groupName: string; rank: number } | null;
  homeWinnerOfLabel: string | null;
  awayWinnerOfLabel: string | null;
};

export function buildScheduledMatchesForTimeline(
  stages: StageLike[],
  matches: MatchLike[],
): TimelineScheduledMatch[] {
  const stageById = new Map(stages.map((s) => [s.id, s.type]));

  const mainMatches = matches.filter((m) => stageById.get(m.stageId) === "MAIN");
  const mainLabels = buildMainMatchLabels(mainMatches);

  const groupNameById = new Map<string, string>();
  for (const stage of stages) {
    for (const group of stage.groups) {
      groupNameById.set(group.id, group.name);
    }
  }

  const indexInGroupById = new Map<string, number>();
  const matchesByGroup = new Map<string, MatchLike[]>();
  for (const m of matches) {
    if (!m.groupId) continue;
    const arr = matchesByGroup.get(m.groupId) ?? [];
    arr.push(m);
    matchesByGroup.set(m.groupId, arr);
  }
  for (const [, ms] of matchesByGroup) {
    const sorted = ms.slice().sort((a, b) => a.matchNumber - b.matchNumber);
    sorted.forEach((m, idx) => indexInGroupById.set(m.id, idx + 1));
  }

  const feederByTarget = new Map<string, { home?: string; away?: string }>();
  for (const m of matches) {
    if (!m.nextMatchId || m.nextMatchSlot === null) continue;
    const entry = feederByTarget.get(m.nextMatchId) ?? {};
    if (m.nextMatchSlot === 0) entry.home = m.id;
    else entry.away = m.id;
    feederByTarget.set(m.nextMatchId, entry);
  }

  return matches
    .filter((m) => m.scheduledAt && m.scheduledCourtId && m.scheduledCourtNumber !== null)
    .map((m) => {
      const feeders = feederByTarget.get(m.id);
      return {
        id: m.id,
        scheduledAt: m.scheduledAt!.toISOString(),
        courtId: m.scheduledCourtId!,
        courtNumber: m.scheduledCourtNumber!,
        status: m.status,
        stageType: stageById.get(m.stageId) ?? "MAIN",
        round: m.round,
        matchNumber: m.matchNumber,
        mainLabel: mainLabels.get(m.id) ?? null,
        qualifyingGroupName: m.groupId ? groupNameById.get(m.groupId) ?? null : null,
        qualifyingIndexInGroup: indexInGroupById.get(m.id) ?? null,
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
        homePlaceholder:
          m.homePlaceholderGroup && m.homePlaceholderRank
            ? { groupName: m.homePlaceholderGroup.name, rank: m.homePlaceholderRank }
            : null,
        awayPlaceholder:
          m.awayPlaceholderGroup && m.awayPlaceholderRank
            ? { groupName: m.awayPlaceholderGroup.name, rank: m.awayPlaceholderRank }
            : null,
        homeWinnerOfLabel: feeders?.home ? mainLabels.get(feeders.home) ?? null : null,
        awayWinnerOfLabel: feeders?.away ? mainLabels.get(feeders.away) ?? null : null,
      };
    });
}
