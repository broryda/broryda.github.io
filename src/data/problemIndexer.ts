import manifest from './problemManifest.json';
import {naturalCompare} from '../core/naturalSort';
import type {ProblemIndex} from '../models/problemIndex';

const excludedCollections = new Set([
  '김지석의 시크릿',
  '견디는 수읽기',
  '귀수마수',
  '발양론',
  '사활묘기',
  '후지사와슈코 기본수법사전',
]);

const gradeBookName = '기력별 문제(101)';

function leadingNumber(name: string): number | null {
  const m = name.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

function gradeFolderRank(name: string): number {
  const n = leadingNumber(name);
  if (n === null) return 10000;
  if (name.endsWith('급')) return 100 - n;
  if (name.endsWith('단')) return 200 + n;
  return 10000;
}

function ensureMapArray<T>(obj: Record<string, T[]>, key: string): void {
  if (!obj[key]) obj[key] = [];
}

const customLeafOrders: Record<string, string[]> = {
  '기초사활맥 800제': ['001-200', '201-400', '401-600', '601-800'],
  '기경중묘': [
    '사는수',
    '잡는수',
    '패 내는수',
    '수상전',
    '몰아떨구기',
    '넘는 수',
    '파고들고 찌르고 끊고 축',
  ],
};

export function buildFromManifest(): ProblemIndex {
  const normalizedRoot = 'assets/problem';
  const allFiles: string[] = [];
  const dirChildren: Record<string, string[]> = {};
  const dirFiles: Record<string, string[]> = {};
  const sgfAssetByProblemPath: Record<string, string> = {};
  const thumbAssetByProblemPath: Record<string, string | null> = {};
  ensureMapArray(dirChildren, normalizedRoot);
  ensureMapArray(dirFiles, normalizedRoot);

  for (const item of manifest.files as Array<{
    rel: string;
    sgfAsset: string;
    thumbAsset?: string | null;
  }>) {
    const rel = item.rel;
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.some(p => p.startsWith('.'))) continue;
    if (excludedCollections.has(parts[0])) continue;

    let cur = normalizedRoot;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const next = `${cur}/${parts[i]}`;
      ensureMapArray(dirChildren, next);
      ensureMapArray(dirFiles, next);
      ensureMapArray(dirChildren, cur);
      if (!dirChildren[cur].includes(next)) {
        dirChildren[cur].push(next);
      }
      cur = next;
    }

    const assetPath = `${normalizedRoot}/${rel}`;
    allFiles.push(assetPath);
    sgfAssetByProblemPath[assetPath] = item.sgfAsset;
    thumbAssetByProblemPath[assetPath] = item.thumbAsset ?? null;
    ensureMapArray(dirFiles, cur);
    dirFiles[cur].push(assetPath);
  }

  allFiles.sort((a, b) =>
    naturalCompare(a.replace(`${normalizedRoot}/`, ''), b.replace(`${normalizedRoot}/`, '')),
  );

  for (const [parent, children] of Object.entries(dirChildren)) {
    const parentDecoded = decodeURIComponent(parent.split('/').slice(-1)[0]);
    if (parentDecoded === gradeBookName) {
      children.sort((a, b) => {
        const aa = decodeURIComponent(a.split('/').slice(-1)[0]);
        const bb = decodeURIComponent(b.split('/').slice(-1)[0]);
        const ra = gradeFolderRank(aa);
        const rb = gradeFolderRank(bb);
        if (ra !== rb) return ra - rb;
        return naturalCompare(aa, bb);
      });
    } else {
      const custom = customLeafOrders[parentDecoded];
      if (custom) {
        children.sort((a, b) => {
          const aa = decodeURIComponent(a.split('/').slice(-1)[0]);
          const bb = decodeURIComponent(b.split('/').slice(-1)[0]);
          const ia = custom.indexOf(aa);
          const ib = custom.indexOf(bb);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1;
          if (ib >= 0) return 1;
          return naturalCompare(aa, bb);
        });
      } else {
        children.sort((a, b) =>
          naturalCompare(a.split('/').slice(-1)[0], b.split('/').slice(-1)[0]),
        );
      }
    }
  }

  for (const files of Object.values(dirFiles)) {
    files.sort((a, b) => {
      const aa = decodeURIComponent(a.split('/').slice(-1)[0].replace(/\.sgf$/i, ''));
      const bb = decodeURIComponent(b.split('/').slice(-1)[0].replace(/\.sgf$/i, ''));
      const na = leadingNumber(aa);
      const nb = leadingNumber(bb);
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na !== null && nb === null) return -1;
      if (na === null && nb !== null) return 1;
      return naturalCompare(aa, bb);
    });
  }

  return {
    rootPath: normalizedRoot,
    allFiles,
    dirChildren,
    dirFiles,
    sgfAssetByProblemPath,
    thumbAssetByProblemPath,
  };
}

export function sgfAssetPathFromProblemPath(
  problemPath: string,
  index: ProblemIndex,
): string | null {
  return index.sgfAssetByProblemPath[problemPath] ?? null;
}
