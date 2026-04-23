import RNFS from 'react-native-fs';

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
  marathonBest: Record<string, MarathonRecord>;
};

const KEY = 'stats_v2';
const STATS_FILE = `${RNFS.DocumentDirectoryPath}/${KEY}.json`;

const defaultData: StatsData = {
  problems: {},
  favorites: [],
  lastSolvedPath: null,
  lastPlayedPath: null,
  marathonBest: {},
};

export async function loadStats(): Promise<StatsData> {
  const exists = await RNFS.exists(STATS_FILE);
  if (!exists) return {...defaultData};
  const raw = await RNFS.readFile(STATS_FILE, 'utf8');
  if (!raw) return {...defaultData};
  try {
    const parsed = JSON.parse(raw) as StatsData;
    return {
      problems: parsed.problems ?? {},
      favorites: parsed.favorites ?? [],
      lastSolvedPath: parsed.lastSolvedPath ?? null,
      lastPlayedPath: parsed.lastPlayedPath ?? null,
      marathonBest: parsed.marathonBest ?? {},
    };
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
  await saveStats(data);
  return data;
}

export async function markLastPlayed(problemPath: string): Promise<StatsData> {
  const data = await loadStats();
  data.lastPlayedPath = problemPath;
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
    await saveStats(data);
    return {data, updated: true};
  }
  return {data, updated: false};
}
