'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();
const { createDbPool } = require('../lib/dbPool');
const {
  patientActiveWhere,
  patientInactiveWhere,
  countActivePatients,
  loadPatientDirectory,
  ensurePatientVisibleAfterRegistration,
  searchPatientsForPicker,
} = require('../lib/patientDirectory');

(async () => {
  const pool = createDbPool();
  console.log('driver:', pool.driver);

  console.log('activeWhere:', patientActiveWhere('', pool));
  console.log('inactiveWhere:', patientInactiveWhere('', pool));

  const total = await countActivePatients(pool);
  console.log('countActivePatients:', total);

  const dir = await loadPatientDirectory(pool, { q: 'Ghouenzen' });
  console.log('search Ghouenzen:', dir.patients.length, 'total', dir.patientTotal, 'err', dir.queryError);

  const latest = await pool.query(
    'SELECT id, patient_code, first_name, last_name, status FROM tbl_patient ORDER BY id DESC LIMIT 1'
  );
  const row = latest[0]?.[0];
  if (row) {
    console.log('latest patient:', row);
    await ensurePatientVisibleAfterRegistration(pool, row.id, row.patient_code);
    const after = await countActivePatients(pool);
    console.log('count after ensure visible:', after);
    const pick = await searchPatientsForPicker(pool, row.first_name, 3);
    console.log('picker by first_name:', pick.length, pick[0]?.first_name);
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
