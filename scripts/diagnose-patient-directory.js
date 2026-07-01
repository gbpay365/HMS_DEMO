'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();
const { createDbPool } = require('../lib/dbPool');
const {
  loadPatientDirectory,
  countActivePatients,
  patientActiveWhere,
  directorySearchWhere,
  directorySearchBindings,
  searchPatientsForPicker,
  mapPatientRow,
} = require('../lib/patientDirectory');

async function safeQuery(pool, label, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message, label };
  }
}

(async () => {
  const pool = createDbPool();
  console.log('driver:', pool.driver);

  const latest = await safeQuery(
    pool,
    'latest',
    `SELECT id, patient_code, first_name, last_name, phone, status, created_at
     FROM tbl_patient ORDER BY id DESC LIMIT 8`
  );
  console.log('\n=== Latest patients ===');
  if (!latest.ok) {
    console.error('latest failed:', latest.error);
  } else {
    for (const r of latest.rows) {
      console.log(JSON.stringify(r));
    }
  }

  const rawCount = await safeQuery(pool, 'raw-count', 'SELECT COUNT(*) AS total FROM tbl_patient');
  console.log('\n=== Raw COUNT(*) ===', rawCount.ok ? rawCount.rows[0] : rawCount.error);

  const activeWhere = patientActiveWhere('', pool);
  const activeCount = await safeQuery(
    pool,
    'active-count',
    `SELECT COUNT(*) AS total FROM tbl_patient WHERE ${activeWhere}`
  );
  console.log('\n=== Active count (patientActiveWhere) ===', activeCount.ok ? activeCount.rows[0] : activeCount.error);

  try {
    const total = await countActivePatients(pool);
    console.log('countActivePatients():', total);
  } catch (e) {
    console.error('countActivePatients threw:', e.message);
  }

  const statusMix = await safeQuery(
    pool,
    'status-mix',
    pool.driver === 'postgres'
      ? `SELECT CAST(status AS TEXT) AS status_text, COUNT(*) AS c
         FROM tbl_patient GROUP BY CAST(status AS TEXT) ORDER BY c DESC LIMIT 20`
      : `SELECT CAST(status AS CHAR) AS status_text, COUNT(*) AS c
         FROM tbl_patient GROUP BY status ORDER BY c DESC LIMIT 20`
  );
  console.log('\n=== Status value distribution ===');
  if (statusMix.ok) {
    for (const r of statusMix.rows) console.log(r);
  } else {
    console.error(statusMix.error);
  }

  for (const q of ['Yaya', 'ZAI', 'ZAI-001061-ZNS']) {
    console.log(`\n=== Search q=${JSON.stringify(q)} ===`);
    try {
      const whereSearch = directorySearchWhere(pool);
      const bindings = directorySearchBindings(q, pool);
      const res = await safeQuery(
        pool,
        'directory-search',
        `SELECT id, patient_code, first_name, last_name, status
         FROM tbl_patient WHERE ${activeWhere} AND ${whereSearch}
         ORDER BY id DESC LIMIT 5`,
        bindings
      );
      if (!res.ok) {
        console.error('SQL search failed:', res.error);
      } else {
        console.log('rows:', res.rows.length);
        for (const r of res.rows) console.log(JSON.stringify(r));
      }
      const picker = await searchPatientsForPicker(pool, q, 5);
      console.log('picker rows:', picker.length);
      for (const r of picker) console.log(JSON.stringify(r));
    } catch (e) {
      console.error('search threw:', e.message);
    }
  }

  try {
    const dir = await loadPatientDirectory(pool, {});
    console.log('\n=== loadPatientDirectory() no q ===');
    console.log('total:', dir.patientTotal, 'patients:', dir.patients.length, 'queryError:', dir.queryError);
    if (dir.patients[0]) console.log('newest:', JSON.stringify(dir.patients[0]));
  } catch (e) {
    console.error('loadPatientDirectory failed:', e.message);
  }

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
