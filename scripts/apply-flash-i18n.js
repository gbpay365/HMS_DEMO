'use strict';
/** Generate errors.flash.* keys from app.js strings and apply flashT() in app.js */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appPath = path.join(ROOT, 'app.js');
const enPath = path.join(ROOT, 'locales', 'en', 'errors.json');
const frPath = path.join(ROOT, 'locales', 'fr', 'errors.json');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 72);
}

function extractStrings(src) {
  const strings = new Set();
  const re1 = /encodeURIComponent\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re1.exec(src))) strings.add(m[1]);
  const re3 = /redirect\([^)]*\?(?:err|msg)=([A-Za-z][A-Za-z0-9_+.%-]*)/g;
  while ((m = re3.exec(src))) {
    const s = decodeURIComponent(m[1].replace(/\+/g, ' '));
    if (s.length > 3) strings.add(s);
  }
  return [...strings].filter(
    (s) =>
      s &&
      !s.includes('tl(') &&
      !s.includes('flashT(') &&
      !s.includes('err.message') &&
      !s.includes('e.message') &&
      !s.includes('BLOCK_MESSAGE') &&
      !s.includes('duplicatePatientMessage') &&
      !s.includes('ctx?.error')
  );
}

function buildKeyMap(strings) {
  const used = new Set();
  const map = new Map();
  for (const s of strings.sort()) {
    let base = slugify(s) || 'msg';
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n++}`;
    }
    used.add(key);
    map.set(s, `flash.${key}`);
  }
  return map;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const mode = process.argv[2] || 'all';
const src = fs.readFileSync(appPath, 'utf8');
const strings = extractStrings(src);
const keyMap = buildKeyMap(strings);

function injectRequire(code) {
  if (code.includes("require('./lib/flashI18n')")) return code;
  const marker = "const { middleware: hmsI18nMiddleware";
  if (code.includes(marker)) {
    return code.replace(marker, "const { flashT } = require('./lib/flashI18n');\n" + marker);
  }
  const expressIdx = code.indexOf("const express = require('express');");
  if (expressIdx >= 0) {
    return code.replace(
      "const express = require('express');",
      "const express = require('express');\nconst { flashT } = require('./lib/flashI18n');"
    );
  }
  return "const { flashT } = require('./lib/flashI18n');\n" + code;
}

if (mode === 'keys' || mode === 'all') {
  const en = loadJson(enPath);
  const fr = loadJson(frPath);
  en.flash = en.flash || {};
  fr.flash = fr.flash || {};
  for (const [str, key] of keyMap) {
    const short = key.replace(/^flash\./, '');
    if (!en.flash[short]) en.flash[short] = str;
    if (!fr.flash[short]) fr.flash[short] = str; // placeholder — fr batch below
  }
  saveJson(enPath, en);
  saveJson(frPath, fr);
  console.log('Added', keyMap.size, 'flash keys to errors.json');
}

if (mode === 'apply' || mode === 'all') {
  let out = injectRequire(src);
  // longest strings first to avoid partial replacements
  const entries = [...keyMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [str, key] of entries) {
    const esc = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`encodeURIComponent\\(\\s*['"]${esc}['"]\\s*\\)`, 'g'),
      `encodeURIComponent(flashT(res, '${key}'))`
    );
    const plus = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '+');
    if (plus !== str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) {
      out = out.replace(
        new RegExp(`redirect\\(([^)]*\\?)err=${plus}(?=[&'"])`, 'g'),
        `redirect($1err=' + encodeURIComponent(flashT(res, '${key}'))`
      );
      out = out.replace(
        new RegExp(`redirect\\(([^)]*\\?)msg=${plus}(?=[&'"])`, 'g'),
        `redirect($1msg=' + encodeURIComponent(flashT(res, '${key}'))`
      );
    }
  }
  fs.writeFileSync(appPath, out, 'utf8');
  console.log('Applied flashT replacements to app.js');
}

if (mode === 'map') {
  for (const [str, key] of keyMap) console.log(key, '←', JSON.stringify(str));
}
