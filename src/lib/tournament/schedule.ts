// Initial court schedule generator.
//
// Dense greedy packing: each match goes into the earliest time slot that
// (a) has a free court, (b) has none of the match's teams already playing,
// and (c) respects the match's stage-level earliest-start constraint.
//
// Constraints:
//  - Qualifying: free order; no inter-match dependencies; team-conflict only.
//  - Main draw: each match's earliest slot is the max end-slot of its feeders
//    (the matches whose winners advance into it). Round 1 has no feeders.
//  - Main draw starts no earlier than `mainStartTime` (or qualifying end if
//    chained).
//
// Qualifying options (soft preferences; never increase makespan vs greedy):
//  - timeStrategy: shapes input ordering. "consecutive" packs each group's
//    matches together; "distributed" round-robin interleaves groups so a
//    group's matches fall on widely-spaced slots when groups > courts.
//  - courtStrategy: "group-stick" assigns each group a preferred court
//    (round-robin if groups > courts). When picking a court within a slot,
//    that preferred court is tried first; otherwise we fall back to any free
//    court so we never leave a court idle.

export type QualifyingCourtStrategy = "any" | "group-stick";
export type QualifyingTimeStrategy = "any" | "consecutive" | "distributed";

export type QualifyingOptions = {
  courtStrategy: QualifyingCourtStrategy;
  timeStrategy: QualifyingTimeStrategy;
};

export type ScheduleInputMatch = {
  id: string;
  stageType: "QUALIFYING" | "MAIN";
  round: number;
  matchNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  // Qualifying group id (null for main draw). Used by qualifying options.
  groupId: string | null;
  // Group display name; used to pick a stable group order (A, B, C, ...).
  groupName: string | null;
  // For main draw bracket dependency: id of the match this one feeds into.
  // Reverse-mapped to find feeders.
  nextMatchId: string | null;
};

export type CourtSlot = {
  courtId: string;
  courtNumber: number;
};

export type ScheduleAssignment = {
  matchId: string;
  courtId: string;
  courtNumber: number;
  scheduledAt: Date;
};

export type ScheduleInput = {
  matches: ScheduleInputMatch[];
  courts: CourtSlot[];
  qualifyingStartTime: Date | null;
  qualifyingDurationMin: number;
  qualifyingOptions?: QualifyingOptions;
  // If null, main starts immediately after qualifying ends.
  // If a Date, main starts at that time (must be >= qualifying end).
  mainStartTime: Date | null;
  mainDurationMin: number;
};

export type ScheduleResult = {
  assignments: ScheduleAssignment[];
  qualifyingEndTime: Date | null;
  mainEndTime: Date | null;
};

type SlotState = {
  usedCourtIndices: Set<number>;
  busyTeams: Set<string>;
};

function pickCourtIndex(
  state: SlotState,
  courtsLen: number,
  preferred: number | null,
): number | null {
  if (preferred !== null && !state.usedCourtIndices.has(preferred)) {
    return preferred;
  }
  for (let i = 0; i < courtsLen; i++) {
    if (!state.usedCourtIndices.has(i)) return i;
  }
  return null;
}

function orderQualifyingMatches(
  matches: ScheduleInputMatch[],
  strategy: QualifyingTimeStrategy,
): ScheduleInputMatch[] {
  const byRoundNum = (a: ScheduleInputMatch, b: ScheduleInputMatch) =>
    a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber;

  if (strategy === "any") {
    return [...matches].sort(byRoundNum);
  }

  // Bucket by group; matches without a group share a synthetic bucket.
  const buckets = new Map<string, ScheduleInputMatch[]>();
  for (const m of matches) {
    const key = m.groupId ?? "__no_group__";
    const arr = buckets.get(key);
    if (arr) arr.push(m);
    else buckets.set(key, [m]);
  }
  for (const arr of buckets.values()) arr.sort(byRoundNum);

  // Stable group order by group name; null/missing names sort last.
  const groupKeys = Array.from(buckets.keys()).sort((a, b) => {
    const an = buckets.get(a)![0].groupName;
    const bn = buckets.get(b)![0].groupName;
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return an.localeCompare(bn);
  });

  if (strategy === "consecutive") {
    return groupKeys.flatMap((k) => buckets.get(k)!);
  }

  // distributed: round-robin interleave by group.
  const arrays = groupKeys.map((k) => buckets.get(k)!);
  const longest = arrays.reduce((m, a) => (a.length > m ? a.length : m), 0);
  const out: ScheduleInputMatch[] = [];
  for (let i = 0; i < longest; i++) {
    for (const arr of arrays) {
      if (i < arr.length) out.push(arr[i]);
    }
  }
  return out;
}

