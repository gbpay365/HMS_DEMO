'use strict';

const { patientIdentityCompositeKey } = require('./patientIdentityKey');

/**
 * Enforce patient identity uniqueness at storage level (first + last + phone + DOB/age).
 * Uses a hashed `patient_identity_key` column because MySQL unique indexes on nullable DOB
 * and normalized text are awkward across age-only registrations.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensurePatientIdentitySchema(pool) {
  await pool
    .query(
      `ALTER TABLE tbl_patient
       ADD COLUMN IF NOT EXISTS patient_identity_key VARCHAR(64) NULL`
    )
    .catch(() => {});

  await pool
    .query(
      `UPDATE tbl_patient SET patient_identity_key = NULL WHERE status <> 1 OR status IS NULL`
    )
    .catch(() => {});

  const [rows] = await pool
    .query(
      `SELECT id, first_name, last_name, phone, dob, age_years, age_only_registration, status
       FROM tbl_patient WHERE status = 1`
    )
    .catch(() => [[]]);

  for (const row of rows || []) {
    const key = patientIdentityCompositeKey(row);
    if (!key) continue;
    await pool
      .query('UPDATE tbl_patient SET patient_identity_key = ? WHERE id = ? LIMIT 1', [key, row.id])
      .catch(() => {});
  }

  await pool
    .query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_identity_key ON tbl_patient (patient_identity_key)`
    )
    .catch(async () => {
      try {
        await pool.query(
          `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient'
             AND INDEX_NAME = 'uq_patient_identity_key'`
        );
      } catch (_) {
        await pool
          .query(`ALTER TABLE tbl_patient ADD UNIQUE KEY uq_patient_identity_key (patient_identity_key)`)
          .catch(() => {});
      }
    });
}

/**
 * Refresh identity key for one patient row (call after insert/update).
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} pool
 * @param {number} patientId
 */
async function refreshPatientIdentityKey(pool, patientId) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  const [[row]] = await pool
    .query(
      `SELECT id, first_name, last_name, phone, dob, age_years, age_only_registration, status
       FROM tbl_patient WHERE id = ? LIMIT 1`,
      [pid]
    )
    .catch(() => [[null]]);
  if (!row || row.status !== 1) {
    await pool.query('UPDATE tbl_patient SET patient_identity_key = NULL WHERE id = ? LIMIT 1', [pid]).catch(() => {});
    return;
  }
  const key = patientIdentityCompositeKey(row);
  await pool
    .query('UPDATE tbl_patient SET patient_identity_key = ? WHERE id = ? LIMIT 1', [key || null, pid])
    .catch(() => {});
}

module.exports = { ensurePatientIdentitySchema, refreshPatientIdentityKey };
