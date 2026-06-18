// check_beds.js — diagnose why bed cards show wrong ipd_status
const mysql = require('mysql2/promise');
const cfg = require('./db');

async function run() {
  const pool = mysql.createPool(cfg);

  console.log('=== Occupied Beds — explicit fields ===');
  const [beds] = await pool.query(`
    SELECT b.id AS bed_id, b.bed_label, b.status AS bed_status,
           a.id AS adm_id, a.ipd_status, a.clinical_discharged_at,
           a.discharged_at, p.first_name, p.last_name
    FROM tbl_bed b
    LEFT JOIN tbl_admission a ON a.bed_id = b.id AND a.discharged_at IS NULL
    LEFT JOIN tbl_patient p ON p.id = a.patient_id
    WHERE b.status = 'occupied'
    ORDER BY b.bed_label
  `);
  beds.forEach(r => {
    console.log(
      r.bed_label.padEnd(5) +
      ' | adm:' + String(r.adm_id).padEnd(4) +
      ' | ipd_status:' + String(r.ipd_status).padEnd(22) +
      ' | clin_dc:' + (r.clinical_discharged_at ? 'YES' : 'NULL') +
      ' | ' + r.first_name + ' ' + r.last_name
    );
  });

  console.log('\n=== Same query with b.* (simulating actual app query) ===');
  const [beds2] = await pool.query(`
    SELECT b.*,
           a.id AS admission_id, a.ipd_status, a.clinical_discharged_at,
           p.first_name, p.last_name
    FROM tbl_bed b
    LEFT JOIN tbl_admission a ON a.bed_id = b.id AND a.discharged_at IS NULL
    LEFT JOIN tbl_patient p ON p.id = a.patient_id
    WHERE b.status = 'occupied'
    ORDER BY b.bed_label
  `);
  beds2.forEach(r => {
    console.log(
      r.bed_label.padEnd(5) +
      ' | ipd_status:' + String(r.ipd_status).padEnd(22) +
      ' | clin_dc:' + (r.clinical_discharged_at ? 'YES' : 'NULL')
    );
  });

  await pool.end();
}
run().catch(e => console.error('ERR:', e.message));
