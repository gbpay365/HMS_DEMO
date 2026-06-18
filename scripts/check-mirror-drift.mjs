#!/usr/bin/env node
/**
 * Compare dist/hms-deploy (and optionally Update/) against repo root using MANIFEST.txt.
 * Exit 0 = in sync, 1 = drift detected.
 *
 * Usage:
 *   node scripts/check-mirror-drift.mjs
 *   node scripts/check-mirror-drift.mjs --update   # also check Update/
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const checkUpdate = process.argv.includes('--update');

function sha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  return fs
    .readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function compareTree(label, baseDir, manifestRelPaths) {
  const drift = [];
  const missing = [];
  let checked = 0;

  for (const rel of manifestRelPaths) {
    const norm = rel.replace(/\\/g, '/');
    const src = path.join(root, norm);
    const mirror = path.join(baseDir, norm);
    if (!fs.existsSync(src)) continue;
    checked += 1;
    if (!fs.existsSync(mirror)) {
      missing.push(norm);
      continue;
    }
    const a = sha256(src);
    const b = sha256(mirror);
    if (a !== b) drift.push(norm);
  }

  return { label, drift, missing, checked };
}

const manifestPath = path.join(root, 'dist', 'hms-deploy', 'MANIFEST.txt');
const manifest = loadManifest(manifestPath);

if (!manifest.length) {
  console.error('No MANIFEST.txt in dist/hms-deploy/. Run: npm run build:deploy');
  process.exit(1);
}

const deployDir = path.join(root, 'dist', 'hms-deploy');
const results = [compareTree('dist/hms-deploy', deployDir, manifest)];

if (checkUpdate) {
  const updateDir = path.join(root, 'Update');
  if (fs.existsSync(updateDir)) {
    results.push(compareTree('Update', updateDir, manifest));
  } else {
    console.warn('Update/ not found — skipping (--update)');
  }
}

let failed = false;

for (const r of results) {
  if (r.missing.length) {
    failed = true;
    console.error(`\n[${r.label}] ${r.missing.length} file(s) missing in mirror (of ${r.checked} checked):`);
    for (const f of r.missing.slice(0, 20)) console.error(`  - ${f}`);
    if (r.missing.length > 20) console.error(`  … and ${r.missing.length - 20} more`);
  }
  if (r.drift.length) {
    failed = true;
    console.error(`\n[${r.label}] ${r.drift.length} file(s) differ from root (of ${r.checked} checked):`);
    for (const f of r.drift.slice(0, 20)) console.error(`  - ${f}`);
    if (r.drift.length > 20) console.error(`  … and ${r.drift.length - 20} more`);
  }
  if (!r.missing.length && !r.drift.length) {
    console.log(`[${r.label}] OK — ${r.checked} manifest files match root`);
  }
}

if (failed) {
  console.error('\nCanonical source is the repo root. Regenerate mirrors with: npm run build:deploy');
  console.error('See docs/CANONICAL-SOURCE.md');
  process.exit(1);
}

process.exit(0);
