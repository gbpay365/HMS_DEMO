// fix_redirect.js — patch the clinical discharge redirect to be referer-aware
const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

// Find the exact line and replace it
const OLD = "  res.redirect('/wards?msg=Clinical discharge issued. Patient awaiting financial clearance.');";
const NEW = [
  "  // Smart redirect: go back to Ward Rounds if that's where the user came from",
  "  const _referer = req.get('Referer') || '';",
  "  const _dest    = _referer.includes('ward-rounds') ? '/ipd/ward-rounds' : '/wards';",
  "  res.redirect(_dest + '?msg=Clinical+discharge+issued.+Patient+awaiting+financial+clearance.');"
].join('\n');

if (c.includes(OLD)) {
    c = c.replace(OLD, NEW);
    fs.writeFileSync('app.js', c, 'utf8');
    console.log('Redirect patched successfully.');
} else {
    console.log('OLD string not found. Showing nearby lines:');
    const lines = c.split('\n');
    const i = lines.findIndex(l => l.includes('Clinical discharge issued'));
    if (i >= 0) lines.slice(i-2, i+3).forEach((l, j) => console.log((i-2+j+1) + ': ' + JSON.stringify(l)));
}

// Syntax check
try {
    require('child_process').execSync('node --check app.js', {cwd: __dirname});
    console.log('Syntax: OK');
} catch(e) {
    console.error('Syntax error:', e.message.split('\n')[0]);
}
