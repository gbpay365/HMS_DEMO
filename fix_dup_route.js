// fix_dup_route.js — Fix the duplicate /wards route issue
// Strategy: Replace the OLD route's minimal bed query with the comprehensive one,
// then delete the entire duplicate NEW route.
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');
const lines = src.split('\n');

console.log('Total lines:', lines.length);

// ──────────────────────────────────────────────
// STEP 1: Find the OLD route's bed query and replace it
// ──────────────────────────────────────────────
// Find line containing "SELECT b.*, a.patient_id, p.first_name, p.last_name"
// near the first app.get('/wards'
const oldQueryStart = lines.findIndex((l, i) =>
  i > 2500 && i < 2600 && l.includes("SELECT b.*, a.patient_id, p.first_name, p.last_name")
);
console.log('Old query SELECT line:', oldQueryStart + 1);

// Find the closing `);` of that query (look for next line with just `);`)
let oldQueryEnd = -1;
for (let i = oldQueryStart + 1; i < oldQueryStart + 15; i++) {
  if (lines[i].trim() === '`);') {
    oldQueryEnd = i;
    break;
  }
}
console.log('Old query end line:', oldQueryEnd + 1);

if (oldQueryStart < 0 || oldQueryEnd < 0) {
  console.error('Could not find old query boundaries!');
  process.exit(1);
}

// Build the replacement query
const newQuery = [
  "  const [wards] = await pool.query(`",
  "  SELECT b.*,",
  "  a.id AS admission_id,",
  "  a.patient_id AS adm_patient_id,",
  "  a.patient_id,",
  "  a.admitted_at,",
  "  a.admitting_diagnosis,",
  "  a.admitting_department,",
  "  a.ipd_status,",
  "  a.clinical_discharged_at,",
  "  a.financial_discharged_at,",
  "  a.discharged_at,",
  "  a.ipd_payment_code,",
  "  a.deposit_amount,",
  "  a.running_bill,",
  "  p.first_name, p.last_name,",
  "  doc.first_name AS doc_fn, doc.last_name AS doc_ln",
  "  FROM tbl_bed b",
  "  LEFT JOIN tbl_admission a ON a.bed_id = b.id AND a.discharged_at IS NULL",
  "  LEFT JOIN tbl_patient p ON p.id = a.patient_id",
  "  LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id",
  "  ORDER BY b.ward_name, b.bed_label",
  "  `);"
];

// Replace old query lines with new ones
lines.splice(oldQueryStart, oldQueryEnd - oldQueryStart + 1, ...newQuery);
console.log('Replaced old query (' + (oldQueryEnd - oldQueryStart + 1) + ' lines → ' + newQuery.length + ' lines)');

// ──────────────────────────────────────────────
// STEP 2: Delete the duplicate NEW route entirely
// ──────────────────────────────────────────────
// After splice, line numbers shifted. Find the second app.get('/wards'
const secondRouteIdx = lines.findIndex((l, i) =>
  i > 3000 && l.includes("app.get('/wards'") && l.includes('requireAuth')
);

if (secondRouteIdx < 0) {
  console.log('No second /wards route found — already clean.');
} else {
  console.log('Second /wards route at line:', secondRouteIdx + 1);

  // Find its closing `});` — count braces
  let braceDepth = 0;
  let routeEnd = -1;
  for (let i = secondRouteIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth === 0 && i > secondRouteIdx) {
      routeEnd = i;
      break;
    }
  }

  if (routeEnd > 0) {
    console.log('Second route ends at line:', routeEnd + 1);
    // Also remove any blank line after it
    const extra = (lines[routeEnd + 1] || '').trim() === '' ? 1 : 0;
    lines.splice(secondRouteIdx, routeEnd - secondRouteIdx + 1 + extra);
    console.log('Deleted duplicate route (' + (routeEnd - secondRouteIdx + 1 + extra) + ' lines)');
  } else {
    console.error('Could not find end of second route!');
  }
}

// ──────────────────────────────────────────────
// STEP 3: Write and verify
// ──────────────────────────────────────────────
fs.writeFileSync('app.js', lines.join('\n'), 'utf8');
console.log('\nNew total lines:', lines.length);

// Verify no duplicate
const dupCheck = lines.filter(l => l.includes("app.get('/wards'") && l.includes('requireAuth'));
console.log('app.get /wards routes remaining:', dupCheck.length);

// Syntax check
try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Syntax: OK');
} catch (e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
