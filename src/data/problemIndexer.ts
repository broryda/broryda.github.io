import manifest from './problemManifest.json';
import challengeSizeIndex from './challengeSizeIndex.json';
import {naturalCompare} from '../core/naturalSort';
import {gradeToProblemRating, normalizeGrade} from '../core/rating';
import type {ProblemIndex} from '../models/problemIndex';

const excludedCollections = new Set<string>();
const gradeBookName = '기력별 문제';
const classicsRootName = '문제집';
const classicCollections = new Set([
  '기경중묘',
  '현람',
  '풍각',
  '기초사활맥 800제',
  '현현기경',
  '단계별 문제',
  '수근대사전',
  '왕초보1',
  '왕초보2',
]);

const customLeafOrders: Record<string, string[]> = {
  '기초사활맥 800제': ['001-200', '201-400', '401-600', '601-800'],
  기경중묘: [
    '사는수',
    '잡는수',
    '패 내는수',
    '수상전',
    '몰아떨구기',
    '넘는 수',
    '파고들고 찌르고 끊고 축',
  ],
};

function leadingNumber(name: string): number | null {
  const m = name.match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function ensureMapArray<T>(obj: Record<string, T[]>, key: string): void {
  if (!obj[key]) obj[key] = [];
}

function makeGradeOrder(): string[] {
  const out: string[] = [];
  for (let i = 15; i >= 1; i -= 1) out.push(`${i}K`);
  for (let i = 1; i <= 7; i += 1) out.push(`${i}D`);
  return out;
}

function linkChild(
  dirChildren: Record<string, string[]>,
  dirFiles: Record<string, string[]>,
  parent: string,
  child: string,
): void {
  ensureMapArray(dirChildren, parent);
  ensureMapArray(dirChildren, child);
  ensureMapArray(dirFiles, child);
  if (!dirChildren[parent].includes(child)) {
    dirChildren[parent].push(child);
  }
}

function ensurePathTree(
  dirChildren: Record<string, string[]>,
  dirFiles: Record<string, string[]>,
  root: string,
  parts: string[],
): string {
  let cur = root;
  ensureMapArray(dirChildren, cur);
  ensureMapArray(dirFiles, cur);
  for (const part of parts) {
    const next = `${cur}/${part}`;
    linkChild(dirChildren, dirFiles, cur, next);
    cur = next;
  }
  return cur;
}

export function buildFromManifest(): ProblemIndex {
  const normalizedRoot = 'assets/problem';
  const gradeRootDir = `${normalizedRoot}/${gradeBookName}`;
  const classicsRootDir = `${normalizedRoot}/${classicsRootName}`;
  const gradeOrder = makeGradeOrder();

  const allFiles: string[] = [];
  const dirChildren: Record<string, string[]> = {};
  const dirFiles: Record<string, string[]> = {};
  const sgfAssetByProblemPath: Record<string, string> = {};
  const thumbAssetByProblemPath: Record<string, string | null> = {};
  const gradeByProblemPath: Record<string, string | null> = {};
  const ratingByProblemPath: Record<string, number | null> = {};
  const challengeTooLargeByProblemPath: Record<string, boolean> = {};
  const tooLargeMap = (challengeSizeIndex as {tooLarge?: Record<string, boolean>}).tooLarge ?? {};

  ensureMapArray(dirChildren, normalizedRoot);
  ensureMapArray(dirFiles, normalizedRoot);
  linkChild(dirChildren, dirFiles, normalizedRoot, gradeRootDir);
  linkChild(dirChildren, dirFiles, normalizedRoot, classicsRootDir);

  for (const grade of gradeOrder) {
    linkChild(dirChildren, dirFiles, gradeRootDir, `${gradeRootDir}/${grade}`);
  }

  for (const item of manifest.files as Array<{
    rel: string;
    sgfAsset: string;
    thumbAsset?: string | null;
    grade?: string | null;
  }>) {
    const rel = item.rel;
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.some(p => p.startsWith('.'))) continue;
    if (excludedCollections.has(parts[0])) continue;

    const top = parts[0];

    const realDir = ensurePathTree(dirChildren, dirFiles, normalizedRoot, parts.slice(0, -1));
    const problemPath = `${normalizedRoot}/${rel}`;
    allFiles.push(problemPath);
    sgfAssetByProblemPath[problemPath] = item.sgfAsset;
    thumbAssetByProblemPath[problemPath] = item.thumbAsset ?? null;
    dirFiles[realDir].push(problemPath);

    const normalizedGrade = normalizeGrade(item.grade);
    gradeByProblemPath[problemPath] = normalizedGrade;
    ratingByProblemPath[problemPath] = gradeToProblemRating(normalizedGrade);
    challengeTooLargeByProblemPath[problemPath] = !!tooLargeMap[problemPath];

    if (classicCollections.has(top)) {
      const classicDir = ensurePathTree(dirChildren, dirFiles, classicsRootDir, parts.slice(0, -1));
      dirFiles[classicDir].push(problemPath);
    }

    if (normalizedGrade) {
      const gradeDir = `${gradeRootDir}/${normalizedGrade}`;
      if (dirFiles[gradeDir]) {
        dirFiles[gradeDir].push(problemPath);
      }
    }
  }

  const rootChildren = dirChildren[normalizedRoot] ?? [];
  dirChildren[normalizedRoot] = rootChildren.filter(child => {
    const name = safeDecode(child.split('/').slice(-1)[0]);
    return !classicCollections.has(name);
  });
  if (!dirChildren[normalizedRoot].includes(classicsRootDir)) {
    dirChildren[normalizedRoot].push(classicsRootDir);
  }
  if (!dirChildren[normalizedRoot].includes(gradeRootDir)) {
    dirChildren[normalizedRoot].push(gradeRootDir);
  }

  allFiles.sort((a, b) =>
    naturalCompare(a.replace(`${normalizedRoot}/`, ''), b.replace(`${normalizedRoot}/`, '')),
  );

  for (const [parent, children] of Object.entries(dirChildren)) {
    const parentDecoded = decodeURIComponent(parent.split('/').slice(-1)[0]);

    if (parent === gradeRootDir) {
      children.sort((a, b) => {
        const aa = safeDecode(a.split('/').slice(-1)[0]).toUpperCase();
        const bb = safeDecode(b.split('/').slice(-1)[0]).toUpperCase();
        const ia = gradeOrder.indexOf(aa);
        const ib = gradeOrder.indexOf(bb);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return naturalCompare(aa, bb);
      });
      continue;
    }

    const custom = customLeafOrders[parentDecoded];
    if (custom) {
      children.sort((a, b) => {
        const aa = safeDecode(a.split('/').slice(-1)[0]);
        const bb = safeDecode(b.split('/').slice(-1)[0]);
        const ia = custom.indexOf(aa);
        const ib = custom.indexOf(bb);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return naturalCompare(aa, bb);
      });
      continue;
    }

    children.sort((a, b) => naturalCompare(a.split('/').slice(-1)[0], b.split('/').slice(-1)[0]));
  }

  for (const files of Object.values(dirFiles)) {
    files.sort((a, b) => {
      const aa = safeDecode(a.split('/').slice(-1)[0].replace(/\.sgf$/i, ''));
      const bb = safeDecode(b.split('/').slice(-1)[0].replace(/\.sgf$/i, ''));
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
    gradeByProblemPath,
    ratingByProblemPath,
    challengeTooLargeByProblemPath,
  };
}

export function sgfAssetPathFromProblemPath(
  problemPath: string,
  index: ProblemIndex,
): string | null {
  return index.sgfAssetByProblemPath[problemPath] ?? null;
}
