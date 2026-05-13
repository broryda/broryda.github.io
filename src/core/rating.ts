export function normalizeGrade(raw?: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/\+/g, '').toUpperCase();
  const k = normalized.match(/(1[0-5]|[1-9])\s*K/);
  if (k) {
    return `${Number.parseInt(k[1], 10)}K`;
  }
  const d = normalized.match(/([1-7])\s*D/);
  if (d) {
    return `${Number.parseInt(d[1], 10)}D`;
  }
  return null;
}

// 15K=100 ... 1K=1500, 1D=1600 ... 7D=2200
export function gradeToProblemRating(grade: string | null): number | null {
  if (!grade) return null;
  const g = grade.toUpperCase();
  const kMatch = g.match(/^(1[0-5]|[1-9])K$/);
  if (kMatch) {
    const k = Number.parseInt(kMatch[1], 10);
    return (16 - k) * 100;
  }
  const dMatch = g.match(/^([1-7])D$/);
  if (dMatch) {
    const d = Number.parseInt(dMatch[1], 10);
    return 1500 + d * 100;
  }
  return null;
}

export function expectedScore(playerRating: number, problemRating: number): number {
  return 1 / (1 + 10 ** ((problemRating - playerRating) / 400));
}

export function roundRatingToHundreds(value: number): number {
  return Math.round(value / 100) * 100;
}

// Display band:
// 100 -> 15급 ... 1500 -> 1급, 1600 -> 1단 ... 2200 -> 7단
export function ratingToDisplayBand(value: number): {rounded: number; label: string} {
  const roundedRaw = roundRatingToHundreds(value);
  const rounded = Math.max(100, Math.min(2200, roundedRaw));

  if (rounded >= 1600) {
    const dan = Math.max(1, Math.min(7, rounded / 100 - 15));
    return {rounded, label: `${dan}단`};
  }

  const kyu = Math.max(1, Math.min(15, 16 - rounded / 100));
  return {rounded, label: `${kyu}급`};
}

export function shouldExcludeFromRatingMode(problemPath: string): boolean {
  const normalized = problemPath.replace(/\\/g, '/');
  if (!normalized.includes('/기경중묘/파고들고 찌르고 끊고 축/')) {
    return false;
  }
  const base = normalized.split('/').pop() ?? normalized;
  const numberMatches = base.match(/\d+/g);
  if (!numberMatches || numberMatches.length === 0) {
    return false;
  }
  const num = Number.parseInt(numberMatches[numberMatches.length - 1], 10);
  return Number.isFinite(num) && num >= 39 && num <= 46;
}
