/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const outPath = path.join(repoRoot, 'scripts', 'new_thumb_tasks.json');
const targetTop = new Set(['단계별 문제', '수근대사전', '왕초보1', '왕초보2', '초보1', '초보2']);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tasks = [];
for (const item of manifest.files ?? []) {
  const rel = String(item.rel ?? '');
  const top = rel.split('/').filter(Boolean)[0] ?? '';
  if (!targetTop.has(top)) continue;
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
console.log(`TASKS_WRITTEN count=${tasks.length} path=${outPath}`);
