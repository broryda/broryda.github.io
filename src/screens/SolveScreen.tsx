import React, {useEffect, useMemo, useState} from 'react';
import RNFS from 'react-native-fs';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
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
import {loadSettings, saveSettings, type AppSettings} from '../data/settingsStore';
import {sgfAssetPathFromProblemPath} from '../data/problemIndexer';
import {
  markLastPlayed,
  recordResult,
  saveMarathonRecord,
  toggleFavorite,
  type StatsData,
} from '../data/statsStore';
import {theme} from '../design/theme';
import type {ProblemIndex} from '../models/problemIndex';
import type {Coord} from '../types';

type Props = {
  problemPath: string;
  marathon?: {collectionDir: string; problemPaths: string[]};
  index: ProblemIndex;
  stats: StatsData;
  onStatsChange: (next: StatsData) => void;
  onBack: (currentProblemPath: string) => void;
};

type ReviewPlacedMove = {color: 'B' | 'W'; rc: Coord};

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

export function SolveScreen({
  problemPath,
  marathon,
  index,
  stats,
  onStatsChange,
  onBack,
}: Props): React.JSX.Element {
  const {width} = useWindowDimensions();
  const boardSize = Math.min(Math.max(320, width - 16), 410);

  const [engine, setEngine] = useState<ProblemEngine | null>(null);
  const [engineVer, setEngineVer] = useState(0);
  const [status, setStatus] = useState('문제 로딩 중...');
  const [pending, setPending] = useState<Coord | null>(null);
  const [hint, setHint] = useState<Coord | null>(null);
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

  const solved = (stats.problems[currentPath]?.correct ?? 0) > 0;
  const solvedNow = solved || status === 'success';
  const isFavorite = stats.favorites.includes(currentPath);

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
        setHint(null);
        setSessionWrong(false);
        setSessionJudged(false);
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
      } catch (e) {
        setStatus(`로딩 실패: ${String(e)}`);
      }
    };
    load().catch(() => undefined);
  }, [bootKey, currentPath, index]);

  const viewport = useMemo(() => {
    if (!engine) return {minRow: 0, maxRow: 8, minCol: 0, maxCol: 8};
    return viewportFromCoords(collectAllSgfCoords(engine.root), engine.size, 1);
  }, [engine]);
  const rotateBoard = false;

  const moveProblem = (delta: number): void => {
    if (marathonMode) return;
    const dir = currentPath.split('/').slice(0, -1).join('/');
    const files = index.dirFiles[dir] ?? [];
    const cur = files.indexOf(currentPath);
    if (cur < 0) return;
    const next = cur + delta;
    if (next < 0 || next >= files.length) {
      Alert.alert('안내', next < 0 ? '첫 문제입니다.' : '마지막 문제입니다.');
      return;
    }
    setCurrentPath(files[next]);
  };

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

  const confirmMove = async (forcedMove?: Coord): Promise<void> => {
    if (!engine) return;
    if (solvePlaybackMode) {
      setSolvePlaybackMode(false);
    }
    const rc = forcedMove ?? pending;
    if (!rc) return;

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
        1,
        Math.floor((Date.now() - (marathonStartedAt ?? Date.now())) / 1000),
      );
      const acc = total > 0 ? (correctCount / total) * 100 : 0;
      const saved = await saveMarathonRecord(
        marathon.collectionDir,
        correctCount,
        total,
        elapsedSec,
      );
      onStatsChange(saved.data);

      const recordMsg = saved.updated
        ? '최고 기록이 갱신되었습니다.'
        : '기존 최고 기록보다 정답률이 높지 않아 기록은 유지됩니다.';
      Alert.alert(
        '마라톤 완료',
        `총 ${total}문제 중 ${correctCount}정답\n정답률 ${acc.toFixed(1)}%\n소요 시간 ${elapsedSec}초\n\n${recordMsg}`,
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
    setHint(null);

    if (!r.ok) {
      setStatus(r.status);
      setEngineVer(v => v + 1);
      setSessionWrong(true);
      setSolvePlaybackMode(true);
      if (!usedHint && !sessionJudged) {
        const sec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
        onStatsChange(await recordResult(currentPath, false, sec));
        setSessionJudged(true);
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
        const sec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
        onStatsChange(await recordResult(currentPath, false, sec));
        setSessionJudged(true);
      }
      if (marathonMode) {
        await nextMarathon(false);
        return;
      }
      Alert.alert('오답', '오답입니다. 문제 탐색 모드로 계속 진행합니다.');
      return;
    }

    if (finalResult.status === 'success') {
      const sec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      let nextStats = stats;
      if (!sessionWrong && !sessionJudged && !usedHint) {
        nextStats = await recordResult(currentPath, true, sec);
        onStatsChange(nextStats);
        setSessionJudged(true);
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

  const titleText = formatProblemTitle(currentPath, index);
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
    setHint(null);
    setSolveCursor(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.headerLeft}>
          <Text numberOfLines={1} style={styles.title}>
            {titleText}
          </Text>
          <View style={styles.headerBadges}>
            <Badge
              label={reviewStartColor === 'B' ? '흑선' : '백선'}
              variant="outline"
              size="md"
            />
            {solvedNow ? <Badge label="정답 완료" variant="success" size="md" /> : null}
            {reviewMode ? <Badge label="놓아보기" variant="info" size="md" /> : null}
            {solvePlaybackMode ? <Badge label="수순 탐색" variant="warning" size="md" /> : null}
          </View>
        </View>

        <View style={styles.topRight}>
          <Pressable
            style={[styles.starBtn, isFavorite && styles.starBtnActive]}
            onPress={async () => onStatsChange(await toggleFavorite(currentPath))}>
            <View style={styles.starInner}>
              <Text style={[styles.starText, isFavorite && styles.starTextActive]}>
                {isFavorite ? '★' : '☆'}
              </Text>
            </View>
          </Pressable>
          <AppButton
            label="설정"
            variant="secondary"
            size="md"
            onPress={() => setSettingsOpen(true)}
          />
        </View>
      </View>

      <Card variant="default" shadowType="soft" padded={false} style={styles.boardCard}>
        <View style={styles.boardArea}>
          {engine && boardToRender ? (
            <GoBoard
              key={`board-${engineVer}-${reviewMode ? 'review' : 'solve'}`}
              boardSize={boardSize}
              board={boardToRender}
              viewport={viewport}
              rotate90={rotateBoard}
              lastMove={lastMoveToRender}
              pendingMove={reviewMode ? null : settings.useConfirmButton ? pending : null}
              hintMove={reviewMode ? null : hint}
              moveNumbers={moveNumbers}
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

      <View style={styles.bottomControls}>
        {!marathonMode ? (
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
              shadowType="soft"
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

        <View style={styles.row5}>
          <AppButton
            label="‹"
            variant="secondary"
            size="md"
            block
            disabled={marathonMode}
            style={[styles.rowBtn, styles.compactBtn]}
            textStyle={[styles.compactIconText, styles.compactIconTextCentered]}
            onPress={() => moveProblem(-1)}
          />
          <AppButton
            label="↺"
            variant="secondary"
            size="md"
            block
            shadowType="soft"
            style={[styles.rowBtn, styles.compactBtn]}
            textStyle={[styles.compactIconText, styles.compactIconTextCentered]}
            onPress={resetCurrentProblem}
          />
          <AppButton
            label="착수"
            variant="primary"
            size="md"
            block
            shadowType="soft"
            disabled={reviewMode || !settings.useConfirmButton || pending === null}
            style={[styles.rowBtn, styles.compactBtn, styles.confirmCompactBtn]}
            onPress={() => {
              confirmMove().catch(() => undefined);
            }}
          />
          <AppButton
            label="?"
            variant="secondary"
            size="md"
            block
            disabled={reviewMode}
            shadowType={reviewMode ? 'none' : 'soft'}
            style={[styles.rowBtn, styles.compactBtn]}
            textStyle={styles.compactIconText}
            onPress={() => {
              if (!engine || sessionWrong) return;
              const cands = engine.candidateUserMoves();
              if (cands.length > 0) {
                setUsedHint(true);
                setHint(cands[0]);
              }
            }}
          />
          <AppButton
            label="›"
            variant="secondary"
            size="md"
            block
            shadowType="soft"
            disabled={marathonMode}
            style={[styles.rowBtn, styles.compactBtn]}
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
                  if (!v) setPending(null);
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
    paddingHorizontal: theme.space.sm,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
    gap: theme.space.sm,
    backgroundColor: theme.color.bg.page,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.space.sm,
  },
  headerLeft: {
    flex: 1,
    gap: theme.space.xs,
  },
  title: {
    ...theme.typography.titleLg,
    color: theme.color.text.primary,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  starBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg.surface,
    borderWidth: 2,
    borderColor: '#8FA19D',
  },
  starBtnActive: {
    backgroundColor: '#FFE082',
    borderColor: '#C49A35',
  },
  starInner: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starText: {
    fontSize: 30,
    lineHeight: 30,
    includeFontPadding: false,
    textAlign: 'center',
    color: theme.color.text.secondary,
  },
  starTextActive: {
    color: '#8E6800',
  },
  boardCard: {
    borderRadius: theme.radius.xl,
  },
  boardArea: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  bottomControls: {
    marginTop: 'auto',
    gap: theme.space.xs,
    paddingBottom: theme.space.xs,
  },
  row3: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  row2: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  row5: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  rowBtn: {
    flex: 1,
  },
  seqArrowText: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '900',
  },
  compactBtn: {
    minHeight: 48,
    borderRadius: theme.radius.sm,
  },
  confirmCompactBtn: {
    minHeight: 52,
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
    top: '16%',
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
