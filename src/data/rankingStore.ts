import RNFS from 'react-native-fs';
import type {StatsData} from './statsStore';

const RANKING_FILE = `${RNFS.DocumentDirectoryPath}/ranking_v1.json`;
const RANKING_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const RANKING_URL = 'https://broryda.github.io/ranking/ranking.json';
const RANKING_CONFIG_URL = 'https://broryda.github.io/ranking/ranking_config.json';
const RANKING_SUBMIT_FALLBACK_URLS = ['https://broryda.github.io/ranking/submit'];
const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedSubmitUrls: string[] | null = null;
let cachedSubmitUrlsAt = 0;

export type RankingEntry = {
  nickname: string;
  solvedCount: number;
  elo: number;
  streakCurrent?: number;
  createdAt?: string;
  deviceId?: string;
  lastSubmittedAt?: string;
};

export type RankingPayload = {
  updatedAt: string;
  entries: RankingEntry[];
};

export type RankingCache = {
  lastSyncedAt: number;
  payload: RankingPayload;
};

const emptyPayload: RankingPayload = {
  updatedAt: '',
  entries: [],
};

const emptyCache: RankingCache = {
  lastSyncedAt: 0,
  payload: emptyPayload,
};

function normalizeEntries(input: unknown): RankingEntry[] {
  if (!Array.isArray(input)) return [];
  const rows = input
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const nickname = typeof obj.nickname === 'string' ? obj.nickname.trim() : '';
      const deviceId = typeof obj.deviceId === 'string' ? obj.deviceId.trim() : '';
      const solvedCount =
        typeof obj.solvedCount === 'number' && Number.isFinite(obj.solvedCount)
          ? Math.max(0, Math.floor(obj.solvedCount))
          : 0;
      const elo =
        typeof obj.elo === 'number' && Number.isFinite(obj.elo)
          ? Math.max(0, Math.floor(obj.elo))
          : 0;
      const streakCurrent =
        typeof obj.streakCurrent === 'number' && Number.isFinite(obj.streakCurrent)
          ? Math.max(0, Math.floor(obj.streakCurrent))
          : 0;
      const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt.trim() : '';
      const lastSubmittedAt =
        typeof obj.lastSubmittedAt === 'string' ? obj.lastSubmittedAt.trim() : '';
      if (!nickname) return null;
      return {
        nickname,
        solvedCount,
        elo,
        ...(streakCurrent > 0 ? {streakCurrent} : {}),
        ...(createdAt ? {createdAt} : {}),
        ...(deviceId ? {deviceId} : {}),
        ...(lastSubmittedAt ? {lastSubmittedAt} : {}),
      };
    })
    .filter((v): v is RankingEntry => v !== null);
  return dedupeByDevice(rows);
}

function dedupeByDevice(rows: RankingEntry[]): RankingEntry[] {
  const byDevice = new Map<string, RankingEntry>();
  const withoutDevice: RankingEntry[] = [];
  const ts = (row: RankingEntry): number => {
    if (!row.lastSubmittedAt) return 0;
    const t = Date.parse(row.lastSubmittedAt);
    return Number.isFinite(t) ? t : 0;
  };

  for (const row of rows) {
    const deviceId = row.deviceId?.trim();
    if (!deviceId) {
      withoutDevice.push(row);
      continue;
    }
    const prev = byDevice.get(deviceId);
    if (!prev) {
      byDevice.set(deviceId, row);
      continue;
    }
    const curTs = ts(row);
    const prevTs = ts(prev);
    const takeCurrent =
      curTs > prevTs ||
      (curTs === prevTs &&
        (row.solvedCount > prev.solvedCount ||
          (row.solvedCount === prev.solvedCount && row.elo > prev.elo)));
    if (takeCurrent) {
      if (prev.createdAt && !row.createdAt) {
        row.createdAt = prev.createdAt;
      }
      byDevice.set(deviceId, row);
    } else if (!prev.createdAt && row.createdAt) {
      byDevice.set(deviceId, {...prev, createdAt: row.createdAt});
    }
  }

  return [...byDevice.values(), ...withoutDevice];
}

