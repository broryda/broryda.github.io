import React, {useEffect, useRef, useState} from 'react';
import {BackHandler, StyleSheet, Text, View} from 'react-native';
import {buildFromManifest} from './data/problemIndexer';
import {loadSettings} from './data/settingsStore';
import {settlePendingRatingAttempt, type StatsData} from './data/statsStore';
import {computeSolvedCount, submitRankingUpdate} from './data/rankingStore';
import {BrowserScreen} from './screens/BrowserScreen';
import {SolveScreen} from './screens/SolveScreen';
import {StatsScreen} from './screens/StatsScreen';
import type {ProblemIndex} from './models/problemIndex';

type Route =
  | {
      name: 'browser';
      initialDir?: string;
      suppressResumePrompt?: boolean;
      openRatingMenuOnEnter?: boolean;
    }
  | {name: 'stats'; browserDir: string}
  | {
      name: 'solve';
      problemPath: string;
      browserDir: string;
      problemPathsInView?: string[];
      marathon?: {collectionDir: string; problemPaths: string[]};
      ratingMode?: {problemPool: string[]};
      levelChallenge?: {levelKey: string; levelIndex: number};
      returnToRatingMenuOnBack?: boolean;
    };

export function RootApp(): React.JSX.Element {
  const [index, setIndex] = useState<ProblemIndex | null>(null);
  const [stats, setStats] = useState<StatsData>({
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
  });
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({name: 'browser'});
  const prevBadgesRef = useRef<Set<string>>(new Set());
  const lastSubmitRef = useRef<{
    solvedCount: number;
    elo: number;
    streakCurrent: number;
    nickname: string;
    deviceId: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const boot = async (): Promise<void> => {
      if (!mounted) return;
      setBootError(null);
      setBootProgress(10);
      const statsPromise = settlePendingRatingAttempt().then(value => {
        if (mounted) setBootProgress(p => Math.max(p, 45));
        return value;
      });
      const indexPromise = Promise.resolve()
        .then(() => buildFromManifest())
        .then(value => {
          if (mounted) setBootProgress(p => Math.max(p, 85));
          return value;
        });

      const [builtIndex, settled] = await Promise.all([indexPromise, statsPromise]);
      if (!mounted) return;
      setBootProgress(100);
      setIndex(builtIndex);
      setStats(settled);
      setBooting(false);
    };
    boot().catch(e => {
      if (mounted) {
        setBootError(String(e));
        setBootProgress(100);
        setBooting(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async (): Promise<void> => {
      const s = await loadSettings();
      if (!mounted || !s.deviceId) return;
      const solvedCount = computeSolvedCount(stats);
      const elo = stats.eloRating ?? 300;
      const streakCurrent = Math.max(0, stats.streakCurrent ?? 0);
      const nickname = s.profileName;
      const deviceId = s.deviceId;

      const prev = lastSubmitRef.current;
      if (
        prev &&
        prev.solvedCount === solvedCount &&
        prev.elo === elo &&
        prev.streakCurrent === streakCurrent &&
        prev.nickname === nickname &&
        prev.deviceId === deviceId
      ) {
        return;
      }
      lastSubmitRef.current = {solvedCount, elo, streakCurrent, nickname, deviceId};
      await submitRankingUpdate({
        deviceId,
        nickname,
        solvedCount,
        elo,
        streakCurrent,
      });
    };
    run().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [stats]);

  useEffect(() => {
    prevBadgesRef.current = new Set(stats.badgesUnlocked ?? []);
  }, [stats.badgesUnlocked]);

  useEffect(() => {
    if (route.name === 'browser') {
      return;
    }
    const onBack = (): boolean => {
      if (route.name === 'solve') {
        setRoute({
          name: 'browser',
          initialDir: route.browserDir,
          openRatingMenuOnEnter: !!route.returnToRatingMenuOnBack,
        });
        return true;
      }
      if (route.name === 'stats') {
        setRoute({name: 'browser', initialDir: route.browserDir});
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [route]);

  if (booting || !index) {
    return (
      <View style={styles.root}>
        <View style={styles.splash}>
          <Text style={styles.splashTitle}>사활문제집</Text>
          <Text style={styles.splashSub}>
            {bootError
              ? '초기화 실패: 앱을 다시 실행해주세요.'
              : `로딩 중... ${Math.max(0, Math.min(100, Math.round(bootProgress)))}%`}
          </Text>
          {bootError ? <Text style={styles.splashErr}>{bootError}</Text> : null}
          <View style={styles.splashBarTrack}>
            <View style={[styles.splashBarFill, {width: `${Math.max(0, Math.min(100, Math.round(bootProgress)))}%`}]} />
          </View>
        </View>
      </View>
    );
  }

  let screen: React.JSX.Element;
  if (route.name === 'stats') {
    screen = (
      <StatsScreen
        index={index}
        stats={stats}
        onBack={() => setRoute({name: 'browser', initialDir: route.browserDir})}
        onStartLevelChallenge={(levelKey, levelIndex, problemPaths) => {
          if (problemPaths.length === 0) return;
          setRoute({
            name: 'solve',
            problemPath: problemPaths[0],
            browserDir: index.rootPath,
            marathon: {collectionDir: `레벨별도전/${levelKey}`, problemPaths},
            levelChallenge: {levelKey, levelIndex},
          });
        }}
      />
    );
  } else if (route.name === 'solve') {
    screen = (
      <SolveScreen
        problemPath={route.problemPath}
        problemPathsInView={route.problemPathsInView}
        marathon={route.marathon}
        ratingMode={route.ratingMode}
        levelChallenge={route.levelChallenge}
        index={index}
        stats={stats}
        onStatsChange={setStats}
        onBack={_lastPath =>
          setRoute({
            name: 'browser',
            initialDir: route.browserDir,
            openRatingMenuOnEnter: !!route.returnToRatingMenuOnBack,
          })
        }
      />
    );
  } else {
    screen = (
      <BrowserScreen
        index={index}
        stats={stats}
        initialDir={route.initialDir}
        suppressResumePrompt={route.suppressResumePrompt}
        openRatingMenuOnEnter={route.openRatingMenuOnEnter}
        onOpenProblem={(problemPath, browserDir, problemPathsInView, options) =>
          setRoute({
            name: 'solve',
            problemPath,
            browserDir,
            problemPathsInView,
            returnToRatingMenuOnBack: !!options?.returnToRatingMenu,
          })
        }
        onOpenStats={browserDir => setRoute({name: 'stats', browserDir})}
        onOpenLevelChallenge={(levelKey, levelIndex, problemPaths) => {
          if (problemPaths.length === 0) return;
          setRoute({
            name: 'solve',
            problemPath: problemPaths[0],
            browserDir: index.rootPath,
            marathon: {collectionDir: `레벨별도전/${levelKey}`, problemPaths},
            levelChallenge: {levelKey, levelIndex},
          });
        }}
        onOpenMarathon={(collectionDir, problemPaths) =>
          setRoute({
            name: 'solve',
            problemPath: problemPaths[0],
            browserDir: collectionDir,
            marathon: {collectionDir, problemPaths},
          })
        }
        onOpenRatingMode={(problemPath, problemPool) =>
          setRoute({
            name: 'solve',
            problemPath,
            browserDir: index.rootPath,
            ratingMode: {
              problemPool,
            },
          })
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      {screen}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3FCEE',
  },
  splashTitle: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    color: '#133024',
  },
  splashSub: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: '#567064',
  },
  splashBarTrack: {
    width: 220,
    marginTop: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#DDE8E1',
    overflow: 'hidden',
  },
  splashBarFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#00C853',
  },
  splashErr: {
    marginTop: 8,
    maxWidth: 320,
    fontSize: 12,
    lineHeight: 16,
    color: '#8B2A2A',
    textAlign: 'center',
  },
});

