// patch_5features.js — Add Edit Patient, Chart enrichment, Prescription routes
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

// ═══════════════════════════════════════════════════════════
// 1. After POST /patients/add  — add GET/POST /patients/edit/:id
// ═══════════════════════════════════════════════════════════
const editPatientRoutes = `
// GET: Load patient data for Edit modal (JSON)
app.get('/patients/edit/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Save edited patient profile
app.post('/patients/edit/:id', requireAuth, async (req, res) => {
  const { first_name, last_name, gender, dob, phone, email, address, patient_type,
          cni_number, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone } = req.body;
  try {
    await pool.query(\`
      UPDATE tbl_patient SET
        first_name=?, last_name=?, gender=?, dob=?, phone=?, email=?,
        address=?, patient_type=?, cni_number=?,
        next_of_kin_name=?, next_of_kin_relationship=?, next_of_kin_phone=?
      WHERE id=?
    \`, [first_name, last_name, gender, dob||null, phone, email||null,
        address||null, patient_type, cni_number||null,
        next_of_kin_name||null, next_of_kin_relationship||null, next_of_kin_phone||null,
        req.params.id]);
    res.redirect('/patients?msg=Patient+profile+updated.');
  } catch(err) {
    console.error('EDIT PATIENT ERROR:', err.message);
    res.redirect('/patients?err=Update+failed:+' + encodeURIComponent(err.message));
  }
});

`;
const addPatientEnd = src.indexOf("// ADD STAFF POST");
if (addPatientEnd < 0) { console.error('Cannot find // ADD STAFF POST'); process.exit(1); }
src = src.slice(0, addPatientEnd) + editPatientRoutes + src.slice(addPatientEnd);
console.log('✓ Added Edit Patient routes');

// ═══════════════════════════════════════════════════════════
// 2. Enrich GET /patient-chart/:id with Lab, Radiology, Consult, Prescriptions
// ═══════════════════════════════════════════════════════════
const oldChartRoute = `app.get('/patient-chart/:id?', requireAuth, async (req, res) => {
 const pid = req.params.id || req.query.id;
 if (!pid) return res.redirect('/patients');
 try {
 const [patientRows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
 if (patientRows.length === 0) return res.redirect('/patients');
 const patient = patientRows[0];

 const [allergies] = await pool.query('SELECT * FROM tbl_patient_allergy WHERE patient_id = ? ORDER BY id DESC', [pid]);
 const [medications] = await pool.query('SELECT * FROM tbl_patient_medication WHERE patient_id = ? ORDER BY id DESC', [pid]);
 const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]);

 res.render('patient-chart', {
 title: \`Chart: \${patient.first_name} \${patient.last_name}\`,
 patient,
 allergies,
 medications,
 vitals
 });
 } catch (err) {
 console.error('Patient Chart Error:', err.message);
 res.status(500).render('error', { title: 'Error', message: 'Failed to load medical record.', status: 500 });
 }
});`;

const newChartRoute = `app.get('/patient-chart/:id?', requireAuth, async (req, res) => {
 const pid = req.params.id || req.query.id;
 if (!pid) return res.redirect('/patients');
 try {
 const [patientRows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
 if (patientRows.length === 0) return res.redirect('/patients');
 const patient = patientRows[0];

 const [allergies] = await pool.query('SELECT * FROM tbl_patient_allergy WHERE patient_id = ? ORDER BY id DESC', [pid]);
 const [medications] = await pool.query('SELECT * FROM tbl_patient_medication WHERE patient_id = ? ORDER BY id DESC', [pid]);
 const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]);

 // Enriched chart: Lab, Radiology, Consultations, Prescriptions
 const [labResults] = await pool.query(
   'SELECT * FROM tbl_lab_result WHERE patient_id = ? ORDER BY id DESC LIMIT 20', [pid]
 ).catch(() => [[]]);
 const [radResults] = await pool.query(
   'SELECT * FROM tbl_radiology_result WHERE patient_id = ? ORDER BY id DESC LIMIT 20', [pid]
 ).catch(() => [[]]);
 const [consultations] = await pool.query(\`
   SELECT v.id, v.queue_status, v.treatment_note, v.queue_started_at, v.created_at,
          e.first_name AS doc_fn, e.last_name AS doc_ln,
          d.department_name
   FROM tbl_opd_visit v
   LEFT JOIN tbl_employee e ON e.id = v.doctor_id
   LEFT JOIN tbl_department d ON d.id = v.department_id
   WHERE v.patient_id = ?
   ORDER BY v.id DESC LIMIT 20
 \`, [pid]).catch(() => [[]]);
 const [prescriptions] = await pool.query(
   'SELECT * FROM tbl_prescription WHERE patient_id = ? ORDER BY id DESC LIMIT 20', [pid]
 ).catch(() => [[]]);

 res.render('patient-chart', {
 title: \`Chart: \${patient.first_name} \${patient.last_name}\`,
 patient,
 allergies,
 medications,
 vitals,
 labResults: labResults || [],
 radResults: radResults || [],
 consultations: consultations || [],
 prescriptions: prescriptions || []
 });
 } catch (err) {
 console.error('Patient Chart Error:', err.message);
 res.status(500).render('error', { title: 'Error', message: 'Failed to load medical record.', status: 500 });
 }
});`;

