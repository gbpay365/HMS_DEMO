'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const renders = new Set();
const re = /res\.render\(\s*['"]([^'"]+)['"]/g;

for (const rel of ['app.js', ...fs.readdirSync(path.join(ROOT, 'routes')).map((x) => `routes/${x}`)]) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  let m;
  while ((m = re.exec(s))) renders.add(m[1]);
}

const missing = [...renders].filter((v) => !fs.existsSync(path.join(ROOT, 'views', `${v}.ejs`))).sort();
console.log(`Templates referenced: ${renders.size}`);
console.log(`Missing EJS files: ${missing.length}`);
missing.forEach((v) => console.log(`  ${v}`));
