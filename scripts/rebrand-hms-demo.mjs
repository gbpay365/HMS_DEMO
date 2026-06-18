#!/usr/bin/env node
/**
 * Rebrand HMS copy for ZAIZENS demo — replaces TSSF / ZAIZENS / SOA facility names.
 * Skips node_modules, backups, and large SQL dumps. Does NOT touch SOAP clinical terms.
 */
import fs from 'fs';
import path from 'path';

const root = process.argv[2] || 'C:\\HMS_DEMO';
if (!fs.existsSync(root)) {
  console.error('Target not found:', root);
  process.exit(1);
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'tmp',
  'dist',
  'Update',
  'backups',
  '.cursor',
]);

const SKIP_FILE_RE = /(?:\\|\/)(?:database\\backups|tmp\\|hms_export\.sql|local-hms-railway)/i;
const MAX_BYTES = 2 * 1024 * 1024;

const TEXT_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ejs', '.json', '.env', '.html', '.htm', '.txt', '.md',
  '.ps1', '.sql', '.css', '.svg', '.example', '.cnf',
]);

/** Longest-first to avoid partial replacements */
const REPLACEMENTS = [
  ['ZAIZENS Demo Hospital', 'ZAIZENS Demo Hospital'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS Bamenda', 'ZAIZENS Bamenda'],
  ['ZAIZENS Integrated HMS', 'ZAIZENS Integrated HMS'],
  ['HMS intégré ZAIZENS', 'HMS intégré ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS', 'ZAIZENS'],
  ['ZAIZENS HMS', 'ZAIZENS HMS'],
  ['ZAIZENSHMS', 'ZAIZENSHMS'],
  ['ZAIZENS · ZAIZENS ·', 'ZAIZENS ·'],
  ['OPD Queue — ZAIZENS', 'OPD Queue — ZAIZENS'],
  ['Prescriptions - ZAIZENS HMS', 'Prescriptions — ZAIZENS HMS'],
  ['localhost:3004', 'localhost:3004'],
  ['hms_demo', 'hms_demo'],
  ['hms_demo', 'hms_demo'],
  ['root', 'root'],
  ['/demo/zaizens/', '/demo/zaizens/'],
  ['zaizens-hms-', 'zaizens-hms-'],
  ["process.env.HMS_PATIENT_CODE_SUFFIX || 'ZNS'", "process.env.HMS_PATIENT_CODE_SUFFIX || 'ZNS'"],
  ["HMS_PATIENT_CODE_SUFFIX || 'ZNS'", "HMS_PATIENT_CODE_SUFFIX || 'ZNS'"],
  ["process.env.HMS_PATIENT_CODE_PREFIX || 'ZAI'", "process.env.HMS_PATIENT_CODE_PREFIX || 'ZAI'"],
  ["HMS_PATIENT_CODE_PREFIX || 'ZAI'", "HMS_PATIENT_CODE_PREFIX || 'ZAI'"],
  ['ZAI-000001-ZNS', 'ZAI-000001-ZNS'],
  ["|| 'ZAIZENS'", "|| 'ZAIZENS'"],
  ["'ZAIZENS'", "'ZAIZENS'"],
  ['Lobby display — ZAIZENS', 'Lobby display — ZAIZENS'],
  ['02-zaizens-demo.env', '02-zaizens-demo.env'],
  ['zaizens-hms-backup.ps1', 'zaizens-hms-backup.ps1'],
];

let filesChanged = 0;
let totalReplacements = 0;

function shouldProcess(filePath) {
  if (SKIP_FILE_RE.test(filePath)) return false;
  const base = path.basename(filePath);
  if (base === '.env' || base === '.env.production') return true;
  const ext = path.extname(base).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  if (base === 'env.example' || base.endsWith('.env.example')) return true;
  return false;
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full);
      continue;
    }
    if (!shouldProcess(full)) continue;
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.size > MAX_BYTES) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    let next = text;
    let count = 0;
    for (const [from, to] of REPLACEMENTS) {
      if (!next.includes(from)) continue;
      const parts = next.split(from);
      const added = parts.length - 1;
      count += added;
      next = parts.join(to);
    }
    if (count > 0 && next !== text) {
      fs.writeFileSync(full, next, 'utf8');
      filesChanged += 1;
      totalReplacements += count;
      console.log(`  ${path.relative(root, full)} (${count})`);
    }
  }
}

console.log('Rebranding:', root);
walk(root);
console.log(`Done — ${filesChanged} files, ${totalReplacements} replacements.`);
