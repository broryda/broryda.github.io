import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import {formatProblemTitle} from '../core/problemTitle';
import {ratingToDisplayBand, roundRatingToHundreds, shouldExcludeFromRatingMode} from '../core/rating';
import type {StatsData} from '../data/statsStore';
import type {ProblemIndex} from '../models/problemIndex';
import {theme} from '../design/theme';
import {Card} from '../components/ui/Card';
import {AppButton} from '../components/ui/AppButton';
import {Badge} from '../components/ui/Badge';
import {loadSettings, saveSettings, type AppSettings} from '../data/settingsStore';
import {
  computeSolvedCount,
  getRankingSyncIntervalMs,
  loadRankingCache,
  submitRankingUpdate,
  syncRankingFromNetwork,
  type RankingEntry,
} from '../data/rankingStore';

type Props = {
  index: ProblemIndex;
  stats: StatsData;
  initialDir?: string;
  suppressResumePrompt?: boolean;
  openRatingMenuOnEnter?: boolean;
  onOpenProblem: (
    problemPath: string,
    browserDir: string,
    problemPathsInView?: string[],
    options?: {returnToRatingMenu?: boolean},
  ) => void;
  onOpenStats: (browserDir: string) => void;
  onOpenLevelChallenge: (
    levelKey: string,
    levelIndex: number,
    problemPaths: string[],
  ) => void;
  onOpenMarathon: (collectionDir: string, problemPaths: string[]) => void;
  onOpenRatingMode: (problemPath: string, problemPool: string[]) => void;
};

const PAGE_SIZE = 48;
const FAVORITES_DIR = 'assets/problem/즐겨찾기';
const WRONG_DIR = 'assets/problem/오답모음';
const WRONG_DIR_PREFIX = `${WRONG_DIR}/`;
const PROFILE_ICONS = ['🦉', '🐯', '🐼', '🦊', '🐧', '🐶', '🐱', '🐻'];
type RankingSort = 'elo' | 'solved' | 'streak';
const unsolvedOnlyStateByDir: Record<string, boolean> = {};

function showSyncToast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert('안내', message);
}

