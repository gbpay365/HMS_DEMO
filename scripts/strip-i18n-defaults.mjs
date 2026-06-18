import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), 'frontend', 'src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function stripContent(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/,?\s*defaultValue:\s*\n\s*'((?:\\.|[^'])*)'/g, '');
    s = s.replace(/,?\s*defaultValue:\s*\n\s*"((?:\\.|[^"])*)"/g, '');
    s = s.replace(/,?\s*defaultValue:\s*\n\s*`((?:\\.|[^`])*)`/g, '');
    s = s.replace(/,?\s*defaultValue:\s*'((?:\\.|[^'])*)'/g, '');
    s = s.replace(/,?\s*defaultValue:\s*"((?:\\.|[^"])*)"/g, '');
    s = s.replace(/,?\s*defaultValue:\s*`((?:\\.|[^`])*)`/g, '');
    // Do not strip dynamic defaultValue: someVar — fix manually (nested t() fallbacks).
  } while (s !== prev);

  s = s.replace(/\{\s*,/g, '{');
  s = s.replace(/,\s*\}/g, '}');
  s = s.replace(/,\s*,/g, ',');
  s = s.replace(/t\(([^,()]+(?:\([^)]*\))?[^,()]*),\s*\{\s*\}\)/g, 't($1)');
  s = s.replace(/tFn\(([^,()]+(?:\([^)]*\))?[^,()]*),\s*\{\s*\}\)/g, 'tFn($1)');
  s = s.replace(/i18n\.t\(([^,()]+(?:\([^)]*\))?[^,()]*),\s*\{\s*\}\)/g, 'i18n.t($1)');
  return s;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : walk(ROOT);
let totalRemaining = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = stripContent(before);
  if (after !== before) fs.writeFileSync(file, after);
  const n = (after.match(/defaultValue:/g) || []).length;
  totalRemaining += n;
  if (n > 0) console.log(path.relative(ROOT, file), 'remaining:', n);
}

console.log('done. remaining defaultValue: props total:', totalRemaining);
