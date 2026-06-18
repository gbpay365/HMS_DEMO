// fix_redirect2.js - CRLF-aware redirect patch for clinical discharge
const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

// Find the line index
const allLines = c.split('\n');
const lineIdx = allLines.findIndex(l => l.includes("res.redirect('/wards?msg=Clinical discharge issued"));

if (lineIdx < 0) {
    console.log('Line not found. Lines around CLINICAL DC ERROR:');
    const errIdx = allLines.findIndex(l => l.includes('CLINICAL DC ERROR'));
    allLines.slice(errIdx - 5, errIdx + 2).forEach((l, i) => console.log((errIdx - 5 + i + 1) + ': ' + JSON.stringify(l)));
    process.exit(1);
}

console.log('Found at line:', lineIdx + 1, '->', JSON.stringify(allLines[lineIdx]));

// Replace that single line with the smart redirect block
allLines.splice(lineIdx, 1,
    "  const _ref = req.get('Referer') || '';",
    "  const _dst = _ref.includes('ward-rounds') ? '/ipd/ward-rounds' : '/wards';",
    "  res.redirect(_dst + '?msg=Clinical+discharge+issued.+Patient+awaiting+financial+clearance.');"
);

c = allLines.join('\n');
fs.writeFileSync('app.js', c, 'utf8');

console.log('\nResult around that area:');
const newLines = c.split('\n');
const idx2 = newLines.findIndex(l => l.includes('_ref'));
newLines.slice(idx2 - 2, idx2 + 5).forEach((l, i) => console.log((idx2 - 2 + i + 1) + ': ' + l.trimEnd()));

// Syntax check
try {
    require('child_process').execSync('node --check app.js', { cwd: __dirname });
    console.log('\nSyntax: OK');
} catch (e) {
    console.error('\nSyntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
