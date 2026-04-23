import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {ProblemIndex} from '../models/problemIndex';
import type {StatsData} from '../data/statsStore';
import {theme} from '../design/theme';
import {Card} from '../components/ui/Card';
import {AppButton} from '../components/ui/AppButton';
import {Badge} from '../components/ui/Badge';

type Props = {
  index: ProblemIndex;
  stats: StatsData;
  onBack: () => void;
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
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}분 ${`${s % 60}`.padStart(2, '0')}초`;
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

function ProgressBar({value}: {value: number}): React.JSX.Element {
  const width = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, {width: `${width}%`}]} />
    </View>
  );
}

export function StatsScreen({index, stats, onBack}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

    const childList = Object.values(node.children).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const hasChildren = childList.length > 0;
    const isOpen = !!expanded[node.key];

    return (
      <Card
        key={node.key}
        variant={depth === 0 ? 'default' : 'outlined'}
        shadowType="soft"
        style={[styles.treeCard, depth > 0 && {marginLeft: depth * 12}]}> 
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
          <Badge label={`진행률 ${progress.toFixed(1)}%`} variant="neutral" size="sm" />
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

  const books = Object.values(root.children).sort((a, b) => a.name.localeCompare(b.name));
  const marathonRows = Object.values(stats.marathonBest ?? {}).sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return a.collectionDir.localeCompare(b.collectionDir);
  });

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.container}>
      <View style={styles.topBar}>
        <AppButton label="뒤로" variant="ghost" size="md" onPress={onBack} />
      </View>

      <Text style={styles.title}>문제풀이 통계</Text>

      <Card variant="strong" shadowType="soft" style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>전체</Text>
        <ProgressBar value={totalProgress} />
        <View style={styles.metricRow}>
          <Badge
            label={`진행 ${root.agg.solved}/${root.agg.total} (${totalProgress.toFixed(1)}%)`}
            variant="info"
            size="md"
          />
          <Badge label={`정답률 ${totalAccuracy.toFixed(1)}%`} variant="success" size="md" />
          <Badge label={`평균 ${fmtSec(totalAvg)}`} variant="outline" size="md" />
        </View>
      </Card>

      {books.map(node => renderNode(node, 0))}

      <Card variant="default" shadowType="soft" style={styles.marathonCard}>
        <Text style={styles.sectionTitle}>마라톤 최고기록</Text>
        {marathonRows.length === 0 ? (
          <Badge label="기록 없음" variant="neutral" size="md" />
        ) : (
          marathonRows.map(row => {
            const name = decodeName(row.collectionDir.split('/').slice(-1)[0]);
            return (
              <Card
                key={row.collectionDir}
                variant="outlined"
                padded
                style={styles.marathonRowCard}>
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
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: theme.color.bg.page,
  },
  container: {
    padding: theme.space.sm,
    paddingBottom: theme.space.xxl,
  },
  topBar: {
    marginBottom: theme.space.xs,
    alignItems: 'flex-start',
  },
  title: {
    ...theme.typography.titleMd,
    color: theme.color.text.primary,
    marginBottom: theme.space.sm,
  },
  sectionTitle: {
    ...theme.typography.section,
    color: theme.color.text.primary,
    marginBottom: theme.space.xs,
  },
  summaryCard: {
    marginBottom: theme.space.sm,
  },
  treeCard: {
    marginBottom: theme.space.xs,
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
    height: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: '#DEE8E6',
    overflow: 'hidden',
    marginBottom: theme.space.xs,
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.color.state.success,
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
  },
  marathonRowCard: {
    marginTop: theme.space.xs,
  },
  marathonTitle: {
    ...theme.typography.body,
    color: theme.color.text.primary,
    fontWeight: '700',
    marginBottom: theme.space.xs,
  },
});
