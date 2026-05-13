import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import RNFS from 'react-native-fs';
import {
  Alert,
  BackHandler,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GoBoard} from '../components/GoBoard';
import {Badge} from '../components/ui/Badge';
import {Card} from '../components/ui/Card';
import {AppButton} from '../components/ui/AppButton';
import {BoardState} from '../core/board';
import {formatProblemTitle} from '../core/problemTitle';
import {ProblemEngine, type EngineSnapshot} from '../core/problemEngine';
import {
  collectAllSgfCoords,
  sgfCoordToCoord,
  viewportFromCoords,
  type SgfNode,
} from '../core/sgf';
import {shouldExcludeFromRatingMode} from '../core/rating';
import {loadSettings, saveSettings, type AppSettings} from '../data/settingsStore';
import {sgfAssetPathFromProblemPath} from '../data/problemIndexer';
import {
  appendRatingRecent,
  clearRatingPending,
  markLastPlayed,
  recordResult,
  recordLevelChallengeResult,
  saveMarathonRecord,
  startRatingPending,
  toggleFavorite,
  type StatsData,
} from '../data/statsStore';
import {theme} from '../design/theme';
import type {ProblemIndex} from '../models/problemIndex';
import type {Coord} from '../types';

type Props = {
  problemPath: string;
  problemPathsInView?: string[];
  marathon?: {collectionDir: string; problemPaths: string[]};
  ratingMode?: {problemPool: string[]};
  levelChallenge?: {levelKey: string; levelIndex: number};
  index: ProblemIndex;
  stats: StatsData;
  onStatsChange: (next: StatsData) => void;
  onBack: (currentProblemPath: string) => void;
};

type ReviewPlacedMove = {color: 'B' | 'W'; rc: Coord};
const BOTTOM_AD_RESERVE = 72;

function buildSetupBoard(root: SgfNode, size: number): BoardState {
  const board = new BoardState(size);
  for (const s of root.getAll('AB')) {
    const rc = sgfCoordToCoord(s);
    if (rc) board.setAt(rc, 'B');
  }
  for (const s of root.getAll('AW')) {
    const rc = sgfCoordToCoord(s);
    if (rc) board.setAt(rc, 'W');
  }
  return board;
}

function elapsedSec1d(fromMs: number): number {
  const sec = (Date.now() - fromMs) / 1000;
  return Math.max(0.1, Math.round(sec * 10) / 10);
}

