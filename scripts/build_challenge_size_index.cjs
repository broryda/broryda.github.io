#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(ROOT, 'src', 'data', 'problemManifest.json');
const outPath = path.join(ROOT, 'src', 'data', 'challengeSizeIndex.json');
const sgfRoot = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');

function parseSize(sgf) {
  const m = sgf.match(/SZ\[(\d+)\]/i);
  const n = m ? Number.parseInt(m[1], 10) : 19;
  return Number.isFinite(n) && n > 0 ? n : 19;
}

function addCoord(set, token, size) {
  if (!token || token.length < 2) return;
  const a = token.charCodeAt(0) - 97;
  const b = token.charCodeAt(1) - 97;
  if (a < 0 || b < 0) return;
  if (a >= size || b >= size) return;
  set.add(`${a},${b}`);
}

function collectCoords(sgf, size) {
  const set = new Set();
  const reSingle = /;(?:B|W)\[([a-z]{2})\]/gi;
  let m;
  while ((m = reSingle.exec(sgf)) !== null) addCoord(set, m[1], size);

  const reSetup = /A(?:B|W)((?:\[[a-z]{2}\])+)/gi;
  while ((m = reSetup.exec(sgf)) !== null) {
    const chunk = m[1] || '';
    const reCoord = /\[([a-z]{2})\]/gi;
    let c;
    while ((c = reCoord.exec(chunk)) !== null) addCoord(set, c[1], size);
  }
  return set;
}

function viewportFromSet(set, size, pad = 1) {
  if (set.size === 0) {
    return {minCol: 0, maxCol: Math.min(size - 1, 8), minRow: 0, maxRow: Math.min(size - 1, 8)};
  }
  let minCol = size - 1;
  let maxCol = 0;
  let minRow = size - 1;
  let maxRow = 0;
  for (const key of set) {
    const [cRaw, rRaw] = key.split(',');
    const c = Number.parseInt(cRaw, 10);
    const r = Number.parseInt(rRaw, 10);
    if (c < minCol) minCol = c;
    if (c > maxCol) maxCol = c;
    if (r < minRow) minRow = r;
    if (r > maxRow) maxRow = r;
  }
  minCol = Math.max(0, minCol - pad);
  maxCol = Math.min(size - 1, maxCol + pad);
  minRow = Math.max(0, minRow - pad);
  maxRow = Math.min(size - 1, maxRow + pad);
  return {minCol, maxCol, minRow, maxRow};
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const tooLarge = {};
  let largeCount = 0;
  for (const row of files) {
    const rel = row.rel;
    const sgfAsset = row.sgfAsset;
    if (!rel || !sgfAsset) continue;
    const sgfPath = path.join(sgfRoot, sgfAsset);
    if (!fs.existsSync(sgfPath)) continue;
    const sgf = fs.readFileSync(sgfPath, 'utf8');
    const size = parseSize(sgf);
    const coords = collectCoords(sgf, size);
    const vp = viewportFromSet(coords, size, 1);
    const cols = vp.maxCol - vp.minCol + 1;
    const rows = vp.maxRow - vp.minRow + 1;
    const isLarge = cols >= 15 || rows >= 15;
    const problemPath = `assets/problem/${rel}`;
    tooLarge[problemPath] = isLarge;
    if (isLarge) largeCount += 1;
  }
  const out = {
    generatedAt: new Date().toISOString(),
    tooLarge,
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`challengeSizeIndex written: ${outPath}`);
  console.log(`total=${Object.keys(tooLarge).length}, large=${largeCount}`);
}

main();