function buildGroupCourtMap(
  matches: ScheduleInputMatch[],
  courtsLen: number,
): Map<string, number> {
  // Group keys ordered by group name; map round-robin onto court indices.
  const seen = new Map<string, string | null>(); // groupId -> groupName
  for (const m of matches) {
    if (m.groupId !== null && !seen.has(m.groupId)) {
      seen.set(m.groupId, m.groupName);
    }
  }
  const ordered = Array.from(seen.entries()).sort(([, an], [, bn]) => {
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return an.localeCompare(bn);
  });
  const map = new Map<string, number>();
  ordered.forEach(([gid], i) => {
    map.set(gid, i % courtsLen);
  });
  return map;
}

function packMatches(
  matches: ScheduleInputMatch[],
  courts: CourtSlot[],
  startTime: Date,
  durationMin: number,
  earliestSlotByMatchId: Map<string, number>,
  preferredCourtByMatchId?: Map<string, number>,
): { assignments: ScheduleAssignment[]; matchEndSlot: Map<string, number>; lastUsedSlot: number } {
  const slots: SlotState[] = [];
  const ensureSlot = (n: number) => {
    while (slots.length <= n) slots.push({ usedCourtIndices: new Set(), busyTeams: new Set() });
  };

  const assignments: ScheduleAssignment[] = [];
  const matchEndSlot = new Map<string, number>();
  const durationMs = durationMin * 60_000;
  let lastUsedSlot = -1;

  for (const match of matches) {
    const earliest = earliestSlotByMatchId.get(match.id) ?? 0;
    const preferred = preferredCourtByMatchId?.get(match.id) ?? null;
    let slot = earliest;

    // Walk forward until we find a slot with a free court and no team conflict.
    while (true) {
      ensureSlot(slot);
      const state = slots[slot];
      const homeBusy = match.homeTeamId !== null && state.busyTeams.has(match.homeTeamId);
      const awayBusy = match.awayTeamId !== null && state.busyTeams.has(match.awayTeamId);

      if (!homeBusy && !awayBusy) {
        const courtIdx = pickCourtIndex(state, courts.length, preferred);
        if (courtIdx !== null) {
          const court = courts[courtIdx];
          state.usedCourtIndices.add(courtIdx);
          if (match.homeTeamId) state.busyTeams.add(match.homeTeamId);
          if (match.awayTeamId) state.busyTeams.add(match.awayTeamId);

          assignments.push({
            matchId: match.id,
            courtId: court.courtId,
            courtNumber: court.courtNumber,
            scheduledAt: new Date(startTime.getTime() + slot * durationMs),
          });
          matchEndSlot.set(match.id, slot + 1);
          if (slot > lastUsedSlot) lastUsedSlot = slot;
          break;
        }
      }
      slot++;
    }
  }

  return { assignments, matchEndSlot, lastUsedSlot };
}

