'use strict';

/**
 * Simulates PostgreSQL transaction abort when DDL fails inside txn (regression guard).
 * Run: node scripts/test-patient-add-transaction.js
 */
const { loadEnv } = require('../lib/loadEnv');
loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { preparePatientRegistrationSchemas } = require('../lib/preparePatientRegistration');
const { findDuplicatePatient } = require('../lib/patientDuplicate');
const { allocateNextPatientCodeLocked } = require('../lib/hmsPatientCode');
const { resolveInsertPatientId } = require('../lib/patientDirectory');
const { normalizePatientPhone } = require('../lib/patientAge');

(async () => {
  const pool = createDbPool();
  console.log('driver:', pool.driver);

  await preparePatientRegistrationSchemas(pool);

  const conn = await pool.getConnection();
  const stamp = Date.now();
  const phone = normalizePatientPhone(`690${String(stamp).slice(-7)}`);
  try {
    await conn.beginTransaction();

    if (pool.driver === 'postgres') {
      // This used to abort the txn on PG while Node swallowed the error.
      await conn
        .query('ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS portal_enabled TINYINT DEFAULT 0')
        .catch(() => {});
      const [probe] = await conn.query('SELECT 1 AS ok');
      if (!probe?.[0]?.ok) throw new Error('probe failed after swallowed DDL');
    }

    const duplicate = await findDuplicatePatient(conn, {
      first_name: 'TxnTest',
      last_name: 'Patient',
      phone,
      age_years: 40,
      age_only_registration: 1,
    });
    if (duplicate) {
      console.log('duplicate exists — skip insert', duplicate.id);
      await conn.rollback();
      return;
    }

    const patientCode = await allocateNextPatientCodeLocked(conn);
    const [result] = await conn.query(
      `INSERT INTO tbl_patient
       (patient_code, first_name, last_name, gender, dob, age_years, age_only_registration, phone, email, address, patient_type,
        portal_enabled, status, facility_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        patientCode,
        'TxnTest',
        'Patient',
        'Male',
        '',
        40,
        1,
        phone,
        '',
        '',
        'OutPatient',
        0,
        1,
        1,
      ]
    );
    const newPid = await resolveInsertPatientId(conn, result);
    await conn.commit();
    console.log('OK inserted test patient', newPid, patientCode);

    await pool.query('DELETE FROM tbl_patient WHERE id = ?', [newPid]).catch(() => {});
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