function normalizePayload(input: unknown): RankingPayload {
  if (!input || typeof input !== 'object') return emptyPayload;
  const obj = input as Record<string, unknown>;
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : '';
  const entries = normalizeEntries(obj.entries);
  return {updatedAt, entries};
}

export function getRankingSyncIntervalMs(): number {
  return RANKING_SYNC_INTERVAL_MS;
}

export function computeSolvedCount(stats: StatsData): number {
  return Object.values(stats.problems).filter(p => p.correct + p.wrong > 0).length;
}

export async function loadRankingCache(): Promise<RankingCache> {
  try {
    const exists = await RNFS.exists(RANKING_FILE);
    if (!exists) return {...emptyCache};
    const raw = await RNFS.readFile(RANKING_FILE, 'utf8');
    if (!raw) return {...emptyCache};
    const parsed = JSON.parse(raw) as Partial<RankingCache>;
    return {
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'number' && Number.isFinite(parsed.lastSyncedAt)
          ? parsed.lastSyncedAt
          : 0,
      payload: normalizePayload(parsed.payload),
    };
  } catch {
    return {...emptyCache};
  }
}

async function saveRankingCache(next: RankingCache): Promise<void> {
  await RNFS.writeFile(RANKING_FILE, JSON.stringify(next), 'utf8');
}

export async function syncRankingFromNetwork(force = false): Promise<RankingCache> {
  const current = await loadRankingCache();
  const now = Date.now();
  if (!force && now - current.lastSyncedAt < RANKING_SYNC_INTERVAL_MS) {
    return current;
  }
  try {
    const response = await fetch(RANKING_URL, {
      method: 'GET',
      headers: {Accept: 'application/json'},
    });
    if (!response.ok) {
      return current;
    }
    const json = (await response.json()) as unknown;
    const payload = normalizePayload(json);
    const next: RankingCache = {
      lastSyncedAt: now,
      payload,
    };
    await saveRankingCache(next);
    return next;
  } catch {
    return current;
  }
}

export type RankingSubmitPayload = {
  deviceId: string;
  nickname: string;
  solvedCount: number;
  elo: number;
  streakCurrent: number;
};

async function resolveSubmitUrls(): Promise<string[]> {
  const now = Date.now();
  if (cachedSubmitUrls && now - cachedSubmitUrlsAt < CONFIG_CACHE_TTL_MS) {
    return cachedSubmitUrls;
  }

  let submitUrl = '';
  try {
    const response = await fetch(RANKING_CONFIG_URL, {
      method: 'GET',
      headers: {Accept: 'application/json'},
    });
    if (response.ok) {
      const json = (await response.json()) as {submitUrl?: unknown};
      if (typeof json.submitUrl === 'string') {
        submitUrl = json.submitUrl.trim();
      }
    }
  } catch {
    // ignore and fallback
  }

  const urls = [submitUrl, ...RANKING_SUBMIT_FALLBACK_URLS]
    .map(v => v.trim())
    .filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);
  cachedSubmitUrls = urls;
  cachedSubmitUrlsAt = now;
  return urls;
}

export async function submitRankingUpdate(payload: RankingSubmitPayload): Promise<boolean> {
  const body = JSON.stringify({
    deviceId: payload.deviceId,
    nickname: payload.nickname,
    solvedCount: Math.max(0, Math.floor(payload.solvedCount)),
    elo: Math.max(0, Math.floor(payload.elo)),
    streakCurrent: Math.max(0, Math.floor(payload.streakCurrent)),
    sentAt: new Date().toISOString(),
  });
  const urls = await resolveSubmitUrls();
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // try next url
    }
  }
  return false;
}
