/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const sgfAsciiRoot = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'sgf_ascii');
const thumbAsciiRoot = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'thumb_ascii');

const quotas = {
  '단계별 문제': 4340,
  '수근대사전': 2607,
  '왕초보1': 250,
  '왕초보2': 203,
};

const newTop = new Set(Object.keys(quotas));

function topOf(rel) {
  return String(rel).split('/').filter(Boolean)[0] || '';
}

function idFromAsset(asset, ext) {
  const m = String(asset || '').match(new RegExp(`(\\d+)\\.${ext}$`, 'i'));
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function main() {
  let text = fs.readFileSync(manifestPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const manifest = JSON.parse(text);
  const files = Array.isArray(manifest.files) ? manifest.files : [];

  const old = files.filter(item => !newTop.has(topOf(item.rel)));
  const byTop = {};
  for (const item of files.filter(item => newTop.has(topOf(item.rel)))) {
    const top = topOf(item.rel);
    if (!byTop[top]) byTop[top] = [];
    byTop[top].push(item);
  }

  const keptNew = [];
  for (const [top, limit] of Object.entries(quotas)) {
    const arr = (byTop[top] || []).slice().sort((a, b) => String(a.rel).localeCompare(String(b.rel), 'ko'));
    keptNew.push(...arr.slice(0, limit));
  }

  const nextFiles = [...old, ...keptNew].sort((a, b) => String(a.rel).localeCompare(String(b.rel), 'ko'));
  manifest.files = nextFiles;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const keepSgf = new Set();
  const keepThumb = new Set();
  for (const item of nextFiles) {
    if (item.sgfAsset) keepSgf.add(item.sgfAsset);
    if (item.thumbAsset) keepThumb.add(item.thumbAsset);
  }

  let removedSgf = 0;
  const sgfFiles = fs.readdirSync(sgfAsciiRoot).filter(n => n.toLowerCase().endsWith('.sgf'));
  for (const f of sgfFiles) {
    const asset = `sgf_ascii/${f}`;
    const id = idFromAsset(asset, 'sgf');
    if (id === null) continue;
    if (id <= 2396) continue;
    if (!keepSgf.has(asset)) {
      fs.unlinkSync(path.join(sgfAsciiRoot, f));
      removedSgf += 1;
    }
  }

  let removedThumb = 0;
  if (fs.existsSync(thumbAsciiRoot)) {
    const thumbFiles = fs.readdirSync(thumbAsciiRoot).filter(n => n.toLowerCase().endsWith('.png'));
    for (const f of thumbFiles) {
      const asset = `thumb_ascii/${f}`;
      const id = idFromAsset(asset, 'png');
      if (id === null) continue;
      if (id <= 2396) continue;
      if (!keepThumb.has(asset)) {
        fs.unlinkSync(path.join(thumbAsciiRoot, f));
        removedThumb += 1;
      }
    }
  }

  console.log(`PRUNE_DONE total=${nextFiles.length} old=${old.length} new=${keptNew.length} removedSgf=${removedSgf} removedThumb=${removedThumb}`);
}

main();
