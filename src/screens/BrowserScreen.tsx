import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import {formatProblemTitle} from '../core/problemTitle';
import type {StatsData} from '../data/statsStore';
import type {ProblemIndex} from '../models/problemIndex';
import {theme} from '../design/theme';
import {Card} from '../components/ui/Card';
import {AppButton} from '../components/ui/AppButton';
import {Badge} from '../components/ui/Badge';

type Props = {
  index: ProblemIndex;
  stats: StatsData;
  initialDir?: string;
  suppressResumePrompt?: boolean;
  onOpenProblem: (problemPath: string, browserDir: string) => void;
  onOpenStats: (browserDir: string) => void;
  onOpenMarathon: (collectionDir: string, problemPaths: string[]) => void;
};

const PAGE_SIZE = 48;
const FAVORITES_DIR = 'assets/problem/즐겨찾기';
const WRONG_DIR = 'assets/problem/오답모음';
const WRONG_DIR_PREFIX = `${WRONG_DIR}/`;

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

export function BrowserScreen({
  index,
  stats,
  initialDir,
  suppressResumePrompt,
  onOpenProblem,
  onOpenStats,
  onOpenMarathon,
}: Props): React.JSX.Element {
  const [currentDir, setCurrentDir] = useState<string>(initialDir ?? index.rootPath);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [promptedPath, setPromptedPath] = useState<string | null>(null);
  const [suppressResumeDir, setSuppressResumeDir] = useState<string | null>(
    suppressResumePrompt ? initialDir ?? index.rootPath : null,
  );
  const [marathonOpen, setMarathonOpen] = useState(false);
  const [marathonDir, setMarathonDir] = useState<string | null>(null);

  useEffect(() => {
    if (!initialDir) return;
    setCurrentDir(initialDir);
    setVisible(PAGE_SIZE);
  }, [initialDir]);

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

  const navigateToDir = (nextDir: string): void => {
    setCurrentDir(nextDir);
    setVisible(PAGE_SIZE);
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
      base.unshift(FAVORITES_DIR);
      base.unshift(WRONG_DIR);
      return base;
    }
    if (currentDir === WRONG_DIR) {
      return wrongTopGroups;
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

  useEffect(() => {
    if (suppressResumeDir === currentDir) {
      return;
    }
    const last = stats.lastPlayedPath;
    if (!last) return;
    if (promptedPath === last) return;
    if (parentDir(last) !== currentDir) return;
    if (!filesAll.includes(last)) return;

    setPromptedPath(last);
    Alert.alert('이어풀기', '마지막으로 풀던 문제로 이동할까요?', [
      {text: '아니오', style: 'cancel'},
      {text: '예', onPress: () => onOpenProblem(last, currentDir)},
    ]);
  }, [
    currentDir,
    filesAll,
    onOpenProblem,
    promptedPath,
    stats.lastPlayedPath,
    suppressResumeDir,
  ]);

  const files = filesAll.slice(0, visible);
  const rootCollections = index.dirChildren[index.rootPath] ?? [];

  const collectFilesRecursive = (dir: string): string[] =>
    index.allFiles.filter(f => f.startsWith(`${dir}/`));
  const marathonChildren = marathonDir ? index.dirChildren[marathonDir] ?? [] : [];
  const marathonCurrentName = marathonDir
    ? decodeText(marathonDir.split('/').slice(-1)[0])
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
          ? '내장 문제집'
          : decodeText(currentDir.split('/').slice(-1)[0]);
  const isRoot = currentDir === index.rootPath;
  const solvedCountByDir = useMemo(() => {
    const out: Record<string, number> = {};
    const allDirs = Object.keys(index.dirChildren);
    for (const dir of allDirs) {
      const count = index.allFiles.reduce((acc, f) => {
        if (!f.startsWith(`${dir}/`)) return acc;
        return acc + ((stats.problems[f]?.correct ?? 0) > 0 ? 1 : 0);
      }, 0);
      out[dir] = count;
    }
    out[FAVORITES_DIR] = stats.favorites.length;
    out[WRONG_DIR] = wrongFiles.length;
    return out;
  }, [index.allFiles, index.dirChildren, stats.favorites.length, stats.problems, wrongFiles.length]);
  const totalCountByDir = useMemo(() => {
    const out: Record<string, number> = {};
    const allDirs = Object.keys(index.dirChildren);
    for (const dir of allDirs) {
      out[dir] = index.allFiles.reduce((acc, f) => (f.startsWith(`${dir}/`) ? acc + 1 : acc), 0);
    }
    out[FAVORITES_DIR] = stats.favorites.length;
    out[WRONG_DIR] = wrongFiles.length;
    return out;
  }, [index.allFiles, index.dirChildren, stats.favorites.length, wrongFiles.length]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>사활문제집</Text>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="문제통계"
          variant="secondary"
          size="md"
          style={styles.topBtn}
          onPress={() => onOpenStats(currentDir)}
        />
        {currentDir === index.rootPath ? (
          <AppButton
            label="마라톤"
            variant="secondary"
            size="md"
            style={styles.topBtn}
            onPress={() => {
              setMarathonDir(null);
              setMarathonOpen(true);
            }}
          />
        ) : null}
      </View>

      <Pressable onPress={moveUp} disabled={currentDir === index.rootPath}>
        <Text style={styles.pathText}>{currentDirName}</Text>
      </Pressable>

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
          const title = formatProblemTitle(item, index);

          return (
            <Card
              pressable
              onPress={() => onOpenProblem(item, currentDir)}
              variant="default"
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
            {dirs.map((d, i) => {
              const name = decodeText(d.split('/').slice(-1)[0]);
              const solvedCount = solvedCountByDir[d] ?? 0;
              const totalCount = totalCountByDir[d] ?? 0;
              const trailing =
                d === WRONG_DIR ? '✕' : d === FAVORITES_DIR ? '☆' : '›';
              const trailingStyle =
                d === WRONG_DIR ? styles.dirIconWrong : styles.dirIconNormal;
              return (
                <Card
                  key={d}
                  pressable
                  onPress={() => navigateToDir(d)}
                  variant="strong"
                  shadowType="soft"
                  style={[
                    styles.dirCard,
                    isRoot && (i % 2 === 0 ? styles.rootDirMint : styles.rootDirBlue),
                  ]}>
                  <View style={styles.dirRow}>
                    <View style={styles.dirLeft}>
                      <Text style={styles.dirText}>{name}</Text>
                      {isRoot && d !== WRONG_DIR && d !== FAVORITES_DIR ? (
                        <Text
                          style={
                            styles.dirSubText
                          }>{`${solvedCount}문제 완료 / 총 ${totalCount}문제`}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.dirIcon, trailingStyle]}>{trailing}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        }
        ListFooterComponent={
          filesAll.length > files.length ? (
            <AppButton
              label={`문제 더보기 (${files.length}/${filesAll.length})`}
              variant="neutral"
              size="md"
              onPress={() => setVisible(v => v + PAGE_SIZE)}
              style={styles.moreBtn}
            />
          ) : null
        }
      />

      <Modal
        animationType="fade"
        transparent
        visible={marathonOpen}
        onRequestClose={() => setMarathonOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="default" shadowType="focus" style={styles.modalCard}>
            <Text style={styles.modalTitle}>마라톤 문제집 선택</Text>
            <Text style={styles.modalDesc}>
              최종 리프 폴더를 선택해 1번부터 끝까지 연속으로 풉니다.
            </Text>

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
                const name = decodeText(item.split('/').slice(-1)[0]);
                return (
                  <Card
                    pressable
                    variant="outlined"
                    padded
                    style={styles.modalItem}
                    onPress={() => setMarathonDir(item)}>
                    <Text style={styles.modalItemText}>{name}</Text>
                    <Badge
                      label={`${collectFilesRecursive(item).length}문제`}
                      variant="info"
                      size="sm"
      />
                  </Card>
                );
              }}
              ListEmptyComponent={
                marathonDir ? (
                  <Text style={styles.modalEmpty}>
                    하위 폴더가 없습니다. 아래 버튼으로 시작하세요.
                  </Text>
                ) : null
              }
            />

            {canStartMarathonAtCurrent ? (
              <AppButton
                label={`"${marathonCurrentName}" 시작`}
                variant="primary"
                size="lg"
                shadowType="soft"
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
    paddingHorizontal: theme.space.sm,
    paddingTop: theme.space.sm,
    backgroundColor: theme.color.bg.page,
  },
  headerRow: {
    marginBottom: theme.space.xs,
  },
  title: {
    ...theme.typography.titleMd,
    color: theme.color.text.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space.xs,
    marginBottom: theme.space.sm,
  },
  topBtn: {
    borderRadius: 14,
    minHeight: 44,
  },
  pathText: {
    ...theme.typography.section,
    color: '#273332',
    marginBottom: theme.space.sm,
  },
  listContent: {
    paddingBottom: theme.space.xl,
  },
  dirSection: {
    marginBottom: theme.space.xs,
    gap: theme.space.xs,
  },
  dirCard: {
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
  },
  rootDirMint: {
    backgroundColor: '#CFE6E1',
    borderColor: '#B8D3CD',
  },
  rootDirBlue: {
    backgroundColor: '#D3E1EC',
    borderColor: '#BECFDC',
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
    ...theme.typography.section,
    color: theme.color.text.primary,
    fontSize: 36 / 2,
  },
  dirSubText: {
    marginTop: 2,
    ...theme.typography.body,
    color: '#2A3534',
    fontSize: 30 / 2,
  },
  dirIcon: {
    fontSize: 32 / 2,
    fontWeight: '700',
  },
  dirIconNormal: {
    color: '#7E8A89',
  },
  dirIconWrong: {
    color: '#E34B59',
  },
  fileRow: {
    justifyContent: 'space-between',
    gap: theme.space.xs,
  },
  fileCard: {
    width: '48.5%',
    marginBottom: theme.space.xs,
    borderRadius: theme.radius.lg,
  },
  thumbFrame: {
    width: '100%',
    height: 116,
    backgroundColor: '#FFFFFF',
    paddingVertical: theme.space.xs,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F8F8',
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
    minHeight: 22,
  },
  fileText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
  },
  moreBtn: {
    marginTop: theme.space.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.color.bg.overlay,
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  modalCard: {
    maxHeight: '82%',
    borderRadius: theme.radius.xl,
    padding: theme.space.md,
  },
  modalTitle: {
    ...theme.typography.section,
    color: theme.color.text.primary,
  },
  modalDesc: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: theme.space.xs,
  },
  modalPathRow: {
    marginTop: theme.space.sm,
    marginBottom: theme.space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  modalPathText: {
    flex: 1,
    ...theme.typography.body,
    color: theme.color.text.primary,
  },
  modalList: {
    marginTop: theme.space.xs,
  },
  modalItem: {
    marginBottom: theme.space.xs,
    gap: theme.space.xs,
  },
  modalItemText: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
  },
  modalEmpty: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    marginTop: theme.space.sm,
  },
  modalStartBtn: {
    marginTop: theme.space.sm,
  },
  modalCloseBtn: {
    marginTop: theme.space.xs,
  },
});
