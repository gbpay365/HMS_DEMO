// fix_dup_line.js — remove the duplicate query opening line
const fs = require('fs');
const lines = fs.readFileSync('app.js', 'utf8').split('\n');

// Line 2511 (0-indexed 2510) is the OLD leftover: " const [wards] = await pool.query(`"
// Line 2512 (0-indexed 2511) is the NEW correct one: "  const [wards] = await pool.query(`"
// We need to remove line 2511 (0-indexed 2510)

const targetIdx = 2510; // 0-indexed = line 2511
const line = lines[targetIdx];
console.log('Line to remove:', JSON.stringify(line));

if (line.includes('const [wards] = await pool.query(')) {
  lines.splice(targetIdx, 1);
  console.log('Removed duplicate line. New total:', lines.length);
} else {
  console.error('Line does not match expected content!');
  process.exit(1);
}

fs.writeFileSync('app.js', lines.join('\n'), 'utf8');

// Verify syntax
try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Syntax: OK');
} catch (e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}

// Verify single route
const count = lines.filter(l => l.includes("app.get('/wards'") && l.includes('requireAuth')).length;
console.log('/wards routes:', count);
