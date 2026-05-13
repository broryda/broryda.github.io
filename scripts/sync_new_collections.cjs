/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

const sourceProblemRoot = path.join(workspaceRoot, 'assets', 'problem');
const sourceThumbRoot = path.join(workspaceRoot, 'assets', 'sahwal', '.thumb_cache', 'png');

const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const androidAssetsRoot = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets');
const sgfAsciiRoot = path.join(androidAssetsRoot, 'sgf_ascii');
const thumbAsciiRoot = path.join(androidAssetsRoot, 'thumb_ascii');

const targetTopCollections = new Set([
  '단계별 문제',
  '수근대사전',
  '왕초보1',
  '왕초보2',
  '초보1',
  '초보2',
]);

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sgf')) {
        out.push(full);
      }
    }
  }
  return out;
}

function nextIdFactory(existing) {
  let maxId = 0;
  for (const item of existing) {
    const sgfAsset = String(item?.sgfAsset ?? '');
    const m = sgfAsset.match(/(\d+)\.sgf$/i);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  return () => {
    maxId += 1;
    return String(maxId).padStart(6, '0');
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toRelProblem(fullPath) {
  const rel = path.relative(sourceProblemRoot, fullPath).replace(/\\/g, '/');
  return rel;
}

function main() {
  if (!fs.existsSync(sourceProblemRoot)) {
    throw new Error(`Missing source problem root: ${sourceProblemRoot}`);
  }

  ensureDir(sgfAsciiRoot);
  ensureDir(thumbAsciiRoot);

  let text = fs.readFileSync(manifestPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const manifest = JSON.parse(text);
  if (!Array.isArray(manifest.files)) manifest.files = [];

  const existingByRel = new Map();
  for (const item of manifest.files) {
    existingByRel.set(String(item.rel), item);
  }

  const nextId = nextIdFactory(manifest.files);

  const allSgf = walkFiles(sourceProblemRoot);
  const candidates = allSgf
    .map(full => ({ full, rel: toRelProblem(full) }))
    .filter(({ rel }) => targetTopCollections.has(rel.split('/')[0] || ''))
    .sort((a, b) => a.rel.localeCompare(b.rel, 'ko'));

  let added = 0;
  let thumbAdded = 0;
  let already = 0;

  for (const item of candidates) {
    if (existingByRel.has(item.rel)) {
      already += 1;
      continue;
    }

    const id = nextId();
    const sgfAsset = `sgf_ascii/${id}.sgf`;
    const sgfTarget = path.join(androidAssetsRoot, sgfAsset);
    fs.copyFileSync(item.full, sgfTarget);

    const relNoExt = item.rel.replace(/\.sgf$/i, '');
    const sourceThumb = path.join(sourceThumbRoot, ...relNoExt.split('/')) + '.png';
    let thumbAsset = null;
    if (fs.existsSync(sourceThumb)) {
      thumbAsset = `thumb_ascii/${id}.png`;
      const thumbTarget = path.join(androidAssetsRoot, thumbAsset);
      fs.copyFileSync(sourceThumb, thumbTarget);
      thumbAdded += 1;
    }

    const entry = {
      rel: item.rel,
      sgfAsset,
      thumbAsset,
    };

    manifest.files.push(entry);
    existingByRel.set(item.rel, entry);
    added += 1;
  }

  manifest.files.sort((a, b) => String(a.rel).localeCompare(String(b.rel), 'ko'));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`SYNC_DONE target=${[...targetTopCollections].join(',')} added=${added} already=${already} thumbs=${thumbAdded} total=${manifest.files.length}`);
}

main();