if (!src.includes(oldChartRoute.substring(0, 60))) {
  // fallback: find by partial match
  const idx = src.indexOf("app.get('/patient-chart/:id?'");
  if (idx < 0) { console.error('Cannot find patient-chart route'); process.exit(1); }
  // find end of this route
  let depth = 0, i = idx, foundEnd = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { foundEnd = i; break; } }
  }
  src = src.slice(0, idx) + newChartRoute + src.slice(foundEnd + 2);
} else {
  src = src.replace(oldChartRoute, newChartRoute);
}
console.log('✓ Enriched patient-chart route');

// ═══════════════════════════════════════════════════════════
// 3. Add Prescription routes: POST /prescriptions/add, GET /prescriptions/:id, GET /prescriptions/:id/print
// ═══════════════════════════════════════════════════════════
const prescriptionRoutes = `
// POST: New Prescription
app.post('/prescriptions/add', requireAuth, async (req, res) => {
  const { patient_id, title, notes, items } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  try {
    await pool.query(
      'INSERT INTO tbl_prescription (patient_id, title, notes, items, status, created_by, created_at) VALUES (?,?,?,?,\'active\',?,NOW())',
      [parseInt(patient_id)||0, (title||'Prescription').trim(), notes||null, items||null, uid]
    );
    res.redirect('/prescriptions?msg=Prescription+created+successfully.');
  } catch(err) {
    console.error('PRESCRIPTION ADD ERROR:', err.message);
    res.redirect('/prescriptions?err=Failed+to+create+prescription:+' + encodeURIComponent(err.message));
  }
});

// GET: View prescription detail
app.get('/prescriptions/:id', requireAuth, async (req, res) => {
  const rxId = parseInt(req.params.id) || 0;
  try {
    const [rows] = await pool.query(\`
      SELECT r.*, p.first_name, p.last_name, p.phone, p.gender,
             e.first_name AS doc_fn, e.last_name AS doc_ln
      FROM tbl_prescription r
      JOIN tbl_patient p ON p.id = r.patient_id
      LEFT JOIN tbl_employee e ON e.id = r.created_by
      WHERE r.id = ? LIMIT 1
    \`, [rxId]);
    if (!rows.length) return res.redirect('/prescriptions?err=Prescription+not+found.');
    res.render('prescription-detail', {
      title: 'Prescription #RX-' + rxId,
      rx: rows[0],
      printMode: false
    });
  } catch(err) {
    console.error('PRESCRIPTION DETAIL ERROR:', err.message);
    res.status(500).render('error', { title: 'Error', message: 'Cannot load prescription.', status: 500 });
  }
});

// GET: Print prescription
app.get('/prescriptions/:id/print', requireAuth, async (req, res) => {
  const rxId = parseInt(req.params.id) || 0;
  try {
    const [rows] = await pool.query(\`
      SELECT r.*, p.first_name, p.last_name, p.phone, p.gender, p.dob,
             e.first_name AS doc_fn, e.last_name AS doc_ln
      FROM tbl_prescription r
      JOIN tbl_patient p ON p.id = r.patient_id
      LEFT JOIN tbl_employee e ON e.id = r.created_by
      WHERE r.id = ? LIMIT 1
    \`, [rxId]);
    if (!rows.length) return res.redirect('/prescriptions');
    res.render('prescription-detail', {
      title: 'Print Rx #RX-' + rxId,
      rx: rows[0],
      printMode: true
    });
  } catch(err) {
    res.status(500).send('Error loading prescription for print.');
  }
});

`;

// Insert before BILLING route
const billingIdx = src.indexOf("// BILLING & TRANSACTIONS");
const billingIdx2 = src.indexOf("app.get('/billing'");
const insertAt = billingIdx > 0 ? billingIdx : billingIdx2;
if (insertAt < 0) { console.error('Cannot find billing route marker'); process.exit(1); }
src = src.slice(0, insertAt) + prescriptionRoutes + src.slice(insertAt);
console.log('✓ Added Prescription routes');

// ═══════════════════════════════════════════════════════════
// Write & verify
// ═══════════════════════════════════════════════════════════
fs.writeFileSync('app.js', src, 'utf8');
try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('✓ Syntax: OK');
} catch(e) {
  console.error('✗ Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
  process.exit(1);
}
console.log('All backend patches applied successfully.');
