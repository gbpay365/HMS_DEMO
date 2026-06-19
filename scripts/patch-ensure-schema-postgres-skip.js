'use strict';

const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const skipLine = "  if (pool && pool.driver === 'postgres') return;";

const files = fs.readdirSync(libDir).filter((f) => f.startsWith('ensure') && f.endsWith('.js'));

const skipAlready = new Set(['ensureNursingSupplyRequestSchema.js', 'ensureRadiologySchema.js']);

function tryPatch(src) {
  const patterns = [
    /(module\.exports\s*=\s*async function\s+\w+\s*\(\s*pool\s*\)\s*\{)(\s*\n)/,
    /(module\.exports\s*=\s*function\s+\w+\s*\(\s*pool\s*\)\s*\{)(\s*\n)/,
    /(async function ensure\w+\s*\(\s*pool\s*\)\s*\{)(\s*\n)/,
  ];
  for (const re of patterns) {
    if (!re.test(src)) continue;
    const next = src.replace(re, `$1$2${skipLine}$2`);
    if (next !== src) return next;
  }
  return null;
}

for (const file of files) {
  if (skipAlready.has(file)) continue;
  const fp = path.join(libDir, file);
  let src = fs.readFileSync(fp, 'utf8');
  if (/pool\.driver\s*===\s*['"]postgres['"]/.test(src)) continue;
  if (!/ENGINE=InnoDB|ON UPDATE CURRENT_TIMESTAMP|AUTO_INCREMENT|MODIFY COLUMN|\bENUM\s*\(/i.test(src)) {
    continue;
  }
  const next = tryPatch(src);
  if (next) {
    fs.writeFileSync(fp, next);
    console.log('patched:', file);
  } else {
    console.warn('could not patch:', file);
  }
}
