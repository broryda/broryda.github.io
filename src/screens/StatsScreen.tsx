import React, {useMemo, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import type {ProblemIndex} from '../models/problemIndex';
import type {StatsData} from '../data/statsStore';
import {theme} from '../design/theme';
import {Card} from '../components/ui/Card';
import {AppButton} from '../components/ui/AppButton';
import {Badge} from '../components/ui/Badge';
import {ALL_BADGES, getBadgeUnlockProgress} from '../core/badges';
import type {BadgeDef} from '../core/badges';
import {ProblemEngine} from '../core/problemEngine';
import {ratingToDisplayBand, roundRatingToHundreds} from '../core/rating';
import {collectAllSgfCoords, viewportFromCoords} from '../core/sgf';
import {badgeImageById} from '../assets/badges';
import {sgfAssetPathFromProblemPath} from '../data/problemIndexer';

type Props = {
  index: ProblemIndex;
  stats: StatsData;
  onBack: () => void;
  onStartLevelChallenge: (
    levelKey: string,
    levelIndex: number,
    problemPaths: string[],
  ) => void;
};

type Agg = {
  total: number;
  solved: number;
  correct: number;
  wrong: number;
  totalSec: number;
};

type TreeNode = {
  key: string;
  name: string;
  agg: Agg;
  children: Record<string, TreeNode>;
};

function emptyAgg(): Agg {
  return {total: 0, solved: 0, correct: 0, wrong: 0, totalSec: 0};
}

function addAgg(dst: Agg, src: Partial<Agg>): void {
  dst.total += src.total ?? 0;
  dst.solved += src.solved ?? 0;
  dst.correct += src.correct ?? 0;
  dst.wrong += src.wrong ?? 0;
  dst.totalSec += src.totalSec ?? 0;
}

function fmtSec(sec: number): string {
  const rounded = Math.max(0, Math.round(sec * 10) / 10);
  if (rounded < 60) return `${rounded.toFixed(1)}초`;
  const min = Math.floor(rounded / 60);
  const rest = rounded - min * 60;
  return `${min}분 ${rest.toFixed(1)}초`;
}

function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function ensureChild(parent: TreeNode, fullKey: string, name: string): TreeNode {
  if (!parent.children[fullKey]) {
    parent.children[fullKey] = {
      key: fullKey,
      name,
      agg: emptyAgg(),
      children: {},
    };
  }
  return parent.children[fullKey];
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

function ProgressBar({value}: {value: number}): React.JSX.Element {
  const width = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, {width: `${width}%`}]} />
    </View>
  );
}

function badgeMedalTone(
  badge: BadgeDef,
  unlocked: boolean,
): {outer: string; inner: string; border: string; text: string; ribbonL: string; ribbonR: string} {
  if (!unlocked) {
    return {
      outer: '#E5EAEE',
      inner: '#F2F5F7',
      border: '#C9D4DC',
      text: '#9AAAB7',
      ribbonL: '#DCE3E8',
      ribbonR: '#D3DCE3',
    };
  }
  if (badge.category === 'solve') {
    return {
      outer: '#F0C470',
      inner: '#FFDFA4',
      border: '#D1983B',
      text: '#6B4610',
      ribbonL: '#58A7E8',
      ribbonR: '#2F86D0',
    };
  }
  if (badge.category === 'marathon') {
    return {
      outer: '#A8BBFF',
      inner: '#D3DEFF',
      border: '#7189E5',
      text: '#2D3F99',
      ribbonL: '#7FDCCB',
      ribbonR: '#4AC9B2',
    };
  }
  if (badge.category === 'collection') {
    return {
      outer: '#D9B083',
      inner: '#EFD3B5',
      border: '#AE7A47',
      text: '#5F3A17',
      ribbonL: '#E97279',
      ribbonR: '#D74D56',
    };
  }
  return {
    outer: '#95D8AE',
    inner: '#C9F0D8',
    border: '#52AB78',
    text: '#1F6C40',
    ribbonL: '#7CCEF0',
    ribbonR: '#4FAED9',
  };
}

