// fix_portal_route.js — Replace patient portal route with enriched version
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

const idx = src.indexOf("// PATIENT PORTAL (STAFF VIEW / PREVIEW)");
if (idx < 0) { console.error('Cannot find patient portal route'); process.exit(1); }

// Find end of this route block
let depth = 0, i = idx, end = -1;
let inRoute = false;
for (; i < src.length; i++) {
  if (src[i] === '{') { depth++; inRoute = true; }
  else if (src[i] === '}') {
    depth--;
    if (inRoute && depth === 0) { end = i; break; }
  }
}
if (end < 0) { console.error('Could not find end of route'); process.exit(1); }
// skip trailing semicolon/newline
while (end + 1 < src.length && (src[end+1] === ';' || src[end+1] === '\r' || src[end+1] === '\n')) end++;

console.log('Replacing patient portal route, chars', idx, '-', end);

const newRoute = `// PATIENT PORTAL (STAFF VIEW / PREVIEW)
app.get('/patient-portal', requireAuth, async (req, res) => {
 try {
 const pid = parseInt(req.query.id) || 1;
 const [patientRows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
 if (patientRows.length === 0) {
  return res.render('error', { title: 'No Patient', message: 'Patient not found.', status: 404 });
 }
 const patient = patientRows[0];
 const [appts] = await pool.query(\`
  SELECT a.*, e.first_name AS doc_fn, e.last_name AS doc_ln, d.department_name
  FROM tbl_appointment a
  LEFT JOIN tbl_employee e ON e.id = a.doctor_id
  LEFT JOIN tbl_department d ON d.id = a.department_id
  WHERE a.patient_id = ? ORDER BY a.date DESC LIMIT 10
 \`, [pid]).catch(() => [[]]);
 const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 5', [pid]).catch(() => [[]]);
 const [walletRows] = await pool.query('SELECT balance, qr_token FROM tbl_patient_wallet WHERE patient_id = ? LIMIT 1', [pid]).catch(() => [[]]);
 const [labResults] = await pool.query('SELECT * FROM tbl_lab_result WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]).catch(() => [[]]);
 const [radResults] = await pool.query('SELECT * FROM tbl_radiology_result WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]).catch(() => [[]]);
 const [prescriptions] = await pool.query('SELECT * FROM tbl_prescription WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]).catch(() => [[]]);
 const [consultations] = await pool.query(\`
  SELECT v.id, v.queue_status, v.treatment_note, v.created_at,
         e.first_name AS doc_fn, e.last_name AS doc_ln, d.department_name
  FROM tbl_opd_visit v
  LEFT JOIN tbl_employee e ON e.id = v.doctor_id
  LEFT JOIN tbl_department d ON d.id = v.department_id
  WHERE v.patient_id = ? ORDER BY v.id DESC LIMIT 10
 \`, [pid]).catch(() => [[]]);
 const [allPatients] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name LIMIT 200').catch(() => [[]]);
 res.render('patient-portal', {
  title: patient.first_name + ' ' + patient.last_name + ' — Patient Portal',
  patient,
  appointments: appts || [],
  vitals: vitals || [],
  wallet: walletRows[0] || null,
  labResults: labResults || [],
  radResults: radResults || [],
  prescriptions: prescriptions || [],
  consultations: consultations || [],
  allPatients: allPatients || [],
  currentPid: pid,
  flash: req.query.msg || null,
  error: req.query.err || null
 });
 } catch (err) {
 console.error('PORTAL ERROR:', err.message);
 res.status(500).render('error', { title: 'Error', message: 'Portal load failure.', status: 500 });
 }
});`;

src = src.slice(0, idx) + newRoute + src.slice(end + 1);
fs.writeFileSync('app.js', src, 'utf8');
try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Patient portal route updated - Syntax OK');
} catch(e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
