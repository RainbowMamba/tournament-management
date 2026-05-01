// Round-position based labels for main draw bracket matches.
// "F" / "SF #1" / "QF #2" / "R16 #5", etc. — matches the convention used in
// the court view.

type MainMatchLike = { id: string; round: number; matchNumber: number };

function roundPrefix(round: number, maxRound: number): string {
  const fromFinal = maxRound - round;
  if (fromFinal === 0) return "F";
  if (fromFinal === 1) return "SF";
  if (fromFinal === 2) return "QF";
  if (fromFinal === 3) return "R16";
  if (fromFinal === 4) return "R32";
  if (fromFinal === 5) return "R64";
  return `R${round}`;
}

export function buildMainMatchLabels(matches: MainMatchLike[]): Map<string, string> {
  if (matches.length === 0) return new Map();

  let maxRound = 1;
  const byRound = new Map<number, MainMatchLike[]>();
  for (const m of matches) {
    if (m.round > maxRound) maxRound = m.round;
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }

  const labels = new Map<string, string>();
  for (const [round, ms] of byRound) {
    const prefix = roundPrefix(round, maxRound);
    const sorted = ms.slice().sort((a, b) => a.matchNumber - b.matchNumber);
    if (sorted.length === 1) {
      labels.set(sorted[0].id, prefix);
      continue;
    }
    sorted.forEach((m, idx) => {
      labels.set(m.id, `${prefix} #${idx + 1}`);
    });
  }
  return labels;
}
