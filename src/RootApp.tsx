import React, {useEffect, useMemo, useState} from 'react';
import {BackHandler} from 'react-native';
import {buildFromManifest} from './data/problemIndexer';
import {loadStats, type StatsData} from './data/statsStore';
import {BrowserScreen} from './screens/BrowserScreen';
import {SolveScreen} from './screens/SolveScreen';
import {StatsScreen} from './screens/StatsScreen';

type Route =
  | {name: 'browser'; initialDir?: string; suppressResumePrompt?: boolean}
  | {name: 'stats'; browserDir: string}
  | {
      name: 'solve';
      problemPath: string;
      browserDir: string;
      marathon?: {collectionDir: string; problemPaths: string[]};
    };

function dirOf(problemPath: string): string {
  return problemPath.split('/').slice(0, -1).join('/');
}

export function RootApp(): React.JSX.Element {
  const index = useMemo(() => buildFromManifest(), []);
  const [stats, setStats] = useState<StatsData>({
    problems: {},
    favorites: [],
    lastSolvedPath: null,
    lastPlayedPath: null,
    marathonBest: {},
  });
  const [route, setRoute] = useState<Route>({name: 'browser'});

  useEffect(() => {
    loadStats().then(setStats).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (route.name === 'browser') {
      return;
    }
    const onBack = (): boolean => {
      if (route.name === 'solve') {
        setRoute({
          name: 'browser',
          initialDir: route.browserDir,
          suppressResumePrompt: true,
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

  if (route.name === 'stats') {
    return (
      <StatsScreen
        index={index}
        stats={stats}
        onBack={() => setRoute({name: 'browser', initialDir: route.browserDir})}
      />
    );
  }
  if (route.name === 'solve') {
    return (
      <SolveScreen
        problemPath={route.problemPath}
        marathon={route.marathon}
        index={index}
        stats={stats}
        onStatsChange={setStats}
        onBack={_lastPath =>
          setRoute({
            name: 'browser',
            initialDir: route.browserDir,
            suppressResumePrompt: true,
          })
        }
      />
    );
  }
  return (
    <BrowserScreen
      index={index}
      stats={stats}
      initialDir={route.initialDir}
      suppressResumePrompt={route.suppressResumePrompt}
      onOpenProblem={(problemPath, browserDir) =>
        setRoute({name: 'solve', problemPath, browserDir})
      }
      onOpenStats={browserDir => setRoute({name: 'stats', browserDir})}
      onOpenMarathon={(collectionDir, problemPaths) =>
        setRoute({
          name: 'solve',
          problemPath: problemPaths[0],
          browserDir: collectionDir,
          marathon: {collectionDir, problemPaths},
        })
      }
    />
  );
}