function BadgeMedal({
  badge,
  unlocked,
  size = 'md',
}: {
  badge: BadgeDef;
  unlocked: boolean;
  size?: 'sm' | 'md';
}): React.JSX.Element {
  const tone = badgeMedalTone(badge, unlocked);
  const compact = size === 'sm';
  const source = badgeImageById[badge.id];
  return (
    <View style={[styles.medalWrap, compact && styles.medalWrapSm]}>
      <View style={[styles.medalRibbon, styles.medalRibbonLeft, compact && styles.medalRibbonSm, {backgroundColor: tone.ribbonL}]} />
      <View style={[styles.medalRibbon, styles.medalRibbonRight, compact && styles.medalRibbonSm, {backgroundColor: tone.ribbonR}]} />
      <View style={[styles.medalOuter, compact && styles.medalOuterSm, {backgroundColor: tone.outer, borderColor: tone.border}]}>
        {source ? (
          <Image
            source={source}
            style={[styles.badgeIconImage, compact && styles.badgeIconImageSm, !unlocked && styles.badgeIconImageLocked]}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.medalInner, compact && styles.medalInnerSm, {backgroundColor: tone.inner, borderColor: tone.border}]}>
            <Text style={[styles.medalText, compact && styles.medalTextSm, {color: tone.text}]} numberOfLines={1}>
              {unlocked ? badge.icon : 'LOCK'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function StatsScreen({index, stats, onBack, onStartLevelChallenge}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [marathonExpanded, setMarathonExpanded] = useState(false);
  const unlockedBadgeSet = useMemo(() => new Set(stats.badgesUnlocked ?? []), [stats.badgesUnlocked]);
  const badgeProgress = useMemo(() => {
    const raw = getBadgeUnlockProgress(stats);
    const validUnlocked = ALL_BADGES.filter(b => unlockedBadgeSet.has(b.id)).length;
    return {unlocked: validUnlocked, total: raw.total};
  }, [stats, unlockedBadgeSet]);
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
    for (const path of index.allFiles) {
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
      const selected: string[] = [...exact]
        .sort(() => Math.random() - 0.5)
        .slice(0, limit)
        .map(v => v.path);
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
  const pickLevelChallengeEligibleProblems = async (
    levelLabel: string,
    limit = 10,
  ): Promise<string[]> => {
    const pool = pickLevelChallengeProblems(levelLabel, 200);
    const out: string[] = [];
    for (const path of pool) {
      if (out.length >= limit) break;
      try {
        const sgfAsset = sgfAssetPathFromProblemPath(path, index);
        if (!sgfAsset) continue;
        const text = await RNFS.readFileAssets(sgfAsset, 'utf8');
        const en = new ProblemEngine(text);
        const vp = viewportFromCoords(collectAllSgfCoords(en.root), en.size, 1);
        const cols = vp.maxCol - vp.minCol + 1;
        const rows = vp.maxRow - vp.minRow + 1;
        if (cols >= 15 || rows >= 15) continue;
        out.push(path);
      } catch {
        // skip invalid/unreadable SGF
      }
    }
    return out;
  };
  const orderedBadges = useMemo(() => {
    return [...ALL_BADGES].sort((a, b) => {
      const aUnlocked = unlockedBadgeSet.has(a.id) ? 1 : 0;
      const bUnlocked = unlockedBadgeSet.has(b.id) ? 1 : 0;
      if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
      return a.id.localeCompare(b.id);
    });
  }, [unlockedBadgeSet]);

  const root = useMemo(() => {
    const r: TreeNode = {
      key: index.rootPath,
      name: '전체',
      agg: emptyAgg(),
      children: {},
    };

    for (const filePath of index.allFiles) {
      const rel = filePath.replace(`${index.rootPath}/`, '');
      const parts = rel.split('/').filter(Boolean);
      const folders = parts.slice(0, -1);

      addAgg(r.agg, {total: 1});
      let cursor = r;
      let key = index.rootPath;
      for (const folder of folders) {
        key = `${key}/${folder}`;
        cursor = ensureChild(cursor, key, decodeName(folder));
        addAgg(cursor.agg, {total: 1});
      }
    }

    for (const [problemPath, value] of Object.entries(stats.problems)) {
      const judged = value.correct + value.wrong;
      if (judged <= 0) continue;

      const rel = problemPath.replace(`${index.rootPath}/`, '');
      const parts = rel.split('/').filter(Boolean);
      const folders = parts.slice(0, -1);

      addAgg(r.agg, {
        solved: 1,
        correct: value.correct,
        wrong: value.wrong,
        totalSec: value.totalSec,
      });

      let cursor = r;
      let key = index.rootPath;
      for (const folder of folders) {
        key = `${key}/${folder}`;
        cursor = ensureChild(cursor, key, decodeName(folder));
        addAgg(cursor.agg, {
          solved: 1,
          correct: value.correct,
          wrong: value.wrong,
          totalSec: value.totalSec,
        });
      }
    }

    return r;
  }, [index, stats.problems]);

  const toggle = (key: string): void => {
    setExpanded(prev => ({...prev, [key]: !prev[key]}));
  };

  const renderNode = (node: TreeNode, depth: number): React.JSX.Element => {
    const judged = node.agg.correct + node.agg.wrong;
    const progress = node.agg.total > 0 ? (node.agg.solved * 100) / node.agg.total : 0;
    const accuracy = judged > 0 ? (node.agg.correct * 100) / judged : 0;
    const avgSec = judged > 0 ? node.agg.totalSec / judged : 0;

    const childList = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
    const hasChildren = childList.length > 0;
    const isOpen = !!expanded[node.key];

    return (
      <Card
        key={node.key}
        variant={depth === 0 ? 'soft' : 'base'}
        shadowType="soft"
        style={[styles.treeCard, depth > 0 && {marginLeft: depth * 10}]}> 
        <Pressable
          onPress={() => {
            if (hasChildren) toggle(node.key);
          }}
          style={styles.treeHeader}>
          <Text style={styles.treeTitle}>{`${hasChildren ? (isOpen ? '▼' : '▶') : '•'} ${node.name}`}</Text>
          <Badge label={`${node.agg.solved}/${node.agg.total}`} variant="info" size="sm" />
        </Pressable>

        <ProgressBar value={progress} />

        <View style={styles.metricRow}>
          <Badge label={`진행률 ${progress.toFixed(1)}%`} variant="info" size="sm" />
          <Badge label={`정답률 ${accuracy.toFixed(1)}%`} variant="success" size="sm" />
          <Badge label={`평균 ${fmtSec(avgSec)}`} variant="outline" size="sm" />
        </View>

        {hasChildren && isOpen ? (
          <View style={styles.childWrap}>{childList.map(ch => renderNode(ch, depth + 1))}</View>
        ) : null}
      </Card>
    );
  };

  const totalJudged = root.agg.correct + root.agg.wrong;
  const totalProgress = root.agg.total > 0 ? (root.agg.solved * 100) / root.agg.total : 0;
  const totalAccuracy = totalJudged > 0 ? (root.agg.correct * 100) / totalJudged : 0;
  const totalAvg = totalJudged > 0 ? root.agg.totalSec / totalJudged : 0;

  const marathonRows = Object.values(stats.marathonBest ?? {}).sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return a.collectionDir.localeCompare(b.collectionDir);
  });
  const marathonRowsFiltered = marathonRows.filter(
    row => !String(row.collectionDir).startsWith('레벨별도전/'),
  );
  const marathonRowsVisible = marathonExpanded
    ? marathonRowsFiltered
    : marathonRowsFiltered.slice(0, 3);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <Pressable onPress={onBack} style={styles.appIconWrap}>
            <Text style={styles.appIcon}>🦉</Text>
          </Pressable>
          <Text style={styles.appTitle}>사활문제집</Text>
        </View>
      </View>

      <Text style={styles.title}>내 통계</Text>

      <Card variant="emphasis" shadowType="focus" style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroTitle}>전체 진행률 {totalProgress.toFixed(0)}%</Text>
          </View>
          <View style={styles.heroIconBox}>
            <Text style={styles.heroIcon}>📈</Text>
          </View>
        </View>
        <ProgressBar value={totalProgress} />
        <View style={styles.heroMetricsGrid}>
          <View style={styles.heroMetricCell}>
            <Text style={styles.heroMetricLabel}>푼 문제</Text>
            <Text style={styles.heroMetricValue}>{`${root.agg.solved}/${root.agg.total}`}</Text>
          </View>
          <View style={styles.heroMetricCell}>
            <Text style={styles.heroMetricLabel}>정확도</Text>
            <Text style={styles.heroMetricValue}>{`${totalAccuracy.toFixed(1)}%`}</Text>
          </View>
          <View style={styles.heroMetricCell}>
            <Text style={styles.heroMetricLabel}>평균 풀이시간</Text>
            <Text style={styles.heroMetricValue}>{fmtSec(totalAvg)}</Text>
          </View>
        </View>
        <View style={{marginTop: theme.space.xs}}>
          <Badge label={`연속학습 ${stats.streakCurrent ?? 0}일`} variant="success" size="sm" />
        </View>
      </Card>

      <Card variant="achievement" shadowType="soft" style={styles.marathonCard}>
        <View style={styles.marathonHead}>
          <Text style={styles.sectionTitle}>마라톤 최고기록</Text>
          <Badge label="기록" variant="streak" size="sm" />
        </View>
        {marathonRowsFiltered.length === 0 ? (
          <Badge label="기록 없음" variant="neutral" size="md" />
        ) : (
          marathonRowsVisible.map(row => {
            const name = decodeName(row.collectionDir.split('/').slice(-1)[0]);
            return (
              <Card key={row.collectionDir} variant="outlined" padded style={styles.marathonRowCard}>
                <Text style={styles.marathonTitle}>{name}</Text>
                <View style={styles.metricRow}>
                  <Badge
                    label={`정답률 ${(row.accuracy * 100).toFixed(1)}% (${row.correct}/${row.total})`}
                    variant="success"
                    size="sm"
                  />
                  <Badge label={`소요 ${fmtSec(row.elapsedSec)}`} variant="outline" size="sm" />
                </View>
              </Card>
            );
          })
        )}
        {marathonRowsFiltered.length > 3 ? (
          <AppButton
            label={marathonExpanded ? '접기' : '더 보기'}
            variant="neutral"
            size="sm"
            onPress={() => setMarathonExpanded(v => !v)}
            style={styles.marathonMoreBtn}
          />
        ) : null}
      </Card>

      <Card variant="soft" shadowType="soft" style={styles.marathonCard}>
        <View style={styles.marathonHead}>
          <Text style={styles.sectionTitle}>레벨별 도전</Text>
        </View>
        <View style={styles.badgePreviewGrid}>
          {levelOrder.slice(0, 4).map((level, idx) => {
            const unlocked = idx <= challengeStats.unlockedMaxIndex;
            const attempts = challengeStats.attempts[level] ?? 0;
            const success = challengeStats.successes[level] ?? 0;
            return (
              <Card key={`level-${level}`} variant={unlocked ? 'base' : 'outlined'} style={styles.levelRowCard}>
                <View style={styles.treeHeader}>
                  <Text style={styles.levelTitle}>{level}</Text>
                  <Badge label={unlocked ? '해제' : '잠금'} variant={unlocked ? 'success' : 'outline'} size="sm" />
                </View>
                <View style={styles.metricRow}>
                  <Badge label={`시도 ${attempts}`} variant="info" size="sm" />
                  <Badge label={`성공 ${success}`} variant="success" size="sm" />
                </View>
              </Card>
            );
          })}
        </View>
        <AppButton label="레벨 확인" variant="secondary" size="md" onPress={() => setLevelModalOpen(true)} />
      </Card>

      <Card variant="soft" shadowType="soft" style={styles.badgeCard}>
        <View style={styles.badgeHeader}>
          <Text style={styles.sectionTitle}>배지모음</Text>
          <Badge label={`${badgeProgress.unlocked}/${badgeProgress.total}`} variant="streak" size="sm" />
        </View>
        <View style={styles.badgePreviewGrid}>
          {orderedBadges.slice(0, 8).map(badge => {
            const unlocked = unlockedBadgeSet.has(badge.id);
            return (
              <View
                key={`badge-preview-${badge.id}`}
                style={[styles.badgePreviewItem, !unlocked && styles.badgePreviewItemLocked]}>
                <BadgeMedal badge={badge} unlocked={unlocked} size="md" />
                <Text style={styles.badgePreviewText} numberOfLines={1}>
                  {badge.name}
                </Text>
              </View>
            );
          })}
        </View>
        <AppButton label="배지 확인" variant="secondary" size="md" onPress={() => setBadgeModalOpen(true)} />
      </Card>

      <Modal
        animationType="slide"
        transparent
        visible={badgeModalOpen}
        onRequestClose={() => setBadgeModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>배지모음</Text>
              <Badge label={`${badgeProgress.unlocked}/${badgeProgress.total}`} variant="streak" size="md" />
            </View>
            <ScrollView style={styles.modalList}>
              <View style={styles.badgeListCol}>
                {orderedBadges.map(badge => {
                  const unlocked = unlockedBadgeSet.has(badge.id);
                  return (
                    <Card
                      key={`badge-modal-${badge.id}`}
                      variant={unlocked ? 'achievement' : 'outlined'}
                      shadowType="none"
                      style={[styles.badgeModalRow, !unlocked && styles.badgePreviewItemLocked]}>
                      <View style={styles.badgeModalRowHead}>
                        <BadgeMedal badge={badge} unlocked={unlocked} size="md" />
                        <View style={styles.badgeModalTextWrap}>
                          <Text style={styles.badgeModalTitle}>{badge.name}</Text>
                          <Text style={styles.badgeModalDesc}>{badge.description}</Text>
                        </View>
                        <Badge
                          label={unlocked ? '획득' : '잠김'}
                          variant={unlocked ? 'success' : 'outline'}
                          size="sm"
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            </ScrollView>
            <AppButton
              label="닫기"
              variant="neutral"
              size="md"
              onPress={() => setBadgeModalOpen(false)}
            />
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={levelModalOpen}
        onRequestClose={() => setLevelModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card variant="base" shadowType="floating" style={styles.modalCard}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>레벨별 도전</Text>
              <Badge label={`해제 ${Math.min(levelOrder.length, (challengeStats.unlockedMaxIndex ?? 0) + 1)}/${levelOrder.length}`} variant="info" size="md" />
            </View>
            <ScrollView style={styles.modalList}>
              {levelOrder.map((level, idx) => {
                const unlocked = idx <= challengeStats.unlockedMaxIndex;
                const attempts = challengeStats.attempts[level] ?? 0;
                const success = challengeStats.successes[level] ?? 0;
                return (
                  <Card
                    key={`level-all-${level}`}
                    variant={unlocked ? 'base' : 'outlined'}
                    pressable={unlocked}
                    onPress={async () => {
                      if (!unlocked) return;
                      const picked = await pickLevelChallengeEligibleProblems(level, 10);
                      if (picked.length === 0) return;
                      setLevelModalOpen(false);
                      onStartLevelChallenge(level, idx, picked);
                    }}
                    style={styles.levelModalRow}>
                    <View style={styles.treeHeader}>
                      <Text style={styles.levelTitle}>{level}</Text>
                      <Badge label={unlocked ? '해제' : '잠금'} variant={unlocked ? 'success' : 'outline'} size="sm" />
                    </View>
                    <View style={styles.metricRow}>
                      <Badge label={`시도 ${attempts}`} variant="info" size="sm" />
                      <Badge label={`성공 ${success}`} variant="success" size="sm" />
                    </View>
                  </Card>
                );
              })}
            </ScrollView>
            <AppButton label="닫기" variant="neutral" size="md" onPress={() => setLevelModalOpen(false)} />
          </Card>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#F3FCEE',
  },
  container: {
    padding: theme.space.md,
    paddingBottom: theme.space.xxxl,
    gap: theme.space.sm,
  },
  appBar: {
    minHeight: 56,
    justifyContent: 'center',
    marginBottom: theme.space.xs,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  appIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DDF2E6',
    borderWidth: 1,
    borderColor: '#A9CEB1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  appTitle: {
    ...theme.typography.h2,
    color: '#0C9A52',
  },
  title: {
    ...theme.typography.display,
    color: theme.color.text.primary,
    marginBottom: theme.space.sm,
  },
  heroCard: {
    marginBottom: theme.space.sm,
    borderRadius: theme.radius.xxl,
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE9DB',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.sm,
    gap: theme.space.sm,
  },
  heroTitle: {
    ...theme.typography.h1,
    color: theme.color.text.primary,
    marginTop: 2,
  },
  heroIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF6EF',
    borderWidth: 1,
    borderColor: '#D0E9D8',
  },
  heroIcon: {
    fontSize: 26,
    lineHeight: 28,
  },
  heroMetricsGrid: {
    marginTop: theme.space.xs,
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  heroMetricCell: {
    flex: 1,
  },
  heroMetricLabel: {
    ...theme.typography.micro,
    color: theme.color.text.secondary,
    marginBottom: 2,
  },
  heroMetricValue: {
    ...theme.typography.titleSm,
    color: theme.color.text.primary,
    fontWeight: '700',
  },
  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: theme.space.xs,
    marginBottom: theme.space.xxs,
  },
  treeCard: {
    marginBottom: theme.space.xs,
    borderRadius: theme.radius.xl,
  },
  treeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.xs,
    gap: theme.space.sm,
  },
  treeTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
    flex: 1,
  },
  barTrack: {
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: '#E6EEE2',
    overflow: 'hidden',
    marginBottom: theme.space.xs,
  },
  barFill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: '#00C853',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
  },
  childWrap: {
    marginTop: theme.space.xs,
    gap: theme.space.xs,
  },
  marathonCard: {
    marginTop: theme.space.sm,
    borderRadius: theme.radius.xxl,
  },
  marathonHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.xs,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.color.text.primary,
  },
  marathonRowCard: {
    marginTop: theme.space.xs,
    borderRadius: theme.radius.lg,
  },
  marathonMoreBtn: {
    marginTop: theme.space.sm,
    alignSelf: 'flex-start',
  },
  marathonTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
    marginBottom: theme.space.xs,
  },
  badgeCard: {
    marginTop: theme.space.sm,
  },
  badgePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.space.xs,
    marginBottom: theme.space.sm,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.space.xs,
  },
  badgeListCol: {
    gap: theme.space.xs,
  },
  badgePreviewItem: {
    width: '22.5%',
    minHeight: 90,
    borderRadius: theme.radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE9DB',
    padding: theme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  badgePreviewItemLocked: {
    opacity: 0.5,
  },
  badgeModalRow: {
    borderRadius: theme.radius.lg,
  },
  badgeModalRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  badgeModalTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  badgeModalTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
  },
  medalWrap: {
    width: 46,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  medalWrapSm: {
    width: 36,
    height: 34,
  },
  medalRibbon: {
    position: 'absolute',
    top: 20,
    width: 12,
    height: 14,
    borderRadius: 3,
  },
  medalRibbonSm: {
    top: 16,
    width: 10,
    height: 11,
  },
  medalRibbonLeft: {
    left: 8,
    transform: [{rotate: '-9deg'}],
  },
  medalRibbonRight: {
    right: 8,
    transform: [{rotate: '9deg'}],
  },
  medalOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalOuterSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  medalInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  medalInnerSm: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  medalText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  medalTextSm: {
    fontSize: 7,
    lineHeight: 8,
  },
  badgeIconImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  badgeIconImageSm: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  badgeIconImageLocked: {
    opacity: 0.35,
  },
  badgePreviewText: {
    ...theme.typography.micro,
    color: theme.color.text.primary,
    textAlign: 'center',
  },
  badgeModalDesc: {
    ...theme.typography.caption,
    color: theme.color.text.secondary,
    lineHeight: 18,
  },
  badgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.space.sm,
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
    maxWidth: 520,
    maxHeight: '90%',
    borderRadius: theme.radius.xl,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  modalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...theme.typography.h3,
    color: theme.color.text.primary,
  },
  modalList: {
    maxHeight: 560,
  },
  levelRowCard: {
    width: '48%',
    borderRadius: theme.radius.lg,
    paddingLeft: theme.space.xs,
  },
  levelModalRow: {
    marginBottom: theme.space.xs,
    borderRadius: theme.radius.lg,
    paddingLeft: theme.space.xs,
  },
  levelTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
    flex: 1,
    paddingLeft: 2,
  },
});



