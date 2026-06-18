#!/usr/bin/env node
'use strict';

/** Report locale key parity and EJS/JSX files that may bypass i18n. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EN_DIR = path.join(ROOT, 'locales', 'en');
const FR_DIR = path.join(ROOT, 'locales', 'fr');

function leafKeys(obj, prefix = '') {
  const out = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leafKeys(v, p));
    else out.push(p);
  }
  return out;
}

function compareNamespaces() {
  const enFiles = fs.readdirSync(EN_DIR).filter((f) => f.endsWith('.json')).sort();
  const gaps = [];
  for (const file of enFiles) {
    const en = JSON.parse(fs.readFileSync(path.join(EN_DIR, file), 'utf8'));
    const frPath = path.join(FR_DIR, file);
    if (!fs.existsSync(frPath)) {
      gaps.push({ ns: file.replace('.json', ''), missingInFr: leafKeys(en).length, orphansInFr: 0, sample: ['(file missing)'] });
      continue;
    }
    const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));
    const enKeys = new Set(leafKeys(en));
    const frKeys = new Set(leafKeys(fr));
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    const orphansInFr = [...frKeys].filter((k) => !enKeys.has(k));
    if (missingInFr.length || orphansInFr.length) {
      gaps.push({
        ns: file.replace('.json', ''),
        missingInFr: missingInFr.length,
        orphansInFr: orphansInFr.length,
        sample: missingInFr.slice(0, 8),
      });
    }
  }
  return gaps;
}

function scanEjs() {
  const views = path.join(ROOT, 'views');
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.ejs')) files.push(p);
    }
  }
  walk(views);
  const helpers = /_t\(|_tl\(|_sa\(|_tp\(|navLabel|hubLabel|roleLabel|_ac\(|\bt\(/;
  const reactMount = /react-page-mount|hms-react-root|data-page=|react-accounting-page-mount|financials-react-body/;
  const without = [];
  const reactShells = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const body = fs.readFileSync(f, 'utf8');
    if (reactMount.test(body) && body.length < 800) {
      reactShells.push(rel);
      continue;
    }
    if (!helpers.test(body)) without.push(rel);
  }
  return { total: files.length, without, reactShells };
}

function scanAppFlash() {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const literalRedirect = (app.match(/encodeURIComponent\('[^']{12,}'\)/g) || []).length;
  const flashT = (app.match(/flashT\(res,/g) || []).length;
  const renderError = (app.match(/render\('error'/g) || []).length;
  return { literalRedirect, flashT, renderError };
}

const gaps = compareNamespaces();
const ejs = scanEjs();
const flash = scanAppFlash();

console.log('=== HMS i18n coverage audit ===\n');
console.log('Locale key gaps (EN vs FR):');
if (!gaps.length) console.log('  OK — all namespaces have matching keys.');
else gaps.forEach((g) => console.log(`  ${g.ns}: missing ${g.missingInFr}, orphans ${g.orphansInFr}`, g.sample?.length ? ` e.g. ${g.sample.join(', ')}` : ''));

console.log(`\nEJS: ${ejs.total} files, ${ejs.reactShells.length} React shells, ${ejs.without.length} without i18n helpers`);
console.log('EJS without _t/_sa/_tp (first 25):');
ejs.without.slice(0, 25).forEach((f) => console.log('  -', f));

console.log(`\napp.js: flashT=${flash.flashT}, literal encodeURIComponent redirects≈${flash.literalRedirect}, render('error')=${flash.renderError}`);
console.log('\nDone. Wire remaining EJS with _t() and add keys to locales/{en,fr}/*.json');
