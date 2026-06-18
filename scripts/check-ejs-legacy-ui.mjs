#!/usr/bin/env node
/**
 * CI helper — warn when EJS views still use bare form-control / btn-primary without hms-*.
 * Usage: node scripts/check-ejs-legacy-ui.mjs [--strict]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, '..', 'views');
const strict = process.argv.includes('--strict');
/** Ratchet budget — lower over time as migration progresses */
const LEGACY_BUDGET = 72;

const HMS_INPUT_OK = /\b(hms-input|hms-input-pill|hms-select-pill|hms-filter-bar__search)\b/;

const SKIP_DIRS = new Set(['partials/print', 'portal']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(viewsDir, path.join(dir, ent.name)).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if ([...SKIP_DIRS].some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      walk(path.join(dir, ent.name), out);
      continue;
    }
    if (ent.name.endsWith('.ejs')) out.push(path.join(dir, ent.name));
  }
  return out;
}

const issues = [];
for (const fp of walk(viewsDir)) {
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\bform-control\b/.test(line) && !HMS_INPUT_OK.test(line) && !/form-control-plaintext/.test(line)) {
      issues.push({ file: path.relative(path.join(__dirname, '..'), fp).replace(/\\/g, '/'), line: i + 1, kind: 'form-control' });
    }
    if (/\bbtn btn-primary\b/.test(line) && !/\bhms-btn\b/.test(line)) {
      issues.push({ file: path.relative(path.join(__dirname, '..'), fp).replace(/\\/g, '/'), line: i + 1, kind: 'btn-primary' });
    }
  });
}

if (!issues.length) {
  console.log('OK — no legacy form-control / btn-primary without hms-* in views/');
  process.exit(0);
}

console.log(`Found ${issues.length} legacy UI pattern(s):`);
for (const x of issues.slice(0, 40)) {
  console.log(`  ${x.file}:${x.line}  (${x.kind})`);
}
if (issues.length > 40) console.log(`  … and ${issues.length - 40} more`);

if (issues.length > LEGACY_BUDGET) {
  console.log(`Budget exceeded: ${issues.length} > ${LEGACY_BUDGET}`);
}

process.exit(strict && issues.length > LEGACY_BUDGET ? 1 : 0);