export function generateInitialSchedule(input: ScheduleInput): ScheduleResult {
  if (input.courts.length === 0) {
    return { assignments: [], qualifyingEndTime: null, mainEndTime: null };
  }

  const qualifyingRaw = input.matches.filter((m) => m.stageType === "QUALIFYING");
  const main = input.matches
    .filter((m) => m.stageType === "MAIN")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber));

  // ── Qualifying ──────────────────────────────────────────────
  let qualifyingResult: { assignments: ScheduleAssignment[]; endTime: Date } | null = null;
  if (qualifyingRaw.length > 0 && input.qualifyingStartTime) {
    const opts = input.qualifyingOptions ?? { courtStrategy: "any", timeStrategy: "any" };
    const qualifying = orderQualifyingMatches(qualifyingRaw, opts.timeStrategy);

    let preferredByMatch: Map<string, number> | undefined;
    if (opts.courtStrategy === "group-stick") {
      const groupCourt = buildGroupCourtMap(qualifying, input.courts.length);
      preferredByMatch = new Map();
      for (const m of qualifying) {
        if (m.groupId !== null) {
          const idx = groupCourt.get(m.groupId);
          if (idx !== undefined) preferredByMatch.set(m.id, idx);
        }
      }
    }

    // No bracket dependency; every qualifying match can start at slot 0.
    const earliest = new Map<string, number>(qualifying.map((m) => [m.id, 0]));
    const result = packMatches(
      qualifying,
      input.courts,
      input.qualifyingStartTime,
      input.qualifyingDurationMin,
      earliest,
      preferredByMatch,
    );
    const endTime = new Date(
      input.qualifyingStartTime.getTime() +
        (result.lastUsedSlot + 1) * input.qualifyingDurationMin * 60_000,
    );
    qualifyingResult = { assignments: result.assignments, endTime };
  }

  // ── Main draw ───────────────────────────────────────────────
  let mainResult: { assignments: ScheduleAssignment[]; endTime: Date } | null = null;
  if (main.length > 0) {
    const requestedMainStart =
      input.mainStartTime ??
      qualifyingResult?.endTime ??
      input.qualifyingStartTime ??
      new Date();

    // Never let main overlap with the tail of qualifying on the same courts.
    const effectiveStart =
      qualifyingResult && requestedMainStart.getTime() < qualifyingResult.endTime.getTime()
        ? qualifyingResult.endTime
        : requestedMainStart;

    // Build feeder reverse-map: for each match, which matches feed into it?
    const feedersByMatchId = new Map<string, string[]>();
    for (const m of main) {
      if (m.nextMatchId) {
        const arr = feedersByMatchId.get(m.nextMatchId) ?? [];
        arr.push(m.id);
        feedersByMatchId.set(m.nextMatchId, arr);
      }
    }

    // Compute earliest slot for each main match in round order.
    // Round-1 matches start at slot 0; later rounds start at max(feeder end slots).
    const earliest = new Map<string, number>();
    const matchEndSlot = new Map<string, number>(); // populated as we pack

    // We can't precompute all earliest slots upfront because they depend on
    // packing results. Instead, pack one match at a time in (round, matchNumber)
    // order, computing earliest from already-packed feeders.
    const slots: SlotState[] = [];
    const ensureSlot = (n: number) => {
      while (slots.length <= n) slots.push({ usedCourtIndices: new Set(), busyTeams: new Set() });
    };
    const mainAssignments: ScheduleAssignment[] = [];
    const durationMs = input.mainDurationMin * 60_000;
    let lastUsedSlot = -1;

    for (const match of main) {
      const feeders = feedersByMatchId.get(match.id) ?? [];
      const feederEarliest = feeders.reduce((max, fid) => {
        const end = matchEndSlot.get(fid) ?? 0;
        return end > max ? end : max;
      }, 0);
      earliest.set(match.id, feederEarliest);

      let slot = feederEarliest;
      while (true) {
        ensureSlot(slot);
        const state = slots[slot];
        const homeBusy = match.homeTeamId !== null && state.busyTeams.has(match.homeTeamId);
        const awayBusy = match.awayTeamId !== null && state.busyTeams.has(match.awayTeamId);

        if (!homeBusy && !awayBusy) {
          const courtIdx = pickCourtIndex(state, input.courts.length, null);
          if (courtIdx !== null) {
            const court = input.courts[courtIdx];
            state.usedCourtIndices.add(courtIdx);
            if (match.homeTeamId) state.busyTeams.add(match.homeTeamId);
            if (match.awayTeamId) state.busyTeams.add(match.awayTeamId);

            mainAssignments.push({
              matchId: match.id,
              courtId: court.courtId,
              courtNumber: court.courtNumber,
              scheduledAt: new Date(effectiveStart.getTime() + slot * durationMs),
            });
            matchEndSlot.set(match.id, slot + 1);
            if (slot > lastUsedSlot) lastUsedSlot = slot;
            break;
          }
        }
        slot++;
      }
    }

    const endTime = new Date(effectiveStart.getTime() + (lastUsedSlot + 1) * durationMs);
    mainResult = { assignments: mainAssignments, endTime };
  }

  return {
    assignments: [
      ...(qualifyingResult?.assignments ?? []),
      ...(mainResult?.assignments ?? []),
    ],
    qualifyingEndTime: qualifyingResult?.endTime ?? null,
    mainEndTime: mainResult?.endTime ?? null,
  };
}
