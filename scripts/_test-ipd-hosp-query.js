'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ipdHosp = require('../lib/ipdHospitalization');
const { createDbPool } = require('../lib/dbPool');
const { adaptQuery } = require('../lib/pgSqlAdapter');

(async () => {
  const pool = await createDbPool();
  const nd = ipdHosp.NOT_DISCHARGED;
  const safeAdm = ipdHosp.safeDateTimeSql('a.admitted_at');
  const safeDis = ipdHosp.safeDateTimeSql('a.discharged_at');
  const sql = `SELECT a.id, a.patient_id, a.ipd_status, ${safeAdm} AS admitted_at, ${safeDis} AS discharged_at,
               a.hospitalization_reason, a.running_bill, a.deposit_amount,
               p.first_name, p.last_name, b.ward_name, b.bed_label,
               (SELECT COUNT(*) FROM tbl_ipd_surgery s WHERE s.admission_id=a.id AND s.status NOT IN ('cancelled')) AS surgery_count
        FROM tbl_admission a
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
        WHERE ${nd}
        ORDER BY ${ipdHosp.ORDER_ADMISSION_RECENT}
        LIMIT 200`;
  console.log('--- adapted ---');
  console.log(adaptQuery(sql, []).text);
  try {
    const [rows] = await pool.query(sql);
    console.log('OK rows', rows.length, rows);
  } catch (e) {
    console.error('QUERY ERR:', e.message);
  }
  if (pool.nativePool?.end) await pool.nativePool.end();
})();
