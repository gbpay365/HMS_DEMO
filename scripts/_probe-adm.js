'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createDbPool } = require('../lib/dbPool');
(async () => {
  const pool = await createDbPool();
  const [p1055] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE id=1055');
  console.log('p1055', p1055);
  const [v22] = await pool.query('SELECT * FROM tbl_opd_visit WHERE id=22');
  console.log('visit22', v22);
  const [cons] = await pool.query('SELECT id, patient_id FROM tbl_consultation WHERE patient_id=1061 ORDER BY id DESC LIMIT 3').catch((e) => console.log(e.message));
  console.log('cons', cons);
  if (pool.nativePool?.end) await pool.nativePool.end();
})();
