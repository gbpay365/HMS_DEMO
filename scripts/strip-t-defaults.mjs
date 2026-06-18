import fs from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node strip-t-defaults.mjs <file>');
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');
s = s.replace(/\{t\(`doctorSchedule\.warn_\$\{w\.code\}`,\s*\{[\s\S]*?\}\)\}/g, '{t(`doctorSchedule.warn_${w.code}`)}');
s = s.replace(/,\s*\{\s*defaultValue:\s*'(?:\\.|[^'])*'\s*\}/g, '');
s = s.replace(/,\s*\{\s*defaultValue:\s*"([^"\\]|\\.)*"\s*\}/g, '');
s = s.replace(/t\('doctorSchedule\.hours_hint',\s*\{\s*\n\s*\}\)/g, "t('doctorSchedule.hours_hint')");
fs.writeFileSync(file, s);
console.log('remaining defaultValue:', (s.match(/defaultValue/g) || []).length);
