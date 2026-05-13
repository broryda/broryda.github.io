/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'src', 'data', 'problemManifest.json');
const assetsRoot = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets');
const excludedTopCollections = new Set(['기초사활맥 800제']);

function parseGradeToken(text) {
  const normalized = String(text ?? '')
    .replace(/\+/g, ' ')
    .toUpperCase();

  const k = normalized.match(/(?:^|[^0-9])(1[0-8]|[1-9])\s*K(?![A-Z0-9])/);
  if (k) {
    return `${Number.parseInt(k[1], 10)}K`;
  }

  const d = normalized.match(/(?:^|[^0-9])(7|[1-6])\s*D(?![A-Z0-9])/);
  if (d) {
    return `${Number.parseInt(d[1], 10)}D`;
  }

  return null;
}

function extractGradeFromSgf(sgfText) {
  const upper = String(sgfText ?? '').toUpperCase();
  const props = [...upper.matchAll(/(?:^|[;(])\s*(GN|LN)\[([^\]]*)\]/g)];
  for (const m of props) {
    const grade = parseGradeToken(m[2]);
    if (grade) return grade;
  }
  return parseGradeToken(upper);
}

function main() {
  let manifestText = fs.readFileSync(manifestPath, 'utf8');
  if (manifestText.charCodeAt(0) === 0xfeff) {
    manifestText = manifestText.slice(1);
  }
  const manifest = JSON.parse(manifestText);
  let matched = 0;
  let missing = 0;
  let skipped = 0;

  for (const item of manifest.files ?? []) {
    const top = String(item?.rel ?? '').split('/').filter(Boolean)[0] ?? '';
    if (excludedTopCollections.has(top)) {
      delete item.grade;
      skipped += 1;
      continue;
    }

    const sgfAsset = item?.sgfAsset;
    if (!sgfAsset) {
      delete item.grade;
      missing += 1;
      continue;
    }

    const sgfPath = path.join(assetsRoot, sgfAsset);
    let grade = null;
    try {
      const sgfText = fs.readFileSync(sgfPath, 'utf8');
      grade = extractGradeFromSgf(sgfText);
    } catch {
      grade = null;
    }

    if (!grade) {
      grade = parseGradeToken(item?.rel ?? '');
    }

    if (grade) {
      item.grade = grade;
      matched += 1;
    } else {
      delete item.grade;
      missing += 1;
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`DONE matched=${matched} missing=${missing} skipped=${skipped}`);
}

main();
