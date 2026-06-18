// add_role_guard.js — inserts role check at clinical discharge route
const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');

// Find the line with the clinical-discharge route handler
const routeIdx = lines.findIndex(l => l.includes("app.post('/wards/clinical-discharge'"));
if (routeIdx < 0) { console.error('Route not found!'); process.exit(1); }
console.log('Route found at line:', routeIdx + 1);

// Find the next line after the route (where the body starts)
// Insert role guard after the opening brace line
// Lines look like: "app.post('/wards/clinical-discharge', requireAuth, async (req, res) => {"
// followed by: " const { admission_id, ... } = req.body;"
const bodyIdx = routeIdx + 1;

const guard = [
  " // ROLE GUARD: Only Doctor (2), Admin (1), Super Admin (99) may issue clinical discharge",
  " const _callerRole = String((req.session.user || {}).role || '');",
  " if (!['1','2','99'].includes(_callerRole)) {",
  "  const _ref2 = req.get('Referer') || '';",
  "  const _back = _ref2.includes('ward-rounds') ? '/ipd/ward-rounds' : '/wards';",
  "  return res.redirect(_back + '?err=Access+denied.+Clinical+discharge+requires+Doctor+or+Admin+role.');",
  " }"
];

lines.splice(bodyIdx, 0, ...guard);
fs.writeFileSync('app.js', lines.join('\n'), 'utf8');

// Verify
const newLines = lines;
console.log('\nLines around role guard:');
newLines.slice(routeIdx, routeIdx + 12).forEach((l, i) => console.log((routeIdx + i + 1) + ': ' + l.trimEnd()));

// Syntax check
try {
    require('child_process').execSync('node --check app.js', { cwd: __dirname });
    console.log('\nSyntax: OK');
} catch (e) {
    console.error('\nSyntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
