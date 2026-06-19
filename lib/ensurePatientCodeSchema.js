'use strict';

const { formatPatientCode } = require('./hmsPatientCode');

async function columnExists(pool, columnName) {
  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient' AND COLUMN_NAME = ?`,
      [columnName]
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(row?.c || 0, 10) > 0;
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    const msg = String(e.message || '');
    if (
      e.code === 'ER_DUP_FIELDNAME' ||
      e.errno === 1060 ||
      /Duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw e;
  }
}

async function backfillMissingPatientCodes(pool) {
  const [rows] = await pool.query(
    `SELECT id FROM tbl_patient
     WHERE patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = ''
     ORDER BY id ASC`
  );
  if (!rows.length) return 0;
  let n = 0;
  for (const r of rows) {
    const code = formatPatientCode(r.id);
    await pool.query('UPDATE tbl_patient SET patient_code = ? WHERE id = ?', [code, r.id]);
    n += 1;
  }
  return n;
}

module.exports = async function ensurePatientCodeSchema(pool) {
  if (pool && pool.driver === 'postgres') return 0;
  if (!(await columnExists(pool, 'patient_code'))) {
    await safeAlter(
      pool,
      "ALTER TABLE tbl_patient ADD COLUMN patient_code VARCHAR(32) NULL DEFAULT NULL COMMENT 'Hospital ID e.g. SHG-000001-SOA'"
    );
  }
  try {
    await pool.query(
      'CREATE UNIQUE INDEX uq_tbl_patient_patient_code ON tbl_patient (patient_code)'
    );
  } catch (e) {
    const msg = String(e.message || '');
    if (
      e.code === 'ER_DUP_KEYNAME' ||
      e.errno === 1061 ||
      /Duplicate key name/i.test(msg)
    ) {
      /* index already exists */
    } else {
      throw e;
    }
  }
  return backfillMissingPatientCodes(pool);
};
