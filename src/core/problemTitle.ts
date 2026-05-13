import type {ProblemIndex} from '../models/problemIndex';

const BASIC_800_KEYWORD = '기초사활맥 800제';

function basenameNoExt(path: string): string {
  return decodeURIComponent(path.split('/').slice(-1)[0]).replace(/\.sgf$/i, '');
}

export function formatProblemTitle(problemPath: string, index: ProblemIndex): string {
  if (problemPath.includes(`/${BASIC_800_KEYWORD}/`)) {
    const dir = problemPath.split('/').slice(0, -1).join('/');
    const files = index.dirFiles[dir] ?? [];
    const pos = files.indexOf(problemPath);
    if (pos >= 0) {
      return `${pos + 1}번`;
    }
  }
  return basenameNoExt(problemPath);
}

