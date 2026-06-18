#!/usr/bin/env node
/**
 * CI helper — list EJS views still using Bootstrap modal markup.
 * Usage: node scripts/check-bootstrap-modals.mjs [--strict]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, '..', 'views');
const strict = process.argv.includes('--strict');
const MODAL_BUDGET = 175;

const ALLOWLIST = new Set([
  'views/partials/hms-admin-access-modals.ejs',
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(path.join(__dirname, '..'), path.join(dir, ent.name)).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      walk(path.join(dir, ent.name), out);
      continue;
    }
    if (ent.name.endsWith('.ejs')) out.push({ fp: path.join(dir, ent.name), rel });
  }
  return out;
}

const issues = [];
for (const { fp, rel } of walk(viewsDir)) {
  if (ALLOWLIST.has(rel)) continue;
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\bmodal fade\b/.test(line) || /\bclass="modal\b/.test(line)) {
      issues.push({ file: rel, line: i + 1 });
    }
  });
}

if (!issues.length) {
  console.log('OK — no Bootstrap modal markup in views/ (excluding allowlist)');
  process.exit(0);
}

console.log(`Found ${issues.length} Bootstrap modal pattern(s):`);
for (const x of issues.slice(0, 50)) {
  console.log(`  ${x.file}:${x.line}`);
}
if (issues.length > 50) console.log(`  … and ${issues.length - 50} more`);
if (issues.length > MODAL_BUDGET) console.log(`Budget exceeded: ${issues.length} > ${MODAL_BUDGET}`);

process.exit(strict && issues.length > MODAL_BUDGET ? 1 : 0);
