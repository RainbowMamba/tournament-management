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

export type ScheduleInputMatch = {
  id: string;
  stageType: "QUALIFYING" | "MAIN";
  round: number;
  matchNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
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
  courtsUsed: number;
  busyTeams: Set<string>;
};

function packMatches(
  matches: ScheduleInputMatch[],
  courts: CourtSlot[],
  startTime: Date,
  durationMin: number,
  earliestSlotByMatchId: Map<string, number>,
): { assignments: ScheduleAssignment[]; matchEndSlot: Map<string, number>; lastUsedSlot: number } {
  const slots: SlotState[] = [];
  const ensureSlot = (n: number) => {
    while (slots.length <= n) slots.push({ courtsUsed: 0, busyTeams: new Set() });
  };

  const assignments: ScheduleAssignment[] = [];
  const matchEndSlot = new Map<string, number>();
  const durationMs = durationMin * 60_000;
  let lastUsedSlot = -1;

  for (const match of matches) {
    const earliest = earliestSlotByMatchId.get(match.id) ?? 0;
    let slot = earliest;

    // Walk forward until we find a slot with a free court and no team conflict.
    while (true) {
      ensureSlot(slot);
      const state = slots[slot];
      const homeBusy = match.homeTeamId !== null && state.busyTeams.has(match.homeTeamId);
      const awayBusy = match.awayTeamId !== null && state.busyTeams.has(match.awayTeamId);
      const courtFree = state.courtsUsed < courts.length;

      if (courtFree && !homeBusy && !awayBusy) {
        const court = courts[state.courtsUsed];
        state.courtsUsed++;
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
      slot++;
    }
  }

  return { assignments, matchEndSlot, lastUsedSlot };
}

export function generateInitialSchedule(input: ScheduleInput): ScheduleResult {
  if (input.courts.length === 0) {
    return { assignments: [], qualifyingEndTime: null, mainEndTime: null };
  }

  const qualifying = input.matches
    .filter((m) => m.stageType === "QUALIFYING")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber));
  const main = input.matches
    .filter((m) => m.stageType === "MAIN")
    .sort((a, b) => (a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber));

  // ── Qualifying ──────────────────────────────────────────────
  let qualifyingResult: { assignments: ScheduleAssignment[]; endTime: Date } | null = null;
  if (qualifying.length > 0 && input.qualifyingStartTime) {
    // No bracket dependency; every qualifying match can start at slot 0.
    const earliest = new Map<string, number>(qualifying.map((m) => [m.id, 0]));
    const result = packMatches(
      qualifying,
      input.courts,
      input.qualifyingStartTime,
      input.qualifyingDurationMin,
      earliest,
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
      while (slots.length <= n) slots.push({ courtsUsed: 0, busyTeams: new Set() });
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
        const courtFree = state.courtsUsed < input.courts.length;

        if (courtFree && !homeBusy && !awayBusy) {
          const court = input.courts[state.courtsUsed];
          state.courtsUsed++;
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
