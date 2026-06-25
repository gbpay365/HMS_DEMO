'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = await createDbPool();
  console.log('driver', pool.driver);
  const [patients] = await pool.query(
    'SELECT id, first_name, last_name FROM tbl_patient ORDER BY id DESC LIMIT 5'
  );
  console.log('patients', JSON.stringify(patients, null, 2));
  const [opd] = await pool.query(
    `SELECT id, patient_id, status, is_emergency FROM tbl_opd_visit ORDER BY id DESC LIMIT 10`
  ).catch(() => [[]]);
  console.log('opd', JSON.stringify(opd, null, 2));
  const [opdNonEr] = await pool.query(
    `SELECT v.id, v.patient_id, v.status, p.first_name, p.last_name
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
      WHERE COALESCE(v.is_emergency,0) = 0
      ORDER BY v.id DESC LIMIT 5`
  ).catch(() => [[]]);
  console.log('opdNonEr', JSON.stringify(opdNonEr, null, 2));
  const [soule] = await pool.query(
    `SELECT id, first_name, last_name FROM tbl_patient WHERE LOWER(last_name) LIKE '%soule%' OR LOWER(first_name) LIKE '%ghou%' LIMIT 5`
  ).catch(() => [[]]);
  console.log('soule', JSON.stringify(soule, null, 2));
  const [visCols] = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tbl_opd_visit' LIMIT 30`
  ).catch(() => [[]]);
  console.log('visit cols', visCols.map((c) => c.column_name || c.COLUMN_NAME).join(', '));
  const [cons] = await pool.query(
    `SELECT id, patient_id, visit_id FROM tbl_consultation ORDER BY id DESC LIMIT 5`
  ).catch((e) => { console.log('cons err', e.message); return [[]]; });
  console.log('cons', JSON.stringify(cons, null, 2));
  const [tickets] = await pool.query(
    `SELECT id, patient_id, status, reference FROM tbl_payment_ticket ORDER BY id DESC LIMIT 5`
  ).catch((e) => { console.log('ticket err', e.message); return [[]]; });
  console.log('tickets', JSON.stringify(tickets, null, 2));
  const [admRows] = await pool.query('SELECT id, patient_id, bed_id, clinical_discharged_at, discharged_at FROM tbl_admission ORDER BY id DESC LIMIT 5').catch((e) => {
    console.log('admRows err', e.message); return [[]];
  });
  console.log('admRows', JSON.stringify(admRows, null, 2));
  const [ipdTables] = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND (table_name LIKE '%admission%' OR table_name LIKE '%ipd%' OR table_name LIKE '%hospital%') ORDER BY table_name`
  ).catch(() => [[]]);
  console.log('ipd tables', ipdTables.map((t) => t.table_name).slice(0, 20));
  const [matRows] = await pool.query(`SELECT id, patient_id FROM maternity_patients ORDER BY id DESC LIMIT 5`).catch((e) => {
    console.log('mat err', e.message); return [[]];
  });
  console.log('matRows', JSON.stringify(matRows, null, 2));
  const [allVisits] = await pool.query(
    `SELECT id, patient_id, queue_status, is_emergency, department FROM tbl_opd_visit ORDER BY id DESC LIMIT 10`
  ).catch((e) => { console.log('vis err', e.message); return [[]]; });
  console.log('allVisits', JSON.stringify(allVisits, null, 2));
  const [er] = await pool.query(
    `SELECT id, patient_id, queue_status FROM tbl_opd_visit WHERE is_emergency = 1 ORDER BY id DESC LIMIT 3`
  ).catch(() => [[]]);
  console.log('er', JSON.stringify(er, null, 2));
  if (pool.nativePool && pool.nativePool.end) await pool.nativePool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
