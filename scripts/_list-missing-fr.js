'use strict';
const fs = require('fs');
const path = require('path');

function flat(obj, p = '') {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(o, flat(v, key));
    else o[key] = v;
  }
  return o;
}

function setNested(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const root = path.join(__dirname, '..', 'locales');
const namespaces = ['clinical', 'ops', 'common', 'legacy'];

for (const ns of namespaces) {
  const en = flat(JSON.parse(fs.readFileSync(path.join(root, 'en', `${ns}.json`), 'utf8')));
  const frPath = path.join(root, 'fr', `${ns}.json`);
  const frObj = JSON.parse(fs.readFileSync(frPath, 'utf8'));
  const fr = flat(frObj);
  const missing = Object.keys(en).filter((k) => !(k in fr));
  console.log(`${ns}: ${missing.length} missing`);
  for (const k of missing) {
    console.log(`  ${k}`);
  }
}
