/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const tasksPath = path.join(repoRoot, 'scripts', 'new_thumb_tasks.json');
const assetsRoot = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets');

const tasksObj = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const byRel = new Map();
for (const t of tasksObj.tasks || []) {
  byRel.set(String(t.rel), String(t.id));
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let updated = 0;
let missingFile = 0;
for (const item of manifest.files || []) {
  const rel = String(item.rel || '');
  const id = byRel.get(rel);
  if (!id) continue;
  const thumbAsset = `thumb_ascii/${id}.png`;
  const thumbPath = path.join(assetsRoot, thumbAsset);
  if (!fs.existsSync(thumbPath)) {
    missingFile += 1;
    continue;
  }
  if (item.thumbAsset !== thumbAsset) {
    item.thumbAsset = thumbAsset;
    updated += 1;
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`MANIFEST_THUMBS_APPLIED updated=${updated} missingFile=${missingFile}`);