export function SolveScreen({
  problemPath,
  problemPathsInView,
  marathon,
  ratingMode,
  levelChallenge,
  index,
  stats,
  onStatsChange,
  onBack,
}: Props): React.JSX.Element {
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(96);
  const [controlsH, setControlsH] = useState(220);

  const [engine, setEngine] = useState<ProblemEngine | null>(null);
  const [engineVer, setEngineVer] = useState(0);
  const [status, setStatus] = useState('문제 로딩 중...');
  const [pending, setPending] = useState<Coord | null>(null);
  const [touchPreview, setTouchPreview] = useState<Coord | null>(null);
  const [hint, setHint] = useState<Coord[]>([]);
  const [sessionWrong, setSessionWrong] = useState(false);
  const [sessionJudged, setSessionJudged] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [currentPath, setCurrentPath] = useState(problemPath);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [settings, setSettings] = useState<AppSettings>({
    useConfirmButton: true,
    autoNextOnCorrect: true,
    profileName: '사용자',
    profileIcon: '🦉',
    deviceId: '',
    nicknamePromptDismissed: false,
  });

  const [reviewMode, setReviewMode] = useState(false);
  const [reviewStartColor, setReviewStartColor] = useState<'B' | 'W'>('B');
  const [reviewPlacedMoves, setReviewPlacedMoves] = useState<ReviewPlacedMove[]>([]);
  const [reviewCursor, setReviewCursor] = useState(0);
  const [reviewBoard, setReviewBoard] = useState<BoardState | null>(null);
  const [reviewLastMove, setReviewLastMove] = useState<Coord | null>(null);
  const [marathonStartedAt, setMarathonStartedAt] = useState<number | null>(null);
  const [marathonAttempted, setMarathonAttempted] = useState(0);
  const [marathonCorrect, setMarathonCorrect] = useState(0);
  const [solveHistory, setSolveHistory] = useState<EngineSnapshot[]>([]);
  const [solveMoves, setSolveMoves] = useState<Coord[]>([]);
  const [solveCursor, setSolveCursor] = useState(0);
  const [solvePlaybackMode, setSolvePlaybackMode] = useState(false);
  const [marathonFlash, setMarathonFlash] = useState<'correct' | 'wrong' | null>(null);
  const marathonMode = !!marathon;
  const ratingModeEnabled = !!ratingMode;
  const levelChallengeMode = !!levelChallenge;
  const challengeTimerEnabled = ratingModeEnabled || levelChallengeMode;
  const [ratingLeftSec, setRatingLeftSec] = useState(60);
  const [ratingExitArmed, setRatingExitArmed] = useState(false);
  const [ratingPracticeUnlocked, setRatingPracticeUnlocked] = useState(false);
  const [ratingExcludedPaths, setRatingExcludedPaths] = useState<Set<string>>(new Set());
  const [levelExcludedPaths, setLevelExcludedPaths] = useState<Set<string>>(new Set());
  const autoSkippingRef = useRef(false);

  const solved = (stats.problems[currentPath]?.correct ?? 0) > 0;
  const solvedNow = solved || status === 'success';
  const isFavorite = stats.favorites.includes(currentPath);
  const isBlackTurn = reviewStartColor === 'B';
  useEffect(() => {
    setCurrentPath(problemPath);
  }, [problemPath]);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!marathonMode) return;
    setMarathonStartedAt(Date.now());
    setMarathonAttempted(0);
    setMarathonCorrect(0);
  }, [marathonMode, marathon?.collectionDir]);

  useEffect(() => {
    if (!challengeTimerEnabled) return;
    setRatingLeftSec(60);
    setRatingExitArmed(false);
    setRatingPracticeUnlocked(false);
  }, [challengeTimerEnabled, currentPath]);

  useEffect(() => {
    if (ratingModeEnabled) return;
    setRatingExcludedPaths(new Set());
  }, [ratingModeEnabled]);

  useEffect(() => {
    if (levelChallengeMode) return;
    setLevelExcludedPaths(new Set());
  }, [levelChallengeMode]);

  useEffect(() => {
    markLastPlayed(currentPath)
      .then(onStatsChange)
      .catch(() => undefined);
  }, [currentPath, onStatsChange]);

  const bootKey = useMemo(() => `${currentPath}::${reloadTick}`, [currentPath, reloadTick]);
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const sgfAsset = sgfAssetPathFromProblemPath(currentPath, index);
        if (!sgfAsset) {
          throw new Error(`SGF asset mapping not found: ${currentPath}`);
        }
        const text = await RNFS.readFileAssets(sgfAsset, 'utf8');
        const en = new ProblemEngine(text);
        const base = buildSetupBoard(en.root, en.size);

        setEngine(en);
        setEngineVer(v => v + 1);
        setStatus('문제를 불러왔습니다.');
        setPending(null);
        setTouchPreview(null);
        setHint([]);
        setSessionWrong(false);
        setSessionJudged(ratingModeEnabled ? ratingPracticeUnlocked : false);
        setUsedHint(false);
        setStartedAt(Date.now());

        setReviewBoard(base);
        setReviewLastMove(null);
        setReviewStartColor(en.userColor);
        setReviewPlacedMoves([]);
        setReviewCursor(0);
        setReviewMode(false);
        setSolveHistory([en.snapshot()]);
        setSolveMoves([]);
        setSolveCursor(0);
        setSolvePlaybackMode(false);
        autoSkippingRef.current = false;
      } catch (e) {
        setStatus(`로딩 실패: ${String(e)}`);
      }
    };
    load().catch(() => undefined);
  }, [bootKey, currentPath, index, ratingModeEnabled, ratingPracticeUnlocked]);

  const viewport = useMemo(() => {
    if (!engine) return {minRow: 0, maxRow: 8, minCol: 0, maxCol: 8};
    return viewportFromCoords(collectAllSgfCoords(engine.root), engine.size, 1);
  }, [engine]);
  const viewportCols = viewport.maxCol - viewport.minCol + 1;
  const viewportRows = viewport.maxRow - viewport.minRow + 1;
  const challengeSkipBySize =
    levelChallengeMode && marathonMode && !!engine && !sessionJudged
      ? viewportCols >= 15 || viewportRows >= 15
      : false;
  const boardSize = useMemo(() => {
    const cols = viewport.maxCol - viewport.minCol + 1;
    const rows = viewport.maxRow - viewport.minRow + 1;
    const dx = Math.max(1, cols - 1);
    const dy = Math.max(1, rows - 1);
    const ratio = dy / dx;
    const reservedBottom = Math.max(theme.space.xs, insets.bottom + 6);
    const chromeGap = 28;
    const boardMaxHeight = Math.max(
      220,
      height - headerH - controlsH - reservedBottom - chromeGap - BOTTOM_AD_RESERVE,
    );
    const byHeight = Math.floor((boardMaxHeight - 58) / Math.max(0.72, ratio));
    const byWidth = Math.min(Math.max(340, width - 8), 460);
    return Math.max(240, Math.min(byWidth, byHeight));
  }, [
    insets.bottom,
    controlsH,
    headerH,
    height,
    viewport.maxCol,
    viewport.maxRow,
    viewport.minCol,
    viewport.minRow,
    width,
  ]);
  const boardMaxHeight = useMemo(
    () => {
      const reservedBottom = Math.max(theme.space.xs, insets.bottom + 6);
      const chromeGap = 28;
      return Math.max(
        220,
        height - headerH - controlsH - reservedBottom - chromeGap - BOTTOM_AD_RESERVE,
      );
    },
    [controlsH, headerH, height, insets.bottom],
  );
  const boardCardWidth = useMemo(
    () => Math.max(260, Math.min(width - theme.space.md * 2, boardSize + 8)),
    [boardSize, width],
  );
  const rotateBoard = false;

  const moveProblem = (delta: number): void => {
    if (marathonMode || ratingModeEnabled) return;
    const queue = problemPathsInView?.length ? problemPathsInView : null;
    const dir = currentPath.split('/').slice(0, -1).join('/');
    const files = queue ?? (index.dirFiles[dir] ?? []);
    const cur = files.indexOf(currentPath);
    if (cur < 0) return;
    const next = cur + delta;
    if (next < 0 || next >= files.length) {
      Alert.alert('안내', next < 0 ? '첫 문제입니다.' : '마지막 문제입니다.');
      return;
    }
    setCurrentPath(files[next]);
  };

  const pickRandomFrom = useCallback((pool: string[], excludedPath?: string): string | null => {
    if (pool.length === 0) return null;
    const candidates = excludedPath ? pool.filter(p => p !== excludedPath) : pool;
    const source = candidates.length > 0 ? candidates : pool;
    return source[Math.floor(Math.random() * source.length)];
  }, []);

  const pickRatingProblem = useCallback(
    (currentElo: number, excludedPath?: string): string | null => {
      if (!ratingMode || ratingMode.problemPool.length === 0) return null;
      const filteredPool = ratingMode.problemPool.filter(
        problemPath =>
          !shouldExcludeFromRatingMode(problemPath) &&
          !index.challengeTooLargeByProblemPath[problemPath] &&
          !ratingExcludedPaths.has(problemPath),
      );
      if (filteredPool.length === 0) return null;
      const sourcePool = filteredPool;
      const withDiff = sourcePool
        .filter(problemPath => !excludedPath || problemPath !== excludedPath)
        .map(problemPath => {
          const pr = index.ratingByProblemPath[problemPath];
          if (typeof pr !== 'number' || !Number.isFinite(pr)) return null;
          return {problemPath, diff: Math.abs(pr - currentElo)};
        })
        .filter((v): v is {problemPath: string; diff: number} => v !== null);

      const pickUniform = (arr: string[]): string | null => pickRandomFrom(arr);
      const band100 = withDiff.filter(v => v.diff <= 100).map(v => v.problemPath);
      const band200 = withDiff
        .filter(v => v.diff > 100 && v.diff <= 200)
        .map(v => v.problemPath);
      const band300 = withDiff
        .filter(v => v.diff > 200 && v.diff <= 300)
        .map(v => v.problemPath);
      const band400 = withDiff
        .filter(v => v.diff > 300 && v.diff <= 400)
        .map(v => v.problemPath);

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

      return pickUniform(withDiff.map(v => v.problemPath)) ?? pickRandomFrom(sourcePool, excludedPath);
    },
    [
      index.challengeTooLargeByProblemPath,
      index.ratingByProblemPath,
      pickRandomFrom,
      ratingExcludedPaths,
      ratingMode,
    ],
  );

  const startNextRatingProblem = useCallback(
    async (fromElo?: number): Promise<void> => {
      if (!ratingModeEnabled) return;
      const baseElo = typeof fromElo === 'number' && Number.isFinite(fromElo) ? fromElo : stats.eloRating;
      const nextPath = pickRatingProblem(baseElo ?? 300, currentPath);
      if (!nextPath) {
        Alert.alert('레이팅 모드', '출제 가능한 문제가 없습니다.', [
          {text: '확인', onPress: () => onBack(currentPath)},
        ]);
        return;
      }
      setRatingPracticeUnlocked(false);
      autoSkippingRef.current = true;
      setCurrentPath(nextPath);
    },
    [currentPath, onBack, pickRatingProblem, ratingModeEnabled, stats.eloRating],
  );

  useEffect(() => {
    if (!ratingModeEnabled || !engine || sessionJudged) return;
    if (!challengeSkipBySize) return;

    setRatingExcludedPaths(prev => {
      const next = new Set(prev);
      next.add(currentPath);
      return next;
    });
    startNextRatingProblem().catch(() => onBack(currentPath));
  }, [
    currentPath,
    engine,
    onBack,
    ratingModeEnabled,
    sessionJudged,
    startNextRatingProblem,
    viewport.maxCol,
    viewport.maxRow,
    viewport.minCol,
    viewport.minRow,
  ]);

  useEffect(() => {
    if (!levelChallengeMode || !marathonMode || !marathon || !engine || sessionJudged) return;
    if (!challengeSkipBySize) return;

    const all = marathon.problemPaths;
    let nextPath: string | null = null;
    setLevelExcludedPaths(prev => {
      const nextExcluded = new Set(prev);
      nextExcluded.add(currentPath);
      const source = all.filter(p => !nextExcluded.has(p));
      const idx = all.indexOf(currentPath);
      for (let step = 1; step <= all.length; step += 1) {
        const cand = all[(idx + step) % all.length];
        if (source.includes(cand)) {
          nextPath = cand;
          break;
        }
      }
      return nextExcluded;
    });
    if (!nextPath) {
      Alert.alert('레벨별 도전', '출제 가능한 문제가 없습니다.', [
        {text: '확인', onPress: () => onBack(currentPath)},
      ]);
      return;
    }
    autoSkippingRef.current = true;
    setCurrentPath(nextPath);
  }, [
    currentPath,
    engine,
    levelChallengeMode,
    marathon,
    marathonMode,
    onBack,
    sessionJudged,
    challengeSkipBySize,
  ]);

  const persistSettings = async (next: AppSettings): Promise<void> => {
    setSettings(next);
    await saveSettings(next);
  };

  const resetCurrentProblem = (): void => {
    setReloadTick(v => v + 1);
  };

  const applyReviewCursor = (
    nextCursor: number,
    sourceMoves: ReviewPlacedMove[] = reviewPlacedMoves,
  ): void => {
    if (!engine) return;
    const clamped = Math.max(0, Math.min(nextCursor, sourceMoves.length));
    const board = buildSetupBoard(engine.root, engine.size);
    let last: Coord | null = null;
    let applied = 0;

    for (let i = 0; i < clamped; i += 1) {
      const move = sourceMoves[i];
      if (!board.play(move.color, move.rc)) break;
      last = move.rc;
      applied += 1;
    }

    setReviewBoard(board);
    setReviewLastMove(last);
    setReviewCursor(applied);
  };

  useEffect(() => {
    if (!challengeTimerEnabled || sessionJudged) return;
    setRatingLeftSec(60);
    const started = startedAt;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remain = Math.max(0, 60 - elapsed);
      setRatingLeftSec(remain);
    }, 250);
    return () => clearInterval(timer);
  }, [challengeTimerEnabled, sessionJudged, startedAt, currentPath]);

  useEffect(() => {
    if (!ratingModeEnabled || !engine || sessionJudged) return;
    const problemRating = index.ratingByProblemPath[currentPath] ?? null;
    startRatingPending(currentPath, problemRating)
      .then(onStatsChange)
      .catch(() => undefined);
  }, [currentPath, engine, index.ratingByProblemPath, onStatsChange, ratingModeEnabled, sessionJudged]);

  useEffect(() => {
    if (ratingModeEnabled && !sessionJudged) return;
    clearRatingPending().then(onStatsChange).catch(() => undefined);
  }, [onStatsChange, ratingModeEnabled, sessionJudged]);

  useEffect(() => {
    if (!challengeTimerEnabled || !engine || sessionJudged) return;
    if (challengeSkipBySize) return;
    const timeout = setTimeout(() => {
      if (sessionJudged) return;
      if (autoSkippingRef.current) return;
      const handleTimeout = async (): Promise<void> => {
        setSessionWrong(true);
        setSessionJudged(true);
        setStatus('시간 초과');
        const problemRating = ratingModeEnabled ? index.ratingByProblemPath[currentPath] ?? null : null;
        const nextStats = await recordResult(currentPath, false, 60, problemRating, 1);
        if (ratingModeEnabled) {
          const afterRecent = await appendRatingRecent(currentPath, 'wrong');
          onStatsChange({...nextStats, ratingRecent: afterRecent.ratingRecent});
        } else {
          onStatsChange(nextStats);
        }
        if (ratingModeEnabled) {
          setRatingPracticeUnlocked(true);
        }
        setMarathonFlash('wrong');
        await new Promise<void>(resolve => setTimeout(() => resolve(), 700));
        setMarathonFlash(null);
        if (ratingExitArmed) {
          onBack(currentPath);
          return;
        }
        if (solvePlaybackMode) {
          return;
        }
        if (levelChallengeMode && marathonMode && marathon && marathon.problemPaths.length > 0) {
          const idx = marathon.problemPaths.indexOf(currentPath);
          const total = marathon.problemPaths.length;
          const attempted = marathonAttempted + 1;
          const correctCount = marathonCorrect;
          setMarathonAttempted(attempted);
          if (idx + 1 < total) {
            setCurrentPath(marathon.problemPaths[idx + 1]);
            return;
          }
          const elapsedSec = Math.max(
            0.1,
            Math.round(((Date.now() - (marathonStartedAt ?? Date.now())) / 1000) * 10) / 10,
          );
          let nextStatsAfterMode = stats;
          nextStatsAfterMode = await recordLevelChallengeResult(
            levelChallenge.levelKey,
            levelChallenge.levelIndex,
            correctCount >= 8,
          );
          onStatsChange(nextStatsAfterMode);
          const acc = total > 0 ? (correctCount / total) * 100 : 0;
          const passed = correctCount >= 8;
          Alert.alert(
            passed ? '도전 성공!' : '도전 실패ㅠ',
            `총 ${total}문제 중 ${correctCount}정답\n정답률 ${acc.toFixed(1)}%\n소요 시간 ${elapsedSec}초`,
            [{text: '확인', onPress: () => onBack(currentPath)}],
          );
        }
      };
      handleTimeout().catch(() => undefined);
    }, 60000);
    return () => clearTimeout(timeout);
  }, [
    currentPath,
    engine,
    index.ratingByProblemPath,
    onBack,
    onStatsChange,
    challengeTimerEnabled,
    levelChallenge,
    levelChallengeMode,
    marathon,
    marathonCorrect,
    marathonMode,
    marathonStartedAt,
    marathonAttempted,
    ratingModeEnabled,
    ratingExitArmed,
    sessionJudged,
    solvePlaybackMode,
    challengeSkipBySize,
  ]);

  const confirmMove = async (forcedMove?: Coord): Promise<void> => {
    if (!engine) return;
    if (autoSkippingRef.current) return;
    if (solvePlaybackMode) {
      setSolvePlaybackMode(false);
    }
    const rc = forcedMove ?? pending;
    if (!rc) return;
    const problemRating = ratingModeEnabled ? index.ratingByProblemPath[currentPath] ?? null : null;

    const showMarathonFlash = async (kind: 'correct' | 'wrong'): Promise<void> => {
      setMarathonFlash(kind);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 1000));
      setMarathonFlash(null);
    };

    const nextMarathon = async (correct: boolean): Promise<void> => {
      if (!marathon || marathon.problemPaths.length === 0) return;
      const idx = marathon.problemPaths.indexOf(currentPath);
      const total = marathon.problemPaths.length;
      const attempted = marathonAttempted + 1;
      const correctCount = marathonCorrect + (correct ? 1 : 0);
      setMarathonAttempted(attempted);
      setMarathonCorrect(correctCount);

      const nextIdx = idx + 1;
      if (nextIdx < total) {
        await showMarathonFlash(correct ? 'correct' : 'wrong');
        setCurrentPath(marathon.problemPaths[nextIdx]);
        return;
      }
      await showMarathonFlash(correct ? 'correct' : 'wrong');

      const elapsedSec = Math.max(
        0.1,
        Math.round(((Date.now() - (marathonStartedAt ?? Date.now())) / 1000) * 10) / 10,
      );
      const acc = total > 0 ? (correctCount / total) * 100 : 0;
      let nextStatsAfterMode = stats;
      let recordMsg = '';
      if (!levelChallenge) {
        const saved = await saveMarathonRecord(
          marathon.collectionDir,
          correctCount,
          total,
          elapsedSec,
        );
        nextStatsAfterMode = saved.data;
        recordMsg = saved.updated
          ? '최고 기록이 갱신되었습니다.'
          : '기존 최고 기록보다 정답률이 높지 않아 기록은 유지됩니다.';
      }
      if (levelChallenge) {
        nextStatsAfterMode = await recordLevelChallengeResult(
          levelChallenge.levelKey,
          levelChallenge.levelIndex,
          correctCount >= 8,
        );
      }
      onStatsChange(nextStatsAfterMode);

      const perProblemSec = total > 0 ? elapsedSec / total : 0;
      const challengeLine = levelChallenge
        ? `\n레벨별 도전 ${correctCount >= 8 ? '성공' : '실패'} (${correctCount}/10)`
        : '';
      const recordBlock = recordMsg ? `\n\n${recordMsg}` : '';
      const completedTitle = levelChallenge
        ? correctCount >= 8
          ? '도전 성공!'
          : '도전 실패ㅠ'
        : '마라톤 완료';
      Alert.alert(
        completedTitle,
        `총 ${total}문제 중 ${correctCount}정답\n정답률 ${acc.toFixed(1)}%\n소요 시간 ${elapsedSec}초 (문제당 평균 ${perProblemSec.toFixed(1)}초)${challengeLine}${recordBlock}`,
        [{text: '확인', onPress: () => onBack(currentPath)}],
      );
    };

    let nextCursor = solveCursor;
    let nextHistory = solveHistory.slice(0, solveCursor + 1);
    let nextMoves = solveMoves.slice(0, solveCursor);
    const appendSolveStep = (move: Coord): void => {
      nextHistory = [...nextHistory, engine.snapshot()];
      nextMoves = [...nextMoves, move];
      nextCursor = nextHistory.length - 1;
    };

    const r = engine.userPlay(rc, false);
    setPending(null);
    setTouchPreview(null);
    setHint([]);

    if (!r.ok) {
      setStatus(r.status);
      setEngineVer(v => v + 1);
      setSessionWrong(true);
      setSolvePlaybackMode(true);
      if (!usedHint && !sessionJudged) {
        const sec = elapsedSec1d(startedAt);
        const nextStats = await recordResult(
          currentPath,
          false,
          sec,
          problemRating,
          1,
        );
        const afterRecent = ratingModeEnabled
          ? await appendRatingRecent(currentPath, 'wrong')
          : null;
        onStatsChange(afterRecent ? {...nextStats, ratingRecent: afterRecent.ratingRecent} : nextStats);
        setSessionJudged(true);
        if (ratingModeEnabled) {
          setRatingPracticeUnlocked(true);
        }
        if (ratingModeEnabled) {
          await showMarathonFlash('wrong');
          if (ratingExitArmed) {
            onBack(currentPath);
            return;
          }
          return;
        }
      }
      if (marathonMode) {
        await nextMarathon(false);
        return;
      }
      Alert.alert('오답', '오답입니다. 문제 탐색 모드로 계속 진행합니다.');
      return;
    }

    appendSolveStep(rc);

    let finalResult: {ok: boolean; status: string} = r;
    let autoMoves: Coord[] = [];
    const autoResult = engine.finalizeAutoTurn();
    finalResult = autoResult;
    autoMoves = autoResult.autoMoves;
    for (const autoMove of autoMoves) {
      appendSolveStep(autoMove);
    }

    setSolveHistory(nextHistory);
    setSolveMoves(nextMoves);
    setSolveCursor(nextCursor);
    setStatus(finalResult.status);
    setEngineVer(v => v + 1);

    if (!finalResult.ok) {
      setSessionWrong(true);
      setSolvePlaybackMode(true);
      if (!usedHint && !sessionJudged) {
        const sec = elapsedSec1d(startedAt);
        const nextStats = await recordResult(
          currentPath,
          false,
          sec,
          problemRating,
          1,
        );
        const afterRecent = ratingModeEnabled
          ? await appendRatingRecent(currentPath, 'wrong')
          : null;
        onStatsChange(afterRecent ? {...nextStats, ratingRecent: afterRecent.ratingRecent} : nextStats);
        setSessionJudged(true);
        if (ratingModeEnabled) {
          setRatingPracticeUnlocked(true);
        }
        if (ratingModeEnabled) {
          await showMarathonFlash('wrong');
          if (ratingExitArmed) {
            onBack(currentPath);
            return;
          }
          return;
        }
      }
      if (marathonMode) {
        await nextMarathon(false);
        return;
      }
      Alert.alert('오답', '오답입니다. 문제 탐색 모드로 계속 진행합니다.');
      return;
    }

    if (finalResult.status === 'success') {
      const sec = elapsedSec1d(startedAt);
      let nextStats = stats;
      if (!sessionWrong && !sessionJudged && !usedHint) {
        nextStats = await recordResult(
          currentPath,
          true,
          sec,
          problemRating,
          1,
        );
        const afterRecent = ratingModeEnabled
          ? await appendRatingRecent(currentPath, 'correct')
          : null;
        onStatsChange(afterRecent ? {...nextStats, ratingRecent: afterRecent.ratingRecent} : nextStats);
        setSessionJudged(true);
        if (ratingModeEnabled) {
          setRatingPracticeUnlocked(true);
        }
      }
      if (ratingModeEnabled) {
        await showMarathonFlash('correct');
        if (ratingExitArmed) {
          onBack(currentPath);
          return;
        }
        if (!settings.autoNextOnCorrect) {
          return;
        }
        await startNextRatingProblem(nextStats.eloRating);
        return;
      }
      if (marathonMode) {
        await nextMarathon(true);
        return;
      }
      const p = nextStats.problems[currentPath];
      const attempts = p?.attempts ?? 0;
      const correctCount = p?.correct ?? 0;
      const acc = attempts > 0 ? (correctCount / attempts) * 100 : 0;
      const avg = attempts > 0 ? (p?.totalSec ?? 0) / attempts : 0;
      Alert.alert(
        '정답',
        `이번 문제 시간 ${sec}초\n누적 정답률 ${acc.toFixed(1)}% (${correctCount}/${attempts})\n누적 평균 시간 ${avg.toFixed(1)}초`,
        [
          {
            text: '확인',
            onPress: () => {
              if (settings.autoNextOnCorrect) {
                moveProblem(1);
              }
            },
          },
        ],
      );
    }
  };

  const exitRatingNowAsWrong = useCallback(async (): Promise<void> => {
    if (!ratingModeEnabled) {
      onBack(currentPath);
      return;
    }
    if (sessionJudged) {
      onBack(currentPath);
      return;
    }
    const sec = elapsedSec1d(startedAt);
    const problemRating = index.ratingByProblemPath[currentPath] ?? null;
    const nextStats = await recordResult(currentPath, false, sec, problemRating, 1);
    const afterRecent = await appendRatingRecent(currentPath, 'wrong');
    onStatsChange({...nextStats, ratingRecent: afterRecent.ratingRecent});
    await clearRatingPending();
    setSessionWrong(true);
    setSessionJudged(true);
    setRatingPracticeUnlocked(true);
    setStatus('레이팅 모드 중단(오답 처리)');
    onBack(currentPath);
  }, [currentPath, index.ratingByProblemPath, onBack, onStatsChange, ratingModeEnabled, sessionJudged, startedAt]);

  useEffect(() => {
    if (!ratingModeEnabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitRatingNowAsWrong().catch(() => onBack(currentPath));
      return true;
    });
    return () => sub.remove();
  }, [currentPath, exitRatingNowAsWrong, onBack, ratingModeEnabled]);

  const levelChallengeTitle = useMemo(() => {
    if (!levelChallengeMode) return null;
    const shown = Math.min(10, Math.max(1, marathonAttempted + 1));
    return `${shown}번`;
  }, [levelChallengeMode, marathonAttempted]);

  const titleText = ratingModeEnabled
    ? '레이팅 모드'
    : levelChallengeTitle ?? formatProblemTitle(currentPath, index);
  const boardToRender = reviewMode && reviewBoard ? reviewBoard : engine?.board;
  const lastMoveToRender = reviewMode && reviewBoard ? reviewLastMove : null;
  const visibleReviewMoves = reviewPlacedMoves.slice(0, reviewCursor);
  const reviewNextColor =
    reviewCursor % 2 === 0
      ? reviewStartColor
      : reviewStartColor === 'B'
        ? 'W'
        : 'B';
  const visibleSolveMoves = solveMoves.slice(0, solveCursor);
  const moveNumbers = reviewMode
    ? visibleReviewMoves.reduce<Record<string, number>>((acc, move, i) => {
        const rc = move.rc;
        acc[`${rc.row},${rc.col}`] = i + 1;
        return acc;
      }, {})
    : visibleSolveMoves.reduce<Record<string, number>>((acc, rc, i) => {
        acc[`${rc.row},${rc.col}`] = i + 1;
        return acc;
      }, {});
  const canSequenceNav = reviewMode || solvePlaybackMode;
  const canPrev = reviewMode ? reviewCursor > 0 : solveCursor > 0;
  const canNext = reviewMode
    ? reviewCursor < reviewPlacedMoves.length
    : solveCursor < solveHistory.length - 1;

  const moveSequence = (delta: number): void => {
    if (reviewMode) {
      applyReviewCursor(reviewCursor + delta);
      return;
    }
    if (!solvePlaybackMode || !engine) return;
    const next = solveCursor + delta;
    if (next < 0 || next >= solveHistory.length) return;
    const snap = solveHistory[next];
    if (!snap) return;
    engine.restoreSnapshot(snap);
    setEngineVer(v => v + 1);
    setPending(null);
    setHint([]);
    setSolveCursor(next);
  };

  return (
    <View style={styles.wrap}>
      <View
        style={styles.top}
        onLayout={e => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== headerH) setHeaderH(h);
        }}>
        <View style={styles.headerLeft}>
          <Text numberOfLines={1} style={styles.title}>
            {titleText}
          </Text>
          <View style={[styles.headerBadges, ratingModeEnabled && styles.headerBadgesRating]}>
            {ratingModeEnabled ? (
              <View style={styles.ratingBadgeCol}>
                <View style={styles.ratingBadgeRow}>
                  <View style={[styles.turnChip, isBlackTurn ? styles.turnChipBlack : styles.turnChipWhite]}>
                    <Text style={[styles.turnChipText, isBlackTurn ? styles.turnChipTextBlack : styles.turnChipTextWhite]}>
                      {isBlackTurn ? '흑선' : '백선'}
                    </Text>
                  </View>
                  <Badge label={`남은시간 ${ratingLeftSec}s`} variant="warning" size="sm" />
                </View>
                <View style={styles.ratingBadgeBelow}>
                  <Badge label={`레이팅 ${stats.eloRating ?? 300}`} variant="streak" size="sm" />
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.turnChip, isBlackTurn ? styles.turnChipBlack : styles.turnChipWhite]}>
                  <Text style={[styles.turnChipText, isBlackTurn ? styles.turnChipTextBlack : styles.turnChipTextWhite]}>
                    {isBlackTurn ? '흑선' : '백선'}
                  </Text>
                </View>
                {levelChallengeMode ? (
                  <Badge label={`남은시간 ${ratingLeftSec}s`} variant="warning" size="md" />
                ) : null}
                {solvedNow ? <Badge label="정답 완료" variant="success" size="md" /> : null}
                {usedHint ? <Badge label="힌트 사용" variant="warning" size="md" /> : null}
                {reviewMode ? <Badge label="놓아보기" variant="info" size="md" /> : null}
                {solvePlaybackMode ? <Badge label="수순 탐색" variant="streak" size="md" /> : null}
              </>
            )}
          </View>
        </View>

        <View style={[styles.topRight, !ratingModeEnabled && styles.topRightInline]}>
          {ratingModeEnabled ? (
            <View style={styles.ratingModeActionCol}>
              <AppButton
                label={ratingExitArmed ? '이번 문제 후 종료 예약됨' : '이번 문제 후 종료 예약'}
                variant={ratingExitArmed ? 'success' : 'neutral'}
                size="sm"
                onPress={() => setRatingExitArmed(v => !v)}
              />
              <View style={styles.ratingIconRow}>
                <Pressable
                  style={[styles.starBtn, styles.topIconSmall, isFavorite && styles.starBtnActive]}
                  onPress={async () => onStatsChange(await toggleFavorite(currentPath))}>
                  <Image
                    source={
                      isFavorite
                        ? require('../assets/ui/favorite_active.png')
                        : require('../assets/ui/favorite_default.png')
                    }
                    style={[styles.iconTile, styles.iconTileSmall]}
                    resizeMode="cover"
                  />
                </Pressable>
                <Pressable
                  style={[styles.gearBtn, styles.topIconSmall]}
                  onPress={() => setSettingsOpen(true)}>
                  <Image
                    source={require('../assets/ui/settings_tile.png')}
                    style={[styles.iconTile, styles.iconTileSmall]}
                    resizeMode="cover"
                  />
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Pressable
                style={[styles.starBtn, isFavorite && styles.starBtnActive]}
                onPress={async () => onStatsChange(await toggleFavorite(currentPath))}>
                <Image
                  source={
                    isFavorite
                      ? require('../assets/ui/favorite_active.png')
                      : require('../assets/ui/favorite_default.png')
                  }
                  style={styles.iconTile}
                  resizeMode="cover"
                />
              </Pressable>
              <Pressable style={styles.gearBtn} onPress={() => setSettingsOpen(true)}>
                <Image
                  source={require('../assets/ui/settings_tile.png')}
                  style={styles.iconTile}
                  resizeMode="cover"
                />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={styles.boardRegion}>
        <Card
          variant="board"
          shadowType="focus"
          padded={false}
          style={[styles.boardCard, {width: boardCardWidth}]}>
          <View
            style={styles.boardArea}>
            {engine && boardToRender ? (
              <GoBoard
                key={`board-${currentPath}`}
                boardSize={boardSize}
                boardMaxHeight={boardMaxHeight}
                board={boardToRender}
                viewport={viewport}
                rotate90={rotateBoard}
                lastMove={lastMoveToRender}
                pendingMove={reviewMode ? null : settings.useConfirmButton ? pending : null}
                previewMove={reviewMode || settings.useConfirmButton ? null : touchPreview}
                previewColor={engine?.userColor === 'W' ? 'W' : 'B'}
                hintMoves={reviewMode ? [] : hint}
                moveNumbers={moveNumbers}
                onPreviewCoord={rc => {
                  if (reviewMode || settings.useConfirmButton) return;
                  if (!rc) {
                    setTouchPreview(null);
                    return;
                  }
                  if (engine.board.getAt(rc) !== '.') {
                    setTouchPreview(null);
                    return;
                  }
                  setTouchPreview(rc);
                }}
                onTapCoord={rc => {
                  if (reviewMode) {
                    if (!reviewBoard || reviewBoard.getAt(rc) !== '.') return;
                    const nextMoves = [
                      ...reviewPlacedMoves.slice(0, reviewCursor),
                      {color: reviewNextColor, rc},
                    ];
                    setReviewPlacedMoves(nextMoves);
                    applyReviewCursor(reviewCursor + 1, nextMoves);
                    return;
                  }
                  if (solvePlaybackMode) {
                    setSolvePlaybackMode(false);
                  }

                  if (engine.board.getAt(rc) !== '.') return;
                  if (settings.useConfirmButton) {
                    setPending(rc);
                  } else {
                    confirmMove(rc).catch(() => undefined);
                  }
                }}
              />
            ) : null}

            {marathonFlash ? (
              <View style={styles.marathonFlashOverlay} pointerEvents="none">
                {marathonFlash === 'correct' ? (
                  <View style={styles.marathonFlashDonut} />
                ) : (
                  <Text style={styles.marathonFlashX}>✕</Text>
                )}
              </View>
            ) : null}
          </View>
        </Card>
      </View>

      <View
        style={[styles.bottomControls, {paddingBottom: Math.max(theme.space.xs, insets.bottom + 6)}]}
        onLayout={e => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== controlsH) setControlsH(h);
        }}>
        {!marathonMode && (!ratingModeEnabled || sessionJudged || solvePlaybackMode || reviewMode) ? (
          <View style={styles.row3}>
            <AppButton
              label="←"
              variant={!canSequenceNav || !canPrev ? 'neutral' : 'secondary'}
              size="lg"
              block
              disabled={!canSequenceNav || !canPrev}
              shadowType={!canSequenceNav || !canPrev ? 'none' : 'soft'}
              style={styles.rowBtn}
              textStyle={styles.seqArrowText}
              onPress={() => moveSequence(-1)}
            />
            <AppButton
              label={reviewMode ? '놓아보기 종료' : '놓아보기'}
              variant={reviewMode ? 'primary' : 'secondary'}
              size="lg"
              block
              shadowType={reviewMode ? 'focus' : 'soft'}
              style={styles.rowBtn}
              onPress={() => {
                const nextMode = !reviewMode;
                setReviewMode(nextMode);
                if (nextMode) {
                  applyReviewCursor(reviewCursor);
                }
              }}
            />
            <AppButton
              label="→"
              variant={!canSequenceNav || !canNext ? 'neutral' : 'secondary'}
              size="lg"
              block
              disabled={!canSequenceNav || !canNext}
              shadowType={!canSequenceNav || !canNext ? 'none' : 'soft'}
              style={styles.rowBtn}
              textStyle={styles.seqArrowText}
              onPress={() => moveSequence(1)}
            />
          </View>
        ) : null}

        {ratingModeEnabled && sessionJudged ? (
          <View style={styles.rowRatingRestart}>
            <AppButton
              label="다음문제"
              variant="secondary"
              size="lg"
              block
              shadowType="soft"
              onPress={() => {
                startNextRatingProblem().catch(() => undefined);
              }}
            />
          </View>
        ) : null}

        <View style={styles.row4}>
          <AppButton
            label="‹"
            variant="secondary"
            size="md"
            block
            disabled={marathonMode || ratingModeEnabled}
            style={[styles.rowBtn, styles.compactBtn, styles.compactBtnNarrow]}
            textStyle={[styles.compactIconText, styles.compactIconTextCentered]}
            onPress={() => moveProblem(-1)}
          />
          <AppButton
            label="↻"
            variant="secondary"
            size="md"
            block
            shadowType="soft"
            disabled={ratingModeEnabled && !sessionJudged}
            style={[styles.rowBtn, styles.compactBtn, styles.compactBtnWide]}
            textStyle={[styles.compactIconText, styles.compactIconTextCentered]}
            onPress={resetCurrentProblem}
          />
          <AppButton
            label="착수"
            variant="primary"
            size="md"
            block
            shadowType="focus"
            disabled={reviewMode || !settings.useConfirmButton || pending === null}
            style={[styles.rowBtn, styles.compactBtn, styles.compactBtnWide, styles.confirmInlineBtn]}
            textStyle={styles.confirmInlineText}
            onPress={() => {
              confirmMove().catch(() => undefined);
            }}
          />
          <AppButton
            label="?"
            variant="secondary"
            size="md"
            block
            disabled={levelChallengeMode || reviewMode || (ratingModeEnabled && !sessionJudged)}
            shadowType={
              levelChallengeMode || reviewMode || (ratingModeEnabled && !sessionJudged)
                ? 'none'
                : 'soft'
            }
            style={[styles.rowBtn, styles.compactBtn, styles.compactBtnNarrow]}
            textStyle={styles.compactIconText}
            onPress={() => {
              if (!engine) return;
              if (autoSkippingRef.current) return;
              const cands = engine.candidateUserMoves();
              if (cands.length > 0) {
                setUsedHint(true);
                setHint(cands);
              }
            }}
          />
          <AppButton
            label="›"
            variant="secondary"
            size="md"
            block
            shadowType="soft"
            disabled={marathonMode || ratingModeEnabled}
            style={[styles.rowBtn, styles.compactBtn, styles.compactBtnNarrow]}
            textStyle={[styles.compactIconText, styles.compactIconTextCentered]}
            onPress={() => moveProblem(1)}
          />
        </View>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={settingsOpen}
        onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="default" shadowType="focus" style={styles.modalCard}>
            <Text style={styles.modalTitle}>대국 설정</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingText}>착수 버튼 사용</Text>
              <Switch
                value={settings.useConfirmButton}
                onValueChange={v => {
                  persistSettings({...settings, useConfirmButton: v}).catch(() => undefined);
                  if (!v) {
                    setPending(null);
                  }
                  setTouchPreview(null);
                }}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>정답 시 다음문제 이동</Text>
              <Switch
                value={settings.autoNextOnCorrect}
                onValueChange={v => {
                  persistSettings({...settings, autoNextOnCorrect: v}).catch(() => undefined);
                }}
              />
            </View>

            <View style={styles.modalButtons}>
              <AppButton
                label="닫기"
                variant="neutral"
                size="md"
                onPress={() => setSettingsOpen(false)}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.md,
    gap: theme.space.md,
    backgroundColor: '#F3FCEE',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  headerLeft: {
    flex: 1,
    gap: theme.space.xs,
  },
  title: {
    ...theme.typography.h1,
    color: theme.color.text.primary,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
  },
  headerBadgesRating: {
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  ratingBadgeCol: {
    gap: 6,
    alignItems: 'flex-start',
  },
  ratingBadgeBelow: {
    marginTop: 2,
  },
  ratingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  turnChip: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  turnChipBlack: {
    backgroundColor: '#F7FBFD',
    borderColor: '#C7E0E8',
  },
  turnChipWhite: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  turnChipText: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '800',
  },
  turnChipTextBlack: {
    color: '#000000',
  },
  turnChipTextWhite: {
    color: '#FFFFFF',
  },
  topRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.space.xs,
    paddingTop: 0,
  },
  topRightInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingModeActionCol: {
    gap: theme.space.xs,
    alignItems: 'flex-end',
    width: 172,
  },
  ratingIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  topIconSmall: {
    width: 43,
    height: 43,
    borderRadius: 12,
  },
  starBtn: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  starBtnActive: {
    transform: [{scale: 1.02}],
  },
  gearBtn: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  iconTile: {
    width: 64,
    height: 64,
  },
  iconTileSmall: {
    width: 32,
    height: 32,
  },
  boardCard: {
    backgroundColor: 'transparent',
    borderRadius: theme.radius.xxl,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    overflow: 'visible',
    alignSelf: 'center',
  },
  boardRegion: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 0,
  },
  boardArea: {
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  bottomControls: {
    gap: theme.space.sm,
  },
  row3: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  row4: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  rowRatingRestart: {
    marginTop: theme.space.xs,
  },
  rowBtn: {
    flex: 1,
  },
  seqArrowText: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  compactBtn: {
    minHeight: 54,
    borderRadius: theme.radius.lg,
    minWidth: 0,
  },
  compactBtnNarrow: {
    flex: 1,
  },
  compactBtnWide: {
    flex: 1,
  },
  confirmInlineBtn: {
    borderWidth: 0,
  },
  confirmInlineText: {
    ...theme.typography.button,
    fontWeight: '800',
    includeFontPadding: false,
  },
  compactIconText: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  compactIconTextCentered: {
    marginTop: -2,
    textAlignVertical: 'center',
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
    maxWidth: 440,
    padding: theme.space.md,
    borderRadius: theme.radius.xl,
    gap: theme.space.sm,
  },
  modalTitle: {
    ...theme.typography.section,
    color: theme.color.text.primary,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
  },
  modalButtons: {
    marginTop: theme.space.xs,
  },
  marathonFlashOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '18%',
    alignItems: 'center',
  },
  marathonFlashDonut: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 24,
    borderColor: 'rgba(0,200,83,0.95)',
    backgroundColor: 'transparent',
  },
  marathonFlashX: {
    fontSize: 180,
    lineHeight: 180,
    fontWeight: '900',
    color: 'rgba(244,67,54,0.95)',
  },
});







