// patch_backend.js — Apply all 3 backend changes to app.js
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');
const lines = src.split('\n');
console.log('Original lines:', lines.length);

// ═══════════════════════════════════════
// 1. Fix vitals save route (around line 2988)
// ═══════════════════════════════════════
const vitalsStart = lines.findIndex((l, i) => i > 2980 && l.includes("app.post('/nursing/vitals/save'"));
if (vitalsStart < 0) { console.error('Cannot find vitals save route!'); process.exit(1); }

// Find closing });
let vitalsEnd = -1;
let depth = 0;
for (let i = vitalsStart; i < lines.length; i++) {
  for (const ch of lines[i]) { if (ch === '{') depth++; if (ch === '}') depth--; }
  if (depth === 0 && i > vitalsStart) { vitalsEnd = i; break; }
}
console.log('Vitals save route:', vitalsStart + 1, '-', vitalsEnd + 1);

const newVitalsRoute = `app.post('/nursing/vitals/save', requireAuth, async (req, res) => {
 const { patient_id, bp_sys, bp_dia, heart_rate, temp_c, spo2, rr, weight_kg, height_cm, waist_cm } = req.body;
 try {
 await pool.query(\`
 INSERT INTO tbl_vital_sign (
 facility_id, patient_id, bp_sys, bp_dia, heart_rate, temp_c, spo2, rr, 
 weight_kg, height_cm, waist_cm, recorded_by, source_station, recorded_at
 ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nursing', NOW())
 \`, [
 patient_id, bp_sys || null, bp_dia || null, heart_rate || null, 
 temp_c || null, spo2 || null, rr || null, 
 weight_kg || null, height_cm || null, waist_cm || null, 
 req.session.userId || req.session.user?.id || 1
 ]);
 // Smart redirect: if called from ward rounds, go back there
 const ref = req.get('Referer') || '';
 if (ref.includes('ward-rounds')) {
  return res.redirect('/ipd/ward-rounds?msg=Vitals+saved+successfully.');
 }
 res.redirect('/nursing/vitals?msg=Vitals+Saved+Successfully');
 } catch (err) {
 console.error('VITALS SAVE ERROR:', err.message);
 const back = (req.get('Referer') || '/nursing/vitals');
 res.redirect(back + (back.includes('?') ? '&' : '?') + 'err=Vitals+save+failed');
 }
});`;

lines.splice(vitalsStart, vitalsEnd - vitalsStart + 1, ...newVitalsRoute.split('\n'));
console.log('Replaced vitals save route');

// ═══════════════════════════════════════
// 2. Fix ward round save + add service catalog API (around line 4177)
// ═══════════════════════════════════════
// After vitals splice, line numbers shifted. Re-find.
const wrSaveStart = lines.findIndex((l, i) => i > 4000 && l.includes("app.post('/ipd/ward-rounds/save'"));
if (wrSaveStart < 0) { console.error('Cannot find ward-rounds/save route!'); process.exit(1); }

let wrSaveEnd = -1;
depth = 0;
for (let i = wrSaveStart; i < lines.length; i++) {
  for (const ch of lines[i]) { if (ch === '{') depth++; if (ch === '}') depth--; }
  if (depth === 0 && i > wrSaveStart) { wrSaveEnd = i; break; }
}
console.log('Ward round save route:', wrSaveStart + 1, '-', wrSaveEnd + 1);

const newWrSaveAndApi = `// POST: Doctor saves ward round notes for a specific admission
app.post('/ipd/ward-rounds/save', requireAuth, async (req, res) => {
 const { admission_id, ward_notes, new_orders } = req.body;
 const uid = req.session.userId || req.session.user?.id || 1;
 const aid = parseInt(admission_id) || 0;
 if (aid < 1) return res.redirect('/ipd/ward-rounds?err=Invalid+admission.');

 try {
 const [adm] = await pool.query('SELECT patient_id FROM tbl_admission WHERE id = ? LIMIT 1', [aid]);
 const pid = adm[0]?.patient_id || 0;
 if (pid < 1) return res.redirect('/ipd/ward-rounds?err=Admission+not+found.');

 await pool.query(\`
 INSERT INTO tbl_ipd_ward_note (admission_id, patient_id, note_text, orders_text, written_by)
 VALUES (?, ?, ?, ?, ?)
 \`, [aid, pid, ward_notes || '', new_orders || '', uid]);

 res.redirect('/ipd/ward-rounds?msg=Ward+round+note+saved.');
 } catch(err) {
 // Auto-create table if missing
 if (err.message && err.message.includes("doesn't exist")) {
  try {
  await pool.query(\`
   CREATE TABLE IF NOT EXISTS tbl_ipd_ward_note (
   id INT AUTO_INCREMENT PRIMARY KEY,
   admission_id INT NOT NULL,
   patient_id INT NOT NULL,
   note_text TEXT,
   orders_text TEXT,
   written_by INT DEFAULT NULL,
   written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   KEY idx_admission (admission_id)
   )
  \`);
  const [adm2] = await pool.query('SELECT patient_id FROM tbl_admission WHERE id = ? LIMIT 1', [aid]);
  await pool.query('INSERT INTO tbl_ipd_ward_note (admission_id, patient_id, note_text, orders_text, written_by) VALUES (?,?,?,?,?)',
   [aid, adm2[0]?.patient_id || 0, ward_notes || '', new_orders || '', uid]);
  return res.redirect('/ipd/ward-rounds?msg=Ward+round+note+saved.');
  } catch(e2) {
  console.error('WARD NOTE TABLE CREATE ERROR:', e2.message);
  }
 }
 console.error('WARD ROUND SAVE ERROR:', err.message);
 res.redirect('/ipd/ward-rounds?err=Save+failed:+' + encodeURIComponent(err.message));
 }
});

// API: Service catalog by category (for IPD Add Charge modal)
app.get('/api/service-catalog', requireAuth, async (req, res) => {
 const cat = (req.query.category || '').trim().toLowerCase();
 if (!cat) return res.json([]);
 try {
 const [rows] = await pool.query(
  "SELECT id, name, price FROM tbl_service_catalog WHERE status = 1 AND LOWER(TRIM(category)) = ? ORDER BY name",
  [cat]
 );
 res.json(rows || []);
 } catch(err) {
 console.error('SERVICE CATALOG API ERROR:', err.message);
 res.json([]);
 }
});`;

// Find the comment line before the save route too
let commentLine = wrSaveStart;
if (lines[wrSaveStart - 1] && lines[wrSaveStart - 1].includes('POST: Doctor saves')) {
  commentLine = wrSaveStart - 1;
}

lines.splice(commentLine, wrSaveEnd - commentLine + 1, ...newWrSaveAndApi.split('\n'));
console.log('Replaced ward round save + added service catalog API');

// ═══════════════════════════════════════
// Write and verify
// ═══════════════════════════════════════
fs.writeFileSync('app.js', lines.join('\n'), 'utf8');
console.log('New total lines:', lines.length);

try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Syntax: OK');
} catch(e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
