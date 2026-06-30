import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../frontend/src/pages');

const map = [
  ['mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', 'hms-compact-kpi-grid hms-compact-kpi-grid--6 mb-4'],
  ['mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6', 'hms-compact-kpi-grid hms-compact-kpi-grid--6 mb-4'],
  ['mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5', 'hms-compact-kpi-grid hms-compact-kpi-grid--5 mb-4'],
  ['mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4', 'hms-compact-kpi-grid mb-4'],
  ['mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4', 'hms-compact-kpi-grid mb-4'],
  ['mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4', 'hms-compact-kpi-grid mb-3'],
  ['mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4', 'hms-compact-kpi-grid mb-3'],
  ['mb-6 grid gap-3 sm:grid-cols-2', 'hms-compact-kpi-grid mb-4'],
  ['mb-4 grid gap-3 sm:grid-cols-2', 'hms-compact-kpi-grid mb-3'],
  ['mb-6 grid gap-3 sm:grid-cols-3', 'hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-4'],
  ['mb-4 grid gap-3 sm:grid-cols-3', 'hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-3'],
  ['mb-2 grid gap-3 sm:grid-cols-2', 'hms-compact-kpi-grid mb-2'],
  ['grid gap-3 sm:grid-cols-2 lg:grid-cols-4', 'hms-compact-kpi-grid'],
];

const changed = [];
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.jsx')) continue;
  const fp = path.join(dir, file);
  let content = fs.readFileSync(fp, 'utf8');
  if (!content.includes('StatCard')) continue;
  const orig = content;
  for (const [from, to] of map) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`className="${escaped}"`, 'g'), `className="${to}"`);
  }
  if (content !== orig) {
    fs.writeFileSync(fp, content);
    changed.push(file);
  }
}

console.log('Updated:', changed.length ? changed.join(', ') : 'none');
