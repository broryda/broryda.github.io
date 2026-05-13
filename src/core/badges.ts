import manifest from '../data/problemManifest.json';
import type {StatsData} from '../data/statsStore';

export type BadgeCategory = 'streak' | 'solve' | 'collection' | 'marathon';

export type BadgeDef = {
  id: string;
  category: BadgeCategory;
  name: string;
  description: string;
  icon: string;
  check: (stats: StatsData) => boolean;
};

type Snapshot = {
  solvedUnique: number;
  streakBest: number;
  marathonClears: number;
};

function snapshot(stats: StatsData): Snapshot {
  const values = Object.values(stats.problems);
  const solvedUnique = values.reduce((acc, p) => acc + (p.correct > 0 ? 1 : 0), 0);
  const marathonClears = Object.values(stats.marathonBest ?? {}).length;
  return {
    solvedUnique,
    streakBest: stats.streakBest ?? 0,
    marathonClears,
  };
}

function buildPrefixTotals(): Map<string, number> {
  const totals = new Map<string, number>();
  const files = (manifest.files ?? []) as Array<{rel?: string}>;
  for (const file of files) {
    const rel = typeof file.rel === 'string' ? file.rel : '';
    if (!rel) continue;
    const fullPath = `assets/problem/${rel}`;
    const parts = fullPath.split('/').filter(Boolean);
    for (let i = 2; i <= parts.length - 1; i += 1) {
      const prefix = parts.slice(0, i).join('/');
      totals.set(prefix, (totals.get(prefix) ?? 0) + 1);
    }
  }
  return totals;
}

const prefixTotals = buildPrefixTotals();

function solvedAllInPrefix(stats: StatsData, prefix: string): boolean {
  const total = prefixTotals.get(prefix) ?? 0;
  if (total <= 0) return false;
  const p = `${prefix}/`;
  let solved = 0;
  for (const [path, row] of Object.entries(stats.problems)) {
    if (path.startsWith(p) && row.correct > 0) solved += 1;
  }
  return solved >= total;
}

function byThreshold(
  id: string,
  category: BadgeCategory,
  name: string,
  description: string,
  icon: string,
  getter: (s: Snapshot) => number,
  target: number,
): BadgeDef {
  return {
    id,
    category,
    name,
    description,
    icon,
    check: stats => getter(snapshot(stats)) >= target,
  };
}

const streakBadges: BadgeDef[] = [
  byThreshold('streak_1', 'streak', '공부 시작', '연속학습 1일', 'S1', s => s.streakBest, 1),
  byThreshold('streak_5', 'streak', '작심일주', '연속학습 5일', 'S5', s => s.streakBest, 5),
  byThreshold('streak_10', 'streak', '연속학습 10일', '연속학습 10일', 'S10', s => s.streakBest, 10),
  byThreshold('streak_30', 'streak', '한달 연속 학습', '연속학습 30일', 'S30', s => s.streakBest, 30),
  byThreshold('streak_100', 'streak', '백일장', '연속학습 100일', 'S100', s => s.streakBest, 100),
  byThreshold('streak_200', 'streak', '200일 챌린지', '연속학습 200일', 'S200', s => s.streakBest, 200),
  byThreshold('streak_500', 'streak', '반천일', '연속학습 500일', 'S500', s => s.streakBest, 500),
  byThreshold('streak_1000', 'streak', '천일장', '연속학습 1000일', 'S1K', s => s.streakBest, 1000),
  byThreshold('streak_3650', 'streak', '강산도 변한다', '연속학습 3650일', 'S3K', s => s.streakBest, 3650),
];

const solvedBadges: BadgeDef[] = [
  byThreshold('solve_1', 'solve', '첫걸음', '문제 정답 누적 1개', 'P1', s => s.solvedUnique, 1),
  byThreshold('solve_10', 'solve', '해결사', '문제 정답 누적 10개', '10C', s => s.solvedUnique, 10),
  byThreshold('solve_50', 'solve', '견습생', '문제 정답 누적 50개', '50C', s => s.solvedUnique, 50),
  byThreshold('solve_100', 'solve', '숙련가', '문제 정답 누적 100개', '100C', s => s.solvedUnique, 100),
  byThreshold('solve_500', 'solve', '달인', '문제 정답 누적 500개', '500C', s => s.solvedUnique, 500),
  byThreshold('solve_1000', 'solve', '천개 돌파', '문제 정답 누적 1000개', '1K', s => s.solvedUnique, 1000),
  byThreshold('solve_5000', 'solve', '오천개 돌파', '문제 정답 누적 5000개', '5K', s => s.solvedUnique, 5000),
  byThreshold('solve_10000', 'solve', '만개 돌파', '문제 정답 누적 10000개', '10K', s => s.solvedUnique, 10000),
];

