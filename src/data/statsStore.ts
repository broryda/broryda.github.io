import RNFS from 'react-native-fs';
import {expectedScore} from '../core/rating';
import {ALL_BADGES, evaluateUnlockedBadgeIds} from '../core/badges';

export type ProblemStat = {
  attempts: number;
  correct: number;
  wrong: number;
  totalSec: number;
  lastResult?: 'correct' | 'wrong';
};

export type MarathonRecord = {
  collectionDir: string;
  correct: number;
  total: number;
  accuracy: number;
  elapsedSec: number;
  updatedAt: string;
};

export type StatsData = {
  problems: Record<string, ProblemStat>;
  favorites: string[];
  lastSolvedPath: string | null;
  lastPlayedPath: string | null;
  lastPlayedByDir: Record<string, string>;
  marathonBest: Record<string, MarathonRecord>;
  eloRating: number;
  streakCurrent: number;
  streakBest: number;
  lastJudgedDate: string | null;
  badgesUnlocked: string[];
  ratingPlacementDone: boolean;
  ratingPending: {
    problemPath: string;
    startedAtIso: string;
    problemRating: number | null;
  } | null;
  ratingRecent: Array<{
    problemPath: string;
    result: 'correct' | 'wrong';
    playedAt: string;
  }>;
  levelChallenge: {
    unlockedMaxIndex: number;
    attempts: Record<string, number>;
    successes: Record<string, number>;
  };
};

const KEY = 'stats_v2';
const STATS_FILE = `${RNFS.DocumentDirectoryPath}/${KEY}.json`;

const defaultData: StatsData = {
  problems: {},
  favorites: [],
  lastSolvedPath: null,
  lastPlayedPath: null,
  lastPlayedByDir: {},
  marathonBest: {},
  eloRating: 300,
  streakCurrent: 0,
  streakBest: 0,
  lastJudgedDate: null,
  badgesUnlocked: [],
  ratingPlacementDone: false,
  ratingPending: null,
  ratingRecent: [],
  levelChallenge: {
    unlockedMaxIndex: 0,
    attempts: {},
    successes: {},
  },
};

function mergeUnlockedBadges(existing: string[], data: StatsData): string[] {
  const merged = new Set<string>(existing);
  for (const id of evaluateUnlockedBadgeIds(data)) {
    merged.add(id);
  }
  return [...merged];
}

function reconcileUnlockedBadges(existing: string[], data: StatsData): string[] {
  const unlockedNow = new Set(evaluateUnlockedBadgeIds(data));
  const collectionBadgeIds = new Set(
    ALL_BADGES.filter(b => b.category === 'collection').map(b => b.id),
  );
  const merged = new Set<string>();
  // Keep non-collection badges permanently once earned.
  for (const id of existing) {
    if (!collectionBadgeIds.has(id)) merged.add(id);
  }
  // Collection badges are always recalculated from current condition.
  for (const id of unlockedNow) {
    if (collectionBadgeIds.has(id)) merged.add(id);
  }
  // Keep newly unlocked non-collection badges too.
  for (const id of unlockedNow) {
    if (!collectionBadgeIds.has(id)) merged.add(id);
  }
  return [...merged];
}

function toLocalDateString(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  const aa = new Date(`${a}T00:00:00`).getTime();
  const bb = new Date(`${b}T00:00:00`).getTime();
  return Math.round((bb - aa) / 86400000);
}

