'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const strings = new Set();

// encodeURIComponent('...')
const re1 = /encodeURIComponent\(\s*['"]([^'"]+)['"]\s*\)/g;
let m;
while ((m = re1.exec(src))) strings.add(m[1]);

// encodeURIComponent(`...`) single line
const re2 = /encodeURIComponent\(\s*`([^`$]+)`\s*\)/g;
while ((m = re2.exec(src))) strings.add(m[1]);

// bare ?err=Word+Word patterns
const re3 = /redirect\([^)]*\?(?:err|msg)=([A-Za-z][A-Za-z0-9_+.%-]*)/g;
while ((m = re3.exec(src))) {
  const s = decodeURIComponent(m[1].replace(/\+/g, ' '));
  if (s.length > 3 && !s.includes('tl(')) strings.add(s);
}

// filter dynamic / already i18n
const skip = (s) =>
  !s ||
  s.includes('${') ||
  s.startsWith('tl(') ||
  s.startsWith('flashT(') ||
  s.includes('err.message') ||
  s.includes('e.message') ||
  s.includes('delErr.message') ||
  s.includes('BLOCK_MESSAGE') ||
  s.includes('duplicatePatientMessage') ||
  s.includes('ctx?.error') ||
  s.length < 4;

const sorted = [...strings].filter((s) => !skip(s)).sort((a, b) => a.localeCompare(b));
console.log('Unique static flash strings:', sorted.length);
sorted.forEach((s) => console.log(JSON.stringify(s)));
