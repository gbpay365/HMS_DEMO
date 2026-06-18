'use strict';

/**
 * Load tbl_patient by id for clinical flows (consultation, chart, etc.).
 * Ensures optional columns exist and retries without age_years if the DB is older.
 */
const { ensurePatientAgeColumns } = require('./patientAge');

async function ensurePatientAgeColumn(pool) {
 await ensurePatientAgeColumns(pool);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} patientId
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function fetchPatientById(pool, patientId) {
 const id = parseInt(patientId, 10) || 0;
 if (id < 1) return null;

 await ensurePatientAgeColumn(pool);

 const fullSql =
  'SELECT id, first_name, last_name, phone, gender, dob, age_years, age_only_registration, status, email, address, patient_type FROM tbl_patient WHERE id=? LIMIT 1';
 const legacySql =
  'SELECT id, first_name, last_name, phone, gender, dob, status FROM tbl_patient WHERE id=? LIMIT 1';
 const minimalSql =
  'SELECT id, first_name, last_name, phone, gender, dob FROM tbl_patient WHERE id=? LIMIT 1';

 try {
  const [rows] = await pool.query(fullSql, [id]);
  return rows[0] || null;
 } catch (e) {
  if (!e || e.code !== 'ER_BAD_FIELD_ERROR') throw e;
  for (const sql of [legacySql, minimalSql]) {
   try {
    const [rows] = await pool.query(sql, [id]);
    const row = rows[0] || null;
    if (!row) return null;
    if (row.age_years === undefined) row.age_years = null;
    if (row.age_only_registration === undefined) row.age_only_registration = 0;
    if (row.status === undefined) row.status = 1;
    return row;
   } catch (e2) {
    if (!e2 || e2.code !== 'ER_BAD_FIELD_ERROR') throw e2;
   }
  }
  return null;
 }
}

module.exports = { fetchPatientById, ensurePatientAgeColumn };