function parentDir(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

export async function loadStats(): Promise<StatsData> {
  const exists = await RNFS.exists(STATS_FILE);
  if (!exists) return {...defaultData};
  const raw = await RNFS.readFile(STATS_FILE, 'utf8');
  if (!raw) return {...defaultData};
  try {
    const parsed = JSON.parse(raw) as StatsData;
    const hydrated: StatsData = {
      problems: parsed.problems ?? {},
      favorites: parsed.favorites ?? [],
      lastSolvedPath: parsed.lastSolvedPath ?? null,
      lastPlayedPath: parsed.lastPlayedPath ?? null,
      lastPlayedByDir:
        parsed.lastPlayedByDir && typeof parsed.lastPlayedByDir === 'object'
          ? (parsed.lastPlayedByDir as Record<string, string>)
          : {},
      marathonBest: parsed.marathonBest ?? {},
      eloRating:
        typeof parsed.eloRating === 'number' && Number.isFinite(parsed.eloRating)
          ? parsed.eloRating
          : defaultData.eloRating,
      streakCurrent:
        typeof parsed.streakCurrent === 'number' && Number.isFinite(parsed.streakCurrent)
          ? parsed.streakCurrent
          : defaultData.streakCurrent,
      streakBest:
        typeof parsed.streakBest === 'number' && Number.isFinite(parsed.streakBest)
          ? parsed.streakBest
          : defaultData.streakBest,
      lastJudgedDate: parsed.lastJudgedDate ?? null,
      badgesUnlocked: Array.isArray(parsed.badgesUnlocked) ? parsed.badgesUnlocked : [],
      ratingPlacementDone: !!parsed.ratingPlacementDone,
      ratingPending:
        parsed.ratingPending &&
        typeof parsed.ratingPending === 'object' &&
        typeof (parsed.ratingPending as Record<string, unknown>).problemPath === 'string'
          ? {
              problemPath: String(
                (parsed.ratingPending as Record<string, unknown>).problemPath ?? '',
              ),
              startedAtIso: String(
                (parsed.ratingPending as Record<string, unknown>).startedAtIso ?? '',
              ),
              problemRating:
                typeof (parsed.ratingPending as Record<string, unknown>).problemRating === 'number'
                && Number.isFinite(
                  (parsed.ratingPending as Record<string, unknown>).problemRating as number,
                )
                  ? ((parsed.ratingPending as Record<string, unknown>).problemRating as number)
                  : null,
            }
          : null,
      ratingRecent: Array.isArray(parsed.ratingRecent)
        ? parsed.ratingRecent
            .map(v => {
              if (!v || typeof v !== 'object') return null;
              const obj = v as Record<string, unknown>;
              const problemPath = typeof obj.problemPath === 'string' ? obj.problemPath : '';
              const result = obj.result === 'correct' ? 'correct' : obj.result === 'wrong' ? 'wrong' : null;
              const playedAt = typeof obj.playedAt === 'string' ? obj.playedAt : '';
              if (!problemPath || !result || !playedAt) return null;
              return {problemPath, result, playedAt};
            })
            .filter(
              (
                x,
              ): x is {problemPath: string; result: 'correct' | 'wrong'; playedAt: string} =>
                x !== null,
            )
            .slice(0, 10)
        : [],
      levelChallenge:
        parsed.levelChallenge && typeof parsed.levelChallenge === 'object'
          ? {
              unlockedMaxIndex:
                typeof (parsed.levelChallenge as Record<string, unknown>).unlockedMaxIndex ===
                  'number' &&
                Number.isFinite(
                  (parsed.levelChallenge as Record<string, unknown>).unlockedMaxIndex as number,
                )
                  ? Math.max(
                      0,
                      Math.floor(
                        (parsed.levelChallenge as Record<string, unknown>)
                          .unlockedMaxIndex as number,
                      ),
                    )
                  : 0,
              attempts:
                (parsed.levelChallenge as Record<string, unknown>).attempts &&
                typeof (parsed.levelChallenge as Record<string, unknown>).attempts === 'object'
                  ? ((parsed.levelChallenge as Record<string, unknown>)
                      .attempts as Record<string, number>)
                  : {},
              successes:
                (parsed.levelChallenge as Record<string, unknown>).successes &&
                typeof (parsed.levelChallenge as Record<string, unknown>).successes === 'object'
                  ? ((parsed.levelChallenge as Record<string, unknown>)
                      .successes as Record<string, number>)
                  : {},
            }
          : {
              unlockedMaxIndex: 0,
              attempts: {},
              successes: {},
            },
    };
    hydrated.badgesUnlocked = reconcileUnlockedBadges(hydrated.badgesUnlocked, hydrated);
    return hydrated;
  } catch {
    return {...defaultData};
  }
}

export async function saveStats(data: StatsData): Promise<void> {
  await RNFS.writeFile(STATS_FILE, JSON.stringify(data), 'utf8');
}

export async function recordResult(
  problemPath: string,
  correct: boolean,
  elapsedSec: number,
  problemRating?: number | null,
  ratingWeight = 1,
): Promise<StatsData> {
  const data = await loadStats();
  const cur = data.problems[problemPath] ?? {
    attempts: 0,
    correct: 0,
    wrong: 0,
    totalSec: 0,
  };
  cur.attempts += 1;
  cur.correct += correct ? 1 : 0;
  cur.wrong += correct ? 0 : 1;
  cur.totalSec += elapsedSec;
  cur.lastResult = correct ? 'correct' : 'wrong';
  data.problems[problemPath] = cur;
  if (correct) data.lastSolvedPath = problemPath;
  data.lastPlayedPath = problemPath;
  data.lastPlayedByDir[parentDir(problemPath)] = problemPath;

  const today = toLocalDateString();
  if (!data.lastJudgedDate) {
    data.streakCurrent = 1;
    data.streakBest = Math.max(data.streakBest, data.streakCurrent);
    data.lastJudgedDate = today;
  } else {
    const diff = dayDiff(data.lastJudgedDate, today);
    if (diff > 0) {
      if (diff === 1) {
        data.streakCurrent += 1;
      } else {
        data.streakCurrent = 1;
      }
      data.streakBest = Math.max(data.streakBest, data.streakCurrent);
      data.lastJudgedDate = today;
    }
  }

  if (typeof problemRating === 'number' && Number.isFinite(problemRating)) {
    const expected = expectedScore(data.eloRating, problemRating);
    const w = correct ? 1 : 0;
    const k = 20 * Math.max(1, ratingWeight);
    data.eloRating = Math.round(data.eloRating + k * (w - expected));
  }
  data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
  await saveStats(data);
  return data;
}

export async function startRatingPending(
  problemPath: string,
  problemRating?: number | null,
): Promise<StatsData> {
  const data = await loadStats();
  data.ratingPending = {
    problemPath,
    startedAtIso: new Date().toISOString(),
    problemRating:
      typeof problemRating === 'number' && Number.isFinite(problemRating) ? problemRating : null,
  };
  await saveStats(data);
  return data;
}

export async function clearRatingPending(): Promise<StatsData> {
  const data = await loadStats();
  if (data.ratingPending) {
    data.ratingPending = null;
    await saveStats(data);
  }
  return data;
}

export async function settlePendingRatingAttempt(): Promise<StatsData> {
  const data = await loadStats();
  const pending = data.ratingPending;
  if (!pending?.problemPath) return data;

  const cur = data.problems[pending.problemPath] ?? {
    attempts: 0,
    correct: 0,
    wrong: 0,
    totalSec: 0,
  };
  cur.attempts += 1;
  cur.wrong += 1;
  cur.totalSec += 60;
  cur.lastResult = 'wrong';
  data.problems[pending.problemPath] = cur;
  data.lastPlayedPath = pending.problemPath;
  data.lastPlayedByDir[parentDir(pending.problemPath)] = pending.problemPath;

  if (typeof pending.problemRating === 'number' && Number.isFinite(pending.problemRating)) {
    const expected = expectedScore(data.eloRating, pending.problemRating);
    data.eloRating = Math.round(data.eloRating + 20 * (0 - expected));
  }
  data.ratingPending = null;
  data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
  await saveStats(data);
  return data;
}

export async function markLastPlayed(problemPath: string): Promise<StatsData> {
  const data = await loadStats();
  data.lastPlayedPath = problemPath;
  data.lastPlayedByDir[parentDir(problemPath)] = problemPath;
  await saveStats(data);
  return data;
}

export async function toggleFavorite(problemPath: string): Promise<StatsData> {
  const data = await loadStats();
  const set = new Set(data.favorites);
  if (set.has(problemPath)) {
    set.delete(problemPath);
  } else {
    set.add(problemPath);
  }
  data.favorites = [...set].sort((a, b) => a.localeCompare(b));
  data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
  await saveStats(data);
  return data;
}

export async function saveMarathonRecord(
  collectionDir: string,
  correct: number,
  total: number,
  elapsedSec: number,
): Promise<{data: StatsData; updated: boolean}> {
  const data = await loadStats();
  const accuracy = total > 0 ? correct / total : 0;
  const prev = data.marathonBest[collectionDir];
  const shouldUpdate = !prev || accuracy > prev.accuracy;

  if (shouldUpdate) {
    data.marathonBest[collectionDir] = {
      collectionDir,
      correct,
      total,
      accuracy,
      elapsedSec,
      updatedAt: new Date().toISOString(),
    };
    data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
    await saveStats(data);
    return {data, updated: true};
  }
  data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
  return {data, updated: false};
}

export async function markRatingPlacementDone(): Promise<StatsData> {
  const data = await loadStats();
  if (!data.ratingPlacementDone) {
    data.ratingPlacementDone = true;
    data.badgesUnlocked = mergeUnlockedBadges(data.badgesUnlocked, data);
    await saveStats(data);
  }
  return data;
}

export async function appendRatingRecent(
  problemPath: string,
  result: 'correct' | 'wrong',
): Promise<StatsData> {
  const data = await loadStats();
  data.ratingRecent = [
    {problemPath, result, playedAt: new Date().toISOString()},
    ...(data.ratingRecent ?? []),
  ].slice(0, 10);
  await saveStats(data);
  return data;
}

export async function recordLevelChallengeResult(
  levelKey: string,
  levelIndex: number,
  success: boolean,
): Promise<StatsData> {
  const data = await loadStats();
  const currentAttempts = data.levelChallenge.attempts[levelKey] ?? 0;
  const currentSuccess = data.levelChallenge.successes[levelKey] ?? 0;
  data.levelChallenge.attempts[levelKey] = currentAttempts + 1;
  if (success) {
    data.levelChallenge.successes[levelKey] = currentSuccess + 1;
    if (levelIndex >= data.levelChallenge.unlockedMaxIndex) {
      data.levelChallenge.unlockedMaxIndex = levelIndex + 1;
    }
  }
  await saveStats(data);
  return data;
}
