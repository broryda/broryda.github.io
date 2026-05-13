/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const outPath = path.join(repoRoot, 'scripts', 'new_thumb_tasks.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tasks = [];
for (const item of manifest.files ?? []) {
  const rel = String(item.rel ?? '');
  if (!rel.startsWith('단계별 문제/')) continue;
  if (!rel.includes('/초급') && !rel.includes('/중급')) continue;
  if (item.thumbAsset) continue;
  const sgfAsset = String(item.sgfAsset ?? '');
  const m = sgfAsset.match(/(\d+)\.sgf$/i);
  if (!m) continue;
  tasks.push({
    rel,
    sgfAsset,
    id: m[1],
  });
}

fs.writeFileSync(outPath, `${JSON.stringify({count: tasks.length, tasks}, null, 2)}\n`, 'utf8');
console.log(`STAGE_THUMB_TASKS count=${tasks.length} path=${outPath}`);