function parentDir(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

function decodeText(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function formatDirDisplayName(name: string): string {
  const k = name.match(/^(1[0-5]|[1-9])K$/i);
  if (k) {
    return `${Number.parseInt(k[1], 10)}급`;
  }
  const d = name.match(/^([1-7])D$/i);
  if (d) {
    return `${Number.parseInt(d[1], 10)}단`;
  }
  return name;
}

function isGradeRootDir(index: ProblemIndex, dir: string): boolean {
  const children = index.dirChildren[dir] ?? [];
  if (children.length < 8) return false;
  const gradeChildCount = children.filter(child => {
    const name = decodeText(child.split('/').slice(-1)[0]).toUpperCase();
    return /^(1[0-5]|[1-9])K$/.test(name) || /^([1-7])D$/.test(name);
  }).length;
  return gradeChildCount >= 8;
}

function isCollectionRootDir(index: ProblemIndex, dir: string): boolean {
  if (isGradeRootDir(index, dir)) return false;
  const name = formatDirDisplayName(decodeText(dir.split('/').slice(-1)[0]));
  return name.includes('문제집');
}

function collectFilesRecursive(index: ProblemIndex, dir: string, seen = new Set<string>()): string[] {
  if (seen.has(dir)) return [];
  seen.add(dir);
  const direct = index.dirFiles[dir] ?? [];
  const childDirs = index.dirChildren[dir] ?? [];
  if (childDirs.length === 0) return [...direct];
  const out = [...direct];
  for (const child of childDirs) {
    out.push(...collectFilesRecursive(index, child, seen));
  }
  return out;
}

function isGradeLeafDir(dir: string): boolean {
  return /\/(1[0-5]|[1-9])K$/i.test(dir) || /\/([1-7])D$/i.test(dir);
}

function normalizeFolderLabel(input: string): string {
  return input.replace(/\s+/g, '').replace(/-/g, '');
}

function stageOrderRank(name: string): number {
  const n = normalizeFolderLabel(name);
  const table: Array<[RegExp, number]> = [
    [/^초보1$/, 0],
    [/^초보2$/, 1],
    [/^초급1$/, 2],
    [/^초급2$/, 3],
    [/^초급3$/, 4],
    [/^중급1$/, 5],
    [/^중급2$/, 6],
    [/^중급3$/, 7],
    [/^고급1$/, 8],
    [/^고급2$/, 9],
    [/^고급3$/, 10],
    [/^고급4$/, 11],
    [/^전문가1$/, 12],
    [/^전문가2$/, 13],
    [/^전문가3$/, 14],
  ];
  const hit = table.find(([re]) => re.test(n));
  return hit ? hit[1] : Number.MAX_SAFE_INTEGER;
}

function rankingMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function isLeafDir(index: ProblemIndex, dir: string): boolean {
  return (index.dirChildren[dir] ?? []).length === 0;
}

function levelLabelToTargetRating(levelLabel: string): number | null {
  const k = levelLabel.match(/^([1-9]|1[0-5])급$/);
  if (k) {
    const kyu = Number.parseInt(k[1], 10);
    return (16 - kyu) * 100;
  }
  const d = levelLabel.match(/^([1-7])단$/);
  if (d) {
    const dan = Number.parseInt(d[1], 10);
    return (15 + dan) * 100;
  }
  return null;
}

function getCreatedTs(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function pickWeightedByEloRange(
  pool: string[],
  ratingByProblemPath: Record<string, number | null>,
  currentElo: number,
): string | null {
  const withDiff = pool
    .map(path => {
      const rating = ratingByProblemPath[path];
      if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
      return {path, diff: Math.abs(rating - currentElo)};
    })
    .filter((v): v is {path: string; diff: number} => v !== null);
  if (withDiff.length === 0) return null;

  const pickUniform = (arr: string[]): string | null =>
    arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;

  const band100 = withDiff.filter(v => v.diff <= 100).map(v => v.path);
  const band200 = withDiff.filter(v => v.diff > 100 && v.diff <= 200).map(v => v.path);
  const band300 = withDiff.filter(v => v.diff > 200 && v.diff <= 300).map(v => v.path);
  const band400 = withDiff.filter(v => v.diff > 300 && v.diff <= 400).map(v => v.path);

  const roll = Math.random();
  const tryOrder =
    roll < 0.5
      ? [band100, band200, band300, band400]
      : roll < 0.8
        ? [band200, band100, band300, band400]
        : roll < 0.95
          ? [band300, band200, band100, band400]
          : [band400, band300, band200, band100];

  for (const band of tryOrder) {
    const picked = pickUniform(band);
    if (picked) return picked;
  }
  return pickUniform(withDiff.map(v => v.path));
}

export function BrowserScreen({
  index,
  stats,
  initialDir,
  suppressResumePrompt,
  openRatingMenuOnEnter,
  onOpenProblem,
  onOpenStats,
  onOpenLevelChallenge,
  onOpenMarathon,
  onOpenRatingMode,
}: Props): React.JSX.Element {
  const [currentDir, setCurrentDir] = useState<string>(initialDir ?? index.rootPath);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [promptedPath, setPromptedPath] = useState<string | null>(null);
  const [suppressResumeDir, setSuppressResumeDir] = useState<string | null>(
    suppressResumePrompt ? initialDir ?? index.rootPath : null,
  );
  const [marathonOpen, setMarathonOpen] = useState(false);
  const [marathonDir, setMarathonDir] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ratingMenuOpen, setRatingMenuOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<AppSettings>({
    useConfirmButton: true,
    autoNextOnCorrect: true,
    profileName: '사용자',
    profileIcon: '🦉',
    deviceId: '',
    nicknamePromptDismissed: false,
  });
  const [profileNameDraft, setProfileNameDraft] = useState('사용자');
  const [profileIconDraft, setProfileIconDraft] = useState('🦉');
  const [rankingOpen, setRankingOpen] = useState(false);
  const [levelChallengeOpen, setLevelChallengeOpen] = useState(false);
  const [ratingRecentOpen, setRatingRecentOpen] = useState(false);
  const [rankingSort, setRankingSort] = useState<RankingSort>('elo');
  const [rankingEntries, setRankingEntries] = useState<RankingEntry[]>([]);
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [forceProfilePrompt, setForceProfilePrompt] = useState(false);
  const prevDirRef = useRef<string>(initialDir ?? index.rootPath);

  useEffect(() => {
    if (!initialDir) return;
    setCurrentDir(initialDir);
    setVisible(PAGE_SIZE);
  }, [initialDir]);

  useEffect(() => {
    if (!openRatingMenuOnEnter) return;
    setRatingMenuOpen(true);
  }, [openRatingMenuOnEnter]);

  useEffect(() => {
    loadSettings()
      .then(s => {
        setSettingsState(s);
        setProfileNameDraft(s.profileName);
        setProfileIconDraft(s.profileIcon);
        if (!s.nicknamePromptDismissed && s.profileName.trim() === '사용자') {
          setForceProfilePrompt(true);
          setProfileOpen(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const leaf =
      isLeafDir(index, currentDir) &&
      currentDir !== FAVORITES_DIR &&
      currentDir !== WRONG_DIR &&
      !currentDir.startsWith(WRONG_DIR_PREFIX);
    if (!leaf) {
      setUnsolvedOnly(false);
      return;
    }
    setUnsolvedOnly(!!unsolvedOnlyStateByDir[currentDir]);
  }, [currentDir, index]);

  useEffect(() => {
    let mounted = true;
    const loadAndSync = async (): Promise<void> => {
      const cached = await loadRankingCache();
      if (mounted) {
        setRankingEntries(cached.payload.entries);
      }
      const synced = await syncRankingFromNetwork(false);
      if (mounted) {
        setRankingEntries(synced.payload.entries);
      }
    };
    loadAndSync().catch(() => undefined);

    const timer = setInterval(() => {
      syncRankingFromNetwork(true)
        .then(synced => {
          if (!mounted) return;
          setRankingEntries(synced.payload.entries);
        })
        .catch(() => undefined);
    }, getRankingSyncIntervalMs());

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (suppressResumePrompt) {
      setSuppressResumeDir(initialDir ?? index.rootPath);
    }
  }, [initialDir, index.rootPath, suppressResumePrompt]);

  useEffect(() => {
    if (suppressResumeDir && suppressResumeDir !== currentDir) {
      setSuppressResumeDir(null);
    }
  }, [currentDir, suppressResumeDir]);

  useEffect(() => {
    if (!promptedPath) return;
    if (parentDir(promptedPath) !== currentDir) {
      setPromptedPath(null);
    }
  }, [currentDir, promptedPath]);

  const navigateToDir = (nextDir: string): void => {
    setCurrentDir(nextDir);
    setVisible(PAGE_SIZE);
  };

  const saveProfile = async (): Promise<void> => {
    const nextName = profileNameDraft.trim();
    if (!nextName) {
      Alert.alert('안내', '닉네임을 입력해주세요.');
      return;
    }
    const nextSettings: AppSettings = {
      ...settingsState,
      profileName: nextName,
      profileIcon: profileIconDraft || '🦉',
      nicknamePromptDismissed:
        settingsState.nicknamePromptDismissed || forceProfilePrompt || nextName === '사용자',
    };
    await saveSettings(nextSettings);
    setSettingsState(nextSettings);
    setProfileOpen(false);
    setForceProfilePrompt(false);
  };

  const moveUp = (): void => {
    if (currentDir === index.rootPath) return;
    if (currentDir.startsWith(WRONG_DIR_PREFIX)) {
      navigateToDir(WRONG_DIR);
      return;
    }
    const parent = currentDir.split('/').slice(0, -1).join('/');
    navigateToDir(parent);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentDir !== index.rootPath) {
        moveUp();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [currentDir, index.rootPath]);

  const wrongFiles = useMemo(
    () => index.allFiles.filter(f => stats.problems[f]?.lastResult === 'wrong'),
    [index.allFiles, stats.problems],
  );

  const wrongTopGroups = useMemo(() => {
    const set = new Set<string>();
    for (const f of wrongFiles) {
      const rel = f.replace(`${index.rootPath}/`, '');
      const parts = rel.split('/').filter(Boolean);
      if (parts.length > 1) {
        set.add(`${WRONG_DIR}/${parts[0]}`);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [index.rootPath, wrongFiles]);

  const dirs = useMemo(() => {
    const base = [...(index.dirChildren[currentDir] ?? [])];
    if (currentDir === index.rootPath) {
      const rootOrdered = [...base].sort((a, b) => {
        const pa = isCollectionRootDir(index, a)
          ? 0
          : isGradeRootDir(index, a)
            ? 1
            : 2;
        const pb = isCollectionRootDir(index, b)
          ? 0
          : isGradeRootDir(index, b)
            ? 1
            : 2;
        if (pa !== pb) return pa - pb;
        const aa = decodeText(a.split('/').slice(-1)[0]);
        const bb = decodeText(b.split('/').slice(-1)[0]);
        return aa.localeCompare(bb);
      });
      const rootWithVirtual = [...rootOrdered];
      rootWithVirtual.unshift(FAVORITES_DIR);
      rootWithVirtual.unshift(WRONG_DIR);
      return rootWithVirtual;
    }
    if (currentDir === WRONG_DIR) {
      return wrongTopGroups;
    }
    const currentName = decodeText(currentDir.split('/').slice(-1)[0]);
    if (currentName === '단계별 문제') {
      return [...base].sort((a, b) => {
        const aa = decodeText(a.split('/').slice(-1)[0]);
        const bb = decodeText(b.split('/').slice(-1)[0]);
        const ra = stageOrderRank(aa);
        const rb = stageOrderRank(bb);
        if (ra !== rb) return ra - rb;
        return aa.localeCompare(bb, 'ko');
      });
    }
    return base;
  }, [currentDir, index.dirChildren, index.rootPath, wrongTopGroups]);

  const filesAll = useMemo(() => {
    if (currentDir === FAVORITES_DIR) {
      const set = new Set(stats.favorites);
      return index.allFiles.filter(f => set.has(f));
    }
    if (currentDir === WRONG_DIR) {
      return [];
    }
    if (currentDir.startsWith(WRONG_DIR_PREFIX)) {
      const groupName = currentDir.replace(WRONG_DIR_PREFIX, '');
      return wrongFiles.filter(f => {
        const rel = f.replace(`${index.rootPath}/`, '');
        const top = rel.split('/').filter(Boolean)[0] ?? '';
        return top === groupName;
      });
    }
    return index.dirFiles[currentDir] ?? [];
  }, [currentDir, index, stats.favorites, wrongFiles]);

  const currentIsLeaf = useMemo(
    () =>
      isLeafDir(index, currentDir) &&
      currentDir !== FAVORITES_DIR &&
      currentDir !== WRONG_DIR &&
      !currentDir.startsWith(WRONG_DIR_PREFIX),
    [currentDir, index],
  );

  const filesFilteredAll = useMemo(() => {
    if (!unsolvedOnly) return filesAll;
    return filesAll.filter(path => (stats.problems[path]?.correct ?? 0) <= 0);
  }, [filesAll, stats.problems, unsolvedOnly]);

  useEffect(() => {
    if (suppressResumeDir === currentDir) {
      return;
    }
    const enteredFromParent = prevDirRef.current === parentDir(currentDir);
    if (!enteredFromParent) return;
    const isLeafDir = (index.dirChildren[currentDir] ?? []).length === 0;
    if (!isLeafDir) return;

    const last = stats.lastPlayedByDir?.[currentDir] ?? stats.lastPlayedPath;
    if (!last) return;
    if (promptedPath === last) return;
    if (!filesFilteredAll.includes(last)) return;

    setPromptedPath(last);
    Alert.alert('\uC774\uC5B4\uD480\uAE30', '\uB9C8\uC9C0\uB9C9\uC73C\uB85C \uD480\uB358 \uBB38\uC81C\uB85C \uC774\uB3D9\uD560\uAE4C\uC694?', [
      {text: '\uC544\uB2C8\uC624', style: 'cancel'},
      {text: '\uC608', onPress: () => onOpenProblem(last, currentDir, filesFilteredAll)},
    ]);
  }, [
    currentDir,
    filesFilteredAll,
    index.dirChildren,
    onOpenProblem,
    promptedPath,
    stats.lastPlayedByDir,
    stats.lastPlayedPath,
    suppressResumeDir,
  ]);

  useEffect(() => {
    prevDirRef.current = currentDir;
  }, [currentDir]);

  const files = filesFilteredAll.slice(0, visible);
  const rootCollections = useMemo(
    () =>
      (index.dirChildren[index.rootPath] ?? []).filter(dir => {
        const name = formatDirDisplayName(decodeText(dir.split('/').slice(-1)[0]));
        if (name.includes('기력별 문제')) return false;
        return !isGradeRootDir(index, dir);
      }),
    [index.dirChildren, index.rootPath, index],
  );

  const leafDifficultyLabelByDir = useMemo(() => {
    const out: Record<string, string> = {};
    for (const dir of dirs) {
      if (!isLeafDir(index, dir)) continue;
      if (dir.includes('/기초사활맥 800제/')) continue;
      const ratings = (index.dirFiles[dir] ?? [])
        .map(path => index.ratingByProblemPath[path])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (ratings.length === 0) continue;
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      const band = ratingToDisplayBand(Math.round(avg / 100) * 100);
      out[dir] = `평균 난이도 ${band.label}`;
    }
    return out;
  }, [dirs, index]);

  const marathonChildren = marathonDir ? index.dirChildren[marathonDir] ?? [] : [];
const marathonCurrentName = marathonDir
  ? formatDirDisplayName(decodeText(marathonDir.split('/').slice(-1)[0]))
  : '문제집';
  const marathonCurrentFiles = marathonDir ? index.dirFiles[marathonDir] ?? [] : [];
  const canStartMarathonAtCurrent =
    !!marathonDir && marathonChildren.length === 0 && marathonCurrentFiles.length > 0;

  const currentDirName =
    currentDir === FAVORITES_DIR
      ? '즐겨찾기'
      : currentDir === WRONG_DIR
        ? '오답모음'
        : currentDir === index.rootPath
          ? ''
          : formatDirDisplayName(decodeText(currentDir.split('/').slice(-1)[0]));
  const isRoot = currentDir === index.rootPath;
  const userElo = stats.eloRating ?? 300;
  const userBand = ratingToDisplayBand(userElo);
  const ratedPool = useMemo(
    () =>
      index.allFiles.filter(problemPath => {
        const r = index.ratingByProblemPath[problemPath];
        return (
          typeof r === 'number' &&
          Number.isFinite(r) &&
          !shouldExcludeFromRatingMode(problemPath) &&
          !index.challengeTooLargeByProblemPath[problemPath]
        );
      }),
    [index.allFiles, index.challengeTooLargeByProblemPath, index.ratingByProblemPath],
  );

  const rootRows = useMemo(() => {
    if (!isRoot) return [] as string[][];
    const rows: string[][] = [];
    for (let i = 0; i < dirs.length; i += 2) {
      rows.push(dirs.slice(i, i + 2));
    }
    return rows;
  }, [dirs, isRoot]);
  const rankingRowsAll = useMemo(() => {
    const copied = [...rankingEntries];
    const myDeviceId = settingsState.deviceId?.trim();
    const myNickname = (settingsState.profileName || '사용자').trim();
    if (myDeviceId && myNickname) {
      const existing = copied.find(r => (r.deviceId ?? '').trim() === myDeviceId);
      const myEntry: RankingEntry = {
        deviceId: myDeviceId,
        nickname: myNickname,
        solvedCount: computeSolvedCount(stats),
        elo: Math.max(0, Math.floor(stats.eloRating ?? 300)),
        streakCurrent: Math.max(0, stats.streakCurrent ?? 0),
        createdAt: existing?.createdAt,
      };
      const myIdx = copied.findIndex(r => (r.deviceId ?? '').trim() === myDeviceId);
      if (myIdx >= 0) {
        copied[myIdx] = myEntry;
      } else {
        copied.push(myEntry);
      }
    }
    if (rankingSort === 'elo') {
      copied.sort(
        (a, b) =>
          b.elo - a.elo || getCreatedTs(a.createdAt) - getCreatedTs(b.createdAt),
      );
    } else if (rankingSort === 'streak') {
      copied.sort(
        (a, b) =>
          (b.streakCurrent ?? 0) - (a.streakCurrent ?? 0) ||
          getCreatedTs(a.createdAt) - getCreatedTs(b.createdAt),
      );
    } else {
      copied.sort(
        (a, b) =>
          b.solvedCount - a.solvedCount ||
          getCreatedTs(a.createdAt) - getCreatedTs(b.createdAt),
      );
    }
    return copied;
  }, [rankingEntries, rankingSort, settingsState.deviceId, settingsState.profileName, stats]);
  const rankingRows = useMemo(() => rankingRowsAll.slice(0, 100), [rankingRowsAll]);
  const myRank = useMemo(() => {
    const myDeviceId = settingsState.deviceId?.trim();
    if (!myDeviceId) return null;
    const idx = rankingRowsAll.findIndex(r => (r.deviceId ?? '').trim() === myDeviceId);
    return idx >= 0 ? idx + 1 : null;
  }, [rankingRowsAll, settingsState.deviceId]);
  const ratingRecent = useMemo(() => stats.ratingRecent ?? [], [stats.ratingRecent]);
  const levelOrder = useMemo(
    () => [
      '14급',
      '13급',
      '12급',
      '11급',
      '10급',
      '9급',
      '8급',
      '7급',
      '6급',
      '5급',
      '4급',
      '3급',
      '2급',
      '1급',
      '1단',
      '2단',
      '3단',
      '4단',
      '5단',
      '6단',
      '7단',
    ],
    [],
  );
  const challengeStats = stats.levelChallenge ?? {unlockedMaxIndex: 0, attempts: {}, successes: {}};
  const levelPools = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const lv of levelOrder) map[lv] = [];
    const seen = new Set<string>();
    for (const path of index.allFiles) {
      if (seen.has(path)) continue;
      seen.add(path);
      const rating = index.ratingByProblemPath[path];
      if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;
      const band = ratingToDisplayBand(Math.round(rating / 100) * 100).label;
      if (!map[band]) continue;
      map[band].push(path);
    }
    return map;
  }, [index.allFiles, index.ratingByProblemPath, levelOrder]);
  const pickLevelChallengeProblems = useMemo(() => {
    return (levelLabel: string, limit = 10): string[] => {
      const target = levelLabelToTargetRating(levelLabel);
      const rated: Array<{path: string; rating: number}> = [];
      const seen = new Set<string>();
      for (const path of index.allFiles) {
        if (seen.has(path)) continue;
        seen.add(path);
        const r = index.ratingByProblemPath[path];
        if (typeof r !== 'number' || !Number.isFinite(r)) continue;
        rated.push({path, rating: r});
      }
      if (rated.length === 0) return [];
      const exact = target === null
        ? rated
        : rated.filter(v => roundRatingToHundreds(v.rating) === target);
      const shuffledExact = [...exact].sort(() => Math.random() - 0.5);
      const selected: string[] = shuffledExact.slice(0, limit).map(v => v.path);
      if (selected.length >= limit) {
        return [...selected].sort(() => Math.random() - 0.5);
      }

      const selectedSet = new Set(selected);
      const fallback = rated
        .filter(v => !selectedSet.has(v.path))
        .sort((a, b) => {
          if (target === null) return Math.random() - 0.5;
          const da = Math.abs(a.rating - target);
          const db = Math.abs(b.rating - target);
          if (da !== db) return da - db;
          return Math.random() - 0.5;
        });
      for (const row of fallback) {
        if (selected.length >= limit) break;
        if (selectedSet.has(row.path)) continue;
        selected.push(row.path);
        selectedSet.add(row.path);
      }
      return [...selected].sort(() => Math.random() - 0.5);
    };
  }, [index.allFiles, index.ratingByProblemPath]);
  const pickLevelChallengeEligibleProblems = (levelLabel: string, limit = 10): string[] =>
    pickLevelChallengeProblems(levelLabel, 200)
      .filter(path => !index.challengeTooLargeByProblemPath[path])
      .slice(0, limit);

  return (
    <View style={styles.wrap}>
      {isRoot ? (
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Pressable
              style={styles.brandIconWrap}
              onPress={() => {
                setProfileNameDraft(settingsState.profileName);
                setProfileIconDraft(settingsState.profileIcon);
                setProfileOpen(true);
              }}>
              <Text style={styles.brandIcon}>{settingsState.profileIcon}</Text>
            </Pressable>
            <View>
              <Text style={styles.brandTitle}>사활문제집</Text>
              <Text style={styles.brandSubtitle}>{settingsState.profileName}</Text>
            </View>
          </View>
        </View>
      ) : null}
      {isRoot ? (
        <Pressable style={styles.heroCard} onPress={() => onOpenStats(currentDir)}>
          <View style={styles.heroRow}>
            <Badge
              label={`연속학습 ${Math.max(0, stats.streakCurrent ?? 0)}일째`}
              variant="success"
              size="md"
              textStyle={styles.heroStreakBadgeText}
            />
          </View>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroElo}>{`${userElo} ELO`}</Text>
            <Text style={styles.heroBandText}>{`현재 ${userBand.label}`}</Text>
          </View>
          <Text style={styles.heroFootText}>상위권을 향해 꾸준히 도전해보세요!</Text>
        </Pressable>
      ) : null}

      {isRoot ? (
        <View style={styles.quickActions}>
          <Card
            pressable
            variant="base"
            shadowType="soft"
            style={styles.quickActionCard}
            onPress={() => setLevelChallengeOpen(true)}>
            <View style={styles.quickIconWrapBlue}>
              <Text style={styles.quickIconText}>📊</Text>
            </View>
            <Text style={styles.quickLabel}>레벨별 도전</Text>
          </Card>
          <Card
            pressable
            variant="base"
            shadowType="soft"
            style={styles.quickActionCard}
            onPress={() => {
              setRatingMenuOpen(true);
            }}>
            <View style={styles.quickIconWrapRose}>
              <Text style={styles.quickIconText}>🏅</Text>
            </View>
            <Text style={styles.quickLabel}>레이팅</Text>
          </Card>
          <Card
            pressable
            variant="base"
            shadowType="soft"
            style={styles.quickActionCard}
            onPress={() => {
              setMarathonDir(null);
              setMarathonOpen(true);
            }}>
            <View style={styles.quickIconWrapGreen}>
              <Text style={styles.quickIconText}>⏱</Text>
            </View>
            <Text style={styles.quickLabel}>마라톤</Text>
          </Card>
        </View>
      ) : null}

      {currentDir !== index.rootPath ? (
        <Pressable onPress={moveUp} disabled={currentDir === index.rootPath}>
          <Text style={styles.pathText}>{currentDirName}</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={files}
        keyExtractor={item => item}
        numColumns={2}
        columnWrapperStyle={styles.fileRow}
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => {
          const solved = (stats.problems[item]?.correct ?? 0) > 0;
          const wrong = stats.problems[item]?.lastResult === 'wrong';
          const thumbAsset = index.thumbAssetByProblemPath[item];
          const title = isGradeLeafDir(currentDir)
            ? `${filesAll.indexOf(item) + 1}번`
            : formatProblemTitle(item, index);

          return (
            <Card
              pressable
              onPress={() => onOpenProblem(item, currentDir, filesFilteredAll)}
              variant="soft"
              shadowType="soft"
              padded={false}
              style={styles.fileCard}>
              <ThumbImage thumbAsset={thumbAsset} />
              <View style={styles.fileMeta}>
                <View style={styles.badgeRow}>
                  {solved ? <Badge label="완료" variant="success" size="sm" /> : null}
                  {wrong ? <Badge label="오답" variant="error" size="sm" /> : null}
                </View>
                <Text numberOfLines={1} style={styles.fileText}>
                  {title}
                </Text>
              </View>
            </Card>
          );
        }}
        ListHeaderComponent={
          <View style={styles.dirSection}>
            {isRoot ? (
              <Card
                pressable
                onPress={() => setRankingOpen(true)}
                variant="outlined"
                shadowType="soft"
                style={styles.rankingEntryCard}>
                <View style={styles.rankingEntryRow}>
                  <View>
                    <Text style={styles.rankingEntryTitle}>랭킹</Text>
                    <Text style={styles.rankingEntryDesc}>ELO / 문제수 / 연속학습 랭킹</Text>
                  </View>
                </View>
              </Card>
            ) : null}
            {isRoot
              ? rootRows.map((row, rowIdx) => (
                  <View key={`row-${rowIdx}`} style={styles.rootRow}>
                    {row.map(d => {
                      const name = formatDirDisplayName(decodeText(d.split('/').slice(-1)[0]));

                      return (
                        <Card
                          key={d}
                          pressable
                          onPress={() => navigateToDir(d)}
                          variant="soft"
                          shadowType="soft"
                          style={[styles.dirCard, styles.dirCardRoot]}>
                          <View style={styles.dirRow}>
                            <View style={styles.dirLeft}>
                              <Text style={styles.dirText}>{name}</Text>
                            </View>
                          </View>
                        </Card>
                      );
                    })}
                    {row.length === 1 ? <View style={styles.rootRowSpacer} /> : null}
                  </View>
                ))
              : dirs.map(d => {
              const name = formatDirDisplayName(decodeText(d.split('/').slice(-1)[0]));

              return (
                <Card
                  key={d}
                  pressable
                  onPress={() => navigateToDir(d)}
                  variant="soft"
                  shadowType="soft"
                  style={[styles.dirCard, isRoot && styles.dirCardRoot]}>
                  <View style={styles.dirRow}>
                    <View style={styles.dirLeft}>
                      <Text style={styles.dirText}>{name}</Text>
                      {leafDifficultyLabelByDir[d] ? (
                        <Text style={styles.dirSubText}>{leafDifficultyLabelByDir[d]}</Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
            {currentIsLeaf && filesAll.length > 0 ? (
              <View style={styles.leafFilterRow}>
                <AppButton
                  label={unsolvedOnly ? '전체 문제 보기' : '미완료 문제만 보기'}
                  variant={unsolvedOnly ? 'primary' : 'neutral'}
                  size="sm"
                  onPress={() => {
                    const next = !unsolvedOnly;
                    setUnsolvedOnly(next);
                    unsolvedOnlyStateByDir[currentDir] = next;
                  }}
                />
                <Badge label={`${filesFilteredAll.length}/${filesAll.length}`} variant="info" size="sm" />
              </View>
            ) : null}
            {isRoot && filesAll.length > 0 ? (
              <View style={styles.recentRow}>
                <Text style={styles.sectionTitle}>최근 문제</Text>
                <Text style={styles.recentMoreText}>전체보기</Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          filesFilteredAll.length > files.length ? (
            <AppButton
              label={`문제 더보기 (${files.length}/${filesFilteredAll.length})`}
              variant="neutral"
              size="md"
              onPress={() => setVisible(v => v + PAGE_SIZE)}
              style={styles.moreBtn}
            />
          ) : null
        }
      />

      <Modal
        animationType="slide"
        transparent={false}
        visible={rankingOpen}
        onRequestClose={() => setRankingOpen(false)}>
        <View style={styles.rankingPageWrap}>
          <View style={styles.rankingPageHeader}>
            <View>
              <Text style={styles.modalTitle}>랭킹</Text>
              <Text style={styles.modalDesc}>상위 100위</Text>
            </View>
            <View style={styles.rankingHeaderActions}>
              <Pressable
                style={styles.rankingSyncIconBtn}
                onPress={() => {
                  const deviceId = settingsState.deviceId?.trim();
                  const nickname = (settingsState.profileName || '사용자').trim();
                  const solvedCount = computeSolvedCount(stats);
                  const elo = Math.max(0, Math.floor(stats.eloRating ?? 300));
                  const streakCurrent = Math.max(0, stats.streakCurrent ?? 0);

                  const submitAndSync = async (): Promise<void> => {
                    let submitOk = true;
                    if (deviceId && nickname) {
                      submitOk = await submitRankingUpdate({
                        deviceId,
                        nickname,
                        solvedCount,
                        elo,
                        streakCurrent,
                      });
                    }
                    const synced = await syncRankingFromNetwork(true);
                    setRankingEntries(synced.payload.entries);
                    if (!submitOk) {
                      showSyncToast('제출 실패, 랭킹 조회만 완료');
                      return;
                    }
                    showSyncToast('제출 성공, 랭킹 갱신 완료');
                  };

                  submitAndSync().catch(() => {
                    showSyncToast('동기화 실패');
                  });
                }}>
                <Text style={styles.rankingSyncIconText}>업데이트</Text>
              </Pressable>
              <AppButton
                label="닫기"
                variant="neutral"
                size="sm"
                onPress={() => setRankingOpen(false)}
              />
            </View>
          </View>

          <Card variant="base" shadowType="soft" style={styles.rankingMetaCard}>
            <View style={styles.rankingMetaRow}>
              <Badge
                label={myRank ? `내 순위 ${myRank}위` : '내 순위 미집계'}
                variant={myRank ? 'success' : 'outline'}
                size="sm"
              />
              <Badge label={`총 ${rankingRowsAll.length}명`} variant="info" size="sm" />
            </View>

            <View style={styles.rankingTabRow}>
              <AppButton
                label="ELO"
                variant={rankingSort === 'elo' ? 'primary' : 'neutral'}
                size="sm"
                style={styles.rankingTabBtn}
                onPress={() => setRankingSort('elo')}
              />
              <AppButton
                label="풀이수"
                variant={rankingSort === 'solved' ? 'primary' : 'neutral'}
                size="sm"
                style={styles.rankingTabBtn}
                onPress={() => setRankingSort('solved')}
              />
              <AppButton
                label="연속학습"
                variant={rankingSort === 'streak' ? 'primary' : 'neutral'}
                size="sm"
                style={styles.rankingTabBtn}
                onPress={() => setRankingSort('streak')}
              />
            </View>
          </Card>

          <FlatList
            data={rankingRows}
            keyExtractor={(item, idx) => `${item.nickname}-${idx}`}
            style={styles.rankingList}
            renderItem={({item, index: idx}) => {
              const rank = idx + 1;
              const medal = rankingMedal(rank);
              const mine =
                !!settingsState.deviceId &&
                (item.deviceId ?? '').trim() === settingsState.deviceId.trim();
              return (
                <Card
                  variant={mine ? 'emphasis' : 'outlined'}
                  padded={false}
                  style={[styles.rankingRowCard, mine && styles.rankingRowCardMine]}>
                  <View style={styles.rankingRow}>
                    <Text style={styles.rankingRank}>{rank}</Text>
                    <Text style={styles.rankingName} numberOfLines={1}>
                      {item.nickname}
                    </Text>
                    {medal ? <Text style={styles.rankingMedal}>{medal}</Text> : null}
                    <Text style={styles.rankingValueText}>
                      {rankingSort === 'elo'
                        ? `${item.elo}`
                        : rankingSort === 'streak'
                          ? `${item.streakCurrent ?? 0}일`
                          : `${item.solvedCount}`}
                    </Text>
                  </View>
                </Card>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>랭킹 데이터가 없습니다. 네트워크 동기화를 시도해주세요.</Text>
            }
          />
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={levelChallengeOpen}
        onRequestClose={() => setLevelChallengeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <Text style={styles.modalTitle}>레벨별 도전</Text>
            <Text style={styles.modalDesc}>
              잠금해제된 레벨을 선택해서 10문제 도전을 시작하세요. 8문제 이상을 맞추면 다음 레벨이 잠금해제됩니다
            </Text>

            <FlatList
              data={levelOrder}
              keyExtractor={item => item}
              style={styles.modalList}
              renderItem={({item, index: levelIndex}) => {
                const unlocked = levelIndex <= (challengeStats.unlockedMaxIndex ?? 0);
                const pool = levelPools[item] ?? [];
                const attempts = challengeStats.attempts[item] ?? 0;
                const successes = challengeStats.successes[item] ?? 0;
                return (
                  <Card
                    pressable={unlocked}
                    variant={unlocked ? 'outlined' : 'soft'}
                    padded={false}
                    style={[styles.modalItem, styles.levelChallengeItem, !unlocked && styles.modalItemLocked]}
                    onPress={() => {
                      if (!unlocked) return;
                      const selected = pickLevelChallengeEligibleProblems(item, 10);
                      if (selected.length === 0) {
                        Alert.alert('안내', '해당 레벨 문제 풀이 데이터가 없습니다.');
                        return;
                      }
                      setLevelChallengeOpen(false);
                      onOpenLevelChallenge(item, levelIndex, selected);
                    }}>
                    <View style={styles.levelChallengeRow}>
                      <View style={styles.levelChallengeLeft}>
                        <Text style={styles.levelChallengeTitle}>{item}</Text>
                      </View>
                      <View style={styles.levelChallengeRight}>
                        <Badge label={`성공 ${successes}`} variant="success" size="sm" />
                        <Badge label={`시도 ${attempts}`} variant="info" size="sm" />
                      </View>
                    </View>
                  </Card>
                );
              }}
            />

            <AppButton
              label="닫기"
              variant="neutral"
              size="md"
              onPress={() => setLevelChallengeOpen(false)}
              style={styles.modalCloseBtn}
            />
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={ratingMenuOpen}
        onRequestClose={() => setRatingMenuOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.ratingMenuCard}>
            <AppButton
              label="문제풀기"
              variant="primary"
              size="lg"
              block
              onPress={() => {
                setRatingMenuOpen(false);
                if (ratedPool.length === 0) {
                  Alert.alert('안내', '레이팅이 있는 문제가 없습니다.');
                  return;
                }
                const pick =
                  pickWeightedByEloRange(ratedPool, index.ratingByProblemPath, userElo) ??
                  ratedPool[Math.floor(Math.random() * ratedPool.length)];
                onOpenRatingMode(pick, ratedPool);
              }}
              style={styles.ratingMenuBtn}
            />
            <AppButton
              label="지난 10문제 보기"
              variant="secondary"
              size="lg"
              block
              onPress={() => {
                setRatingMenuOpen(false);
                if (ratingRecent.length === 0) {
                  Alert.alert('안내', '최근 레이팅 풀이 기록이 없습니다.');
                  return;
                }
                setRatingRecentOpen(true);
              }}
              style={styles.ratingMenuBtn}
            />
            <AppButton
              label="취소"
              variant="neutral"
              size="lg"
              block
              onPress={() => setRatingMenuOpen(false)}
              style={styles.ratingMenuBtn}
            />
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={ratingRecentOpen}
        onRequestClose={() => setRatingRecentOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <Text style={styles.modalTitle}>지난 10문제</Text>
            <Text style={styles.modalDesc}>최근 레이팅 모드에서 푼 문제 목록입니다.</Text>

            <FlatList
              data={ratingRecent}
              keyExtractor={(item, idx) => `${item.playedAt}-${item.problemPath}-${idx}`}
              style={styles.modalList}
              renderItem={({item, index: idx}) => {
                return (
                  <Card
                    pressable
                    variant="outlined"
                    padded={false}
                    style={[styles.modalItem, styles.ratingRecentItem]}
                    onPress={() => {
                      setRatingRecentOpen(false);
                      onOpenProblem(
                        item.problemPath,
                        index.rootPath,
                        ratingRecent.map(v => v.problemPath),
                        {returnToRatingMenu: true},
                      );
                    }}>
                    <View style={styles.recentRatingRow}>
                      <Text style={styles.modalItemText} numberOfLines={1}>
                        {`${idx + 1}문제 전`}
                      </Text>
                      <Badge
                        label={item.result === 'correct' ? '정답' : '오답'}
                        variant={item.result === 'correct' ? 'success' : 'error'}
                        size="sm"
                      />
                    </View>
                  </Card>
                );
              }}
              ListEmptyComponent={<Text style={styles.modalEmpty}>기록이 없습니다.</Text>}
            />

            <AppButton
              label="닫기"
              variant="neutral"
              size="md"
              onPress={() => setRatingRecentOpen(false)}
              style={styles.modalCloseBtn}
            />
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={profileOpen}
        onRequestClose={() => {
          if (forceProfilePrompt) return;
          setProfileOpen(false);
        }}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <Text style={styles.modalTitle}>프로필 설정</Text>
            <Text style={styles.modalDesc}>아이콘과 닉네임을 변경할 수 있습니다.</Text>

            <Text style={styles.profileLabel}>아이콘</Text>
            <View style={styles.iconGrid}>
              {PROFILE_ICONS.map(icon => {
                const active = profileIconDraft === icon;
                return (
                  <Pressable
                    key={`profile-icon-${icon}`}
                    onPress={() => setProfileIconDraft(icon)}
                    style={[styles.iconCell, active && styles.iconCellActive]}>
                    <Text style={styles.iconCellText}>{icon}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.profileLabel}>닉네임</Text>
            <TextInput
              value={profileNameDraft}
              onChangeText={setProfileNameDraft}
              placeholder="닉네임 입력"
              maxLength={16}
              style={styles.profileInput}
              placeholderTextColor="#8FA0A9"
            />

            <View style={styles.profileButtons}>
              <AppButton
                label="취소"
                variant="neutral"
                size="md"
                style={styles.profileBtn}
                onPress={() => {
                  if (forceProfilePrompt) return;
                  setProfileOpen(false);
                }}
              />
              <AppButton
                label="저장"
                variant="primary"
                size="md"
                style={styles.profileBtn}
                onPress={() => {
                  saveProfile().catch(() => undefined);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={marathonOpen}
        onRequestClose={() => setMarathonOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <Text style={styles.modalTitle}>마라톤 문제집 선택</Text>
            <Text style={styles.modalDesc}>최종 리프 폴더를 선택해 1번부터 끝까지 연속으로 풉니다.</Text>

            <View style={styles.modalPathRow}>
              <Text style={styles.modalPathText}>
                {marathonDir ? `선택 중: ${marathonCurrentName}` : '루트 문제집 선택'}
              </Text>
              {marathonDir ? (
                <AppButton
                  label="상위"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    const p = marathonDir.split('/').slice(0, -1).join('/');
                    setMarathonDir(p === index.rootPath ? null : p);
                  }}
                />
              ) : null}
            </View>

            <FlatList
              data={marathonDir ? marathonChildren : rootCollections}
              keyExtractor={item => item}
              style={styles.modalList}
              renderItem={({item}) => {
                const name = formatDirDisplayName(decodeText(item.split('/').slice(-1)[0]));
                return (
                  <Card
                    pressable
                    variant="outlined"
                    padded
                    style={styles.modalItem}
                    onPress={() => setMarathonDir(item)}>
                    <Text style={styles.modalItemText}>{name}</Text>
                    <Badge
                      label={`${collectFilesRecursive(index, item).length}문제`}
                      variant="info"
                      size="sm"
                    />
                  </Card>
                );
              }}
              ListEmptyComponent={
                marathonDir ? (
                  <Text style={styles.modalEmpty}>하위 폴더가 없습니다. 아래 버튼으로 시작하세요.</Text>
                ) : null
              }
            />

            {canStartMarathonAtCurrent ? (
              <AppButton
                label={`\"${marathonCurrentName}\" 시작`}
                variant="success"
                size="lg"
                shadowType="focus"
                onPress={() => {
                  if (!marathonDir) return;
                  const leafFiles = index.dirFiles[marathonDir] ?? [];
                  if (leafFiles.length === 0) {
                    Alert.alert('안내', '선택한 리프 폴더에 문제가 없습니다.');
                    return;
                  }
                  setMarathonOpen(false);
                  onOpenMarathon(marathonDir, leafFiles);
                }}
                style={styles.modalStartBtn}
              />
            ) : null}

            <AppButton
              label="닫기"
              variant="neutral"
              size="md"
              onPress={() => setMarathonOpen(false)}
              style={styles.modalCloseBtn}
            />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function ThumbImage({
  thumbAsset,
}: {
  thumbAsset: string | null | undefined;
}): React.JSX.Element {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      if (!thumbAsset) {
        if (mounted) setUri(null);
        return;
      }
      try {
        const b64 = await RNFS.readFileAssets(thumbAsset, 'base64');
        if (mounted) {
          setUri(`data:image/png;base64,${b64}`);
        }
      } catch {
        if (mounted) setUri(null);
      }
    };
    load().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [thumbAsset]);

  return (
    <View style={styles.thumbFrame}>
      {uri ? (
        <Image source={{uri}} style={styles.thumb} resizeMode="contain" />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.md,
    backgroundColor: '#F3FCEE',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D9E7DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  brandTitle: {
    ...theme.typography.h2,
    color: '#111111',
  },
  brandSubtitle: {
    ...theme.typography.caption,
    color: '#222222',
  },
  heroCard: {
    borderRadius: theme.radius.xxl,
    padding: theme.space.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7EAF1',
    marginBottom: theme.space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroMetaRow: {
    marginTop: theme.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  heroElo: {
    ...theme.typography.h1,
    color: '#111111',
  },
  heroBandText: {
    ...theme.typography.label,
    color: '#222222',
  },
  heroFootText: {
    ...theme.typography.caption,
    color: '#334D5B',
    marginTop: theme.space.sm,
  },
  heroStreakBadgeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  quickActions: {
    flexDirection: 'row',
    gap: theme.space.xs,
    marginBottom: theme.space.md,
  },
  quickActionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 108,
    borderRadius: 24,
    paddingVertical: theme.space.sm,
  },
  quickIconWrapBlue: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.xs,
  },
  quickIconWrapRose: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFEFF0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.xs,
  },
  quickIconWrapGreen: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E8F8EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.xs,
  },
  quickIconText: {
    fontSize: 20,
    lineHeight: 22,
  },
  quickLabel: {
    ...theme.typography.label,
    color: theme.color.text.primary,
  },
  sectionTitle: {
    ...theme.typography.h2,
    color: theme.color.text.primary,
    marginBottom: theme.space.sm,
    paddingHorizontal: theme.space.xs,
  },
  rankingEntryCard: {
    marginHorizontal: theme.space.xs,
    borderRadius: theme.radius.xl,
  },
  rankingEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  rankingEntryTitle: {
    ...theme.typography.h3,
    color: theme.color.text.primary,
  },
  rankingEntryDesc: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: 2,
  },
  recentRow: {
    marginTop: theme.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.xs,
  },
  recentMoreText: {
    ...theme.typography.label,
    color: '#008A46',
  },
  pathText: {
    ...theme.typography.label,
    color: '#446273',
    marginBottom: theme.space.sm,
  },
  listContent: {
    paddingBottom: theme.space.xxl,
  },
  dirSection: {
    marginBottom: theme.space.md,
    gap: theme.space.sm,
  },
  rootRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xs,
  },
  rootRowSpacer: {
    width: '48.5%',
  },
  dirCard: {
    borderRadius: theme.radius.xl,
  },
  dirCardRoot: {
    width: '47.5%',
    minHeight: 92,
    paddingVertical: theme.space.sm,
  },
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  dirLeft: {
    flex: 1,
  },
  dirText: {
    ...theme.typography.h3,
    color: theme.color.text.primary,
  },
  dirSubText: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: 2,
  },
  leafFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.xs,
  },
  fileRow: {
    gap: theme.space.sm,
    marginBottom: theme.space.sm,
  },
  fileCard: {
    flex: 1,
    borderRadius: theme.radius.xl,
  },
  thumbFrame: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5FBFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border.soft,
    paddingVertical: theme.space.xs,
  },
  thumb: {
    width: '86%',
    height: '86%',
  },
  thumbPlaceholder: {
    width: '86%',
    height: '86%',
    backgroundColor: '#ECF5F9',
    borderRadius: theme.radius.md,
  },
  fileMeta: {
    paddingHorizontal: theme.space.sm,
    paddingTop: theme.space.xs,
    paddingBottom: theme.space.sm,
    gap: theme.space.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  fileText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
  },
  moreBtn: {
    marginTop: theme.space.sm,
    borderRadius: theme.radius.pill,
    marginHorizontal: theme.space.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.color.bg.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: theme.radius.xxl,
    padding: theme.space.lg,
  },
  modalTitle: {
    ...theme.typography.h3,
    color: theme.color.text.primary,
  },
  modalDesc: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: theme.space.xxs,
  },
  modalPathRow: {
    marginTop: theme.space.md,
    marginBottom: theme.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  modalPathText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    flex: 1,
  },
  modalList: {
    maxHeight: 280,
  },
  modalItem: {
    marginBottom: theme.space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  modalItemText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    flex: 1,
  },
  modalItemLocked: {
    opacity: 0.7,
  },
  levelChallengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.sm,
  },
  levelChallengeLeft: {
    flex: 1,
    minWidth: 0,
  },
  levelChallengeTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
    paddingLeft: 2,
  },
  levelChallengeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  levelChallengeItem: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  recentRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  ratingRecentItem: {
    minHeight: 40,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.md,
  },
  ratingMenuCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radius.xxl,
    padding: theme.space.md,
    gap: theme.space.xs,
  },
  ratingMenuBtn: {
    borderRadius: theme.radius.lg,
  },
  modalEmpty: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: theme.space.sm,
  },
  modalStartBtn: {
    marginTop: theme.space.md,
    borderRadius: theme.radius.pill,
  },
  modalCloseBtn: {
    marginTop: theme.space.sm,
    borderRadius: theme.radius.pill,
  },
  rankingTabRow: {
    marginTop: theme.space.sm,
    flexDirection: 'row',
    gap: theme.space.xs,
    alignItems: 'center',
  },
  rankingMetaRow: {
    marginTop: theme.space.xs,
    flexDirection: 'row',
    gap: theme.space.xs,
    alignItems: 'center',
  },
  rankingTabBtn: {
    minWidth: 74,
  },
  rankingPageWrap: {
    flex: 1,
    backgroundColor: '#F3FCEE',
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.md,
    gap: theme.space.sm,
  },
  rankingPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  rankingHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  rankingSyncIconBtn: {
    minWidth: 64,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4FF',
    borderWidth: 1,
    borderColor: '#BFD9FF',
  },
  rankingSyncIconText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#2A6CB8',
    fontWeight: '800',
  },
  rankingMetaCard: {
    borderRadius: theme.radius.xl,
  },
  rankingList: {
    flex: 1,
  },
  rankingRowCard: {
    marginBottom: theme.space.xs,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rankingRowCardMine: {
    borderColor: '#7AC09C',
    borderWidth: 1,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  rankingRank: {
    ...theme.typography.label,
    width: 24,
    color: theme.color.text.primary,
    textAlign: 'center',
  },
  rankingName: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    flex: 1,
  },
  rankingMedal: {
    fontSize: 16,
    lineHeight: 20,
  },
  rankingValueText: {
    ...theme.typography.h3,
    color: '#1A3948',
    minWidth: 64,
    textAlign: 'right',
  },
  profileLabel: {
    ...theme.typography.label,
    color: theme.color.text.primary,
    marginTop: theme.space.xs,
    marginBottom: theme.space.xxs,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C8DED4',
    backgroundColor: '#F5FBF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellActive: {
    borderColor: '#00C853',
    backgroundColor: '#E6F8ED',
  },
  iconCellText: {
    fontSize: 22,
    lineHeight: 24,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: '#C8DED4',
    borderRadius: theme.radius.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    color: theme.color.text.primary,
    ...theme.typography.body,
  },
  profileButtons: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginTop: theme.space.md,
  },
  profileBtn: {
    flex: 1,
  },
});