const collectionBadges: BadgeDef[] = [
  {
    id: 'collection_kg',
    category: 'collection',
    name: '기경중묘 마스터',
    description: '기경중묘 전체 문제를 1회 이상 정답',
    icon: 'KG',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘'),
  },
  {
    id: 'collection_live',
    category: 'collection',
    name: '사는수 마스터',
    description: '기경중묘/사는수 전체 문제를 1회 이상 정답',
    icon: 'LIFE',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/사는수'),
  },
  {
    id: 'collection_capture',
    category: 'collection',
    name: '잡는수 마스터',
    description: '기경중묘/잡는수 전체 문제를 1회 이상 정답',
    icon: 'CAP',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/잡는수'),
  },
  {
    id: 'collection_over',
    category: 'collection',
    name: '넘는수 마스터',
    description: '기경중묘/넘는 수 전체 문제를 1회 이상 정답',
    icon: 'OVR',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/넘는 수'),
  },
  {
    id: 'collection_press',
    category: 'collection',
    name: '몰아떨구기 마스터',
    description: '기경중묘/몰아떨구기 전체 문제를 1회 이상 정답',
    icon: 'ATK',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/몰아떨구기'),
  },
  {
    id: 'collection_fight',
    category: 'collection',
    name: '수상전 마스터',
    description: '기경중묘/수상전 전체 문제를 1회 이상 정답',
    icon: 'WAR',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/수상전'),
  },
  {
    id: 'collection_skill',
    category: 'collection',
    name: '축/끊기 마스터',
    description: '기경중묘/파고들고 찌르고 끊고 축 전체 문제를 1회 이상 정답',
    icon: 'SKL',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/파고들고 찌르고 끊고 축'),
  },
  {
    id: 'collection_ko',
    category: 'collection',
    name: '패내는수 마스터',
    description: '기경중묘/패 내는수 전체 문제를 1회 이상 정답',
    icon: 'KO',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기경중묘/패 내는수'),
  },
  {
    id: 'collection_800',
    category: 'collection',
    name: '기초사활맥 마스터',
    description: '기초사활맥 800제 전체 문제를 1회 이상 정답',
    icon: '800',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/기초사활맥 800제'),
  },
  {
    id: 'collection_w1',
    category: 'collection',
    name: '왕초보1 마스터',
    description: '왕초보1 전체 문제를 1회 이상 정답',
    icon: 'W1',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/왕초보1'),
  },
  {
    id: 'collection_w2',
    category: 'collection',
    name: '왕초보2 마스터',
    description: '왕초보2 전체 문제를 1회 이상 정답',
    icon: 'W2',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/왕초보2'),
  },
  {
    id: 'collection_sgds',
    category: 'collection',
    name: '수근대사전 마스터',
    description: '수근대사전 전체 문제를 1회 이상 정답',
    icon: 'SG',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/수근대사전'),
  },
  {
    id: 'collection_pungak',
    category: 'collection',
    name: '풍각 마스터',
    description: '풍각 전체 문제를 1회 이상 정답',
    icon: 'PG',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/풍각'),
  },
  {
    id: 'collection_hyunram',
    category: 'collection',
    name: '현람 마스터',
    description: '현람 전체 문제를 1회 이상 정답',
    icon: 'HR',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/현람'),
  },
  {
    id: 'collection_hyeonhyeon',
    category: 'collection',
    name: '현현기경 마스터',
    description: '현현기경 전체 문제를 1회 이상 정답',
    icon: 'HH',
    check: stats => solvedAllInPrefix(stats, 'assets/problem/현현기경'),
  },
];

const marathonBadges: BadgeDef[] = [
  byThreshold('marathon_1', 'marathon', '마라톤 시작', '마라톤 1회 기록', 'M1', s => s.marathonClears, 1),
  byThreshold('marathon_10', 'marathon', '마라톤 익숙함', '마라톤 10회 기록', 'M10', s => s.marathonClears, 10),
  byThreshold('marathon_100', 'marathon', '마라톤 숙련', '마라톤 100회 기록', 'M100', s => s.marathonClears, 100),
  byThreshold('marathon_1000', 'marathon', '마라톤 중독', '마라톤 1000회 기록', 'M1K', s => s.marathonClears, 1000),
];

export const ALL_BADGES: BadgeDef[] = [
  ...streakBadges,
  ...solvedBadges,
  ...collectionBadges,
  ...marathonBadges,
];

export function evaluateUnlockedBadgeIds(stats: StatsData): string[] {
  const unlocked = ALL_BADGES.filter(b => b.check(stats)).map(b => b.id);
  return unlocked.sort((a, b) => a.localeCompare(b));
}

export function getBadgeUnlockProgress(stats: StatsData): {
  unlocked: number;
  total: number;
} {
  const unlockedSet = new Set(stats.badgesUnlocked ?? []);
  return {unlocked: unlockedSet.size, total: ALL_BADGES.length};
}
