// patch_chart_insurance.js
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

const oldCode = `  const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]);

  res.render('patient-chart', {
  title: \`Chart: \${patient.first_name} \${patient.last_name}\`,
  patient,
  allergies,
  medications,
  vitals
  });`;

const newCode = `  const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]);
  const [[activeInsurance]] = await pool.query(\`
    SELECT pi.*, ic.name AS carrier_name 
    FROM tbl_patient_insurance pi
    JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
    WHERE pi.patient_id = ? AND pi.is_primary = 1
    LIMIT 1
  \`, [pid]).catch(() => [[]]);

  res.render('patient-chart', {
  title: \`Chart: \${patient.first_name} \${patient.last_name}\`,
  patient,
  allergies,
  medications,
  vitals,
  activeInsurance
  });`;

// Try with different whitespace if needed, but I'll try to find the anchor
const marker = "const [vitals] = await pool.query('SELECT * FROM tbl_vital_sign WHERE patient_id = ? ORDER BY id DESC LIMIT 10', [pid]);";
const idx = src.indexOf(marker);

if (idx >= 0) {
  // Find the next res.render
  const renderIdx = src.indexOf('res.render(\'patient-chart\'', idx);
  const endIdx = src.indexOf('});', renderIdx);
  if (renderIdx > 0 && endIdx > 0) {
    src = src.slice(0, idx) + newCode + src.slice(endIdx + 3);
    fs.writeFileSync('app.js', src, 'utf8');
    console.log('Successfully patched patient-chart route with activeInsurance.');
  } else {
    console.error('Could not find res.render for patient-chart');
  }
} else {
  console.error('Marker not found');
}
