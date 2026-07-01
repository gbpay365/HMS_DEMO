'use strict';

async function columnExists(pool, columnName) {
  if (pool?.driver === 'postgres') {
    const [rows] = await pool
      .query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tbl_patient' AND column_name = ?
         LIMIT 1`,
        [columnName]
      )
      .catch(() => [[]]);
    return (rows || []).length > 0;
  }
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
  const { allocateNextPatientCode } = require('./hmsPatientCode');
  let n = 0;
  for (const r of rows) {
    const code = await allocateNextPatientCode(pool);
    const [res] = await pool
      .query(
        `UPDATE tbl_patient
         SET patient_code = ?
         WHERE id = ?
           AND (patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '')`,
        [code, r.id]
      )
      .catch(() => [null]);
    if (res?.affectedRows > 0 || res?.changedRows > 0) n += 1;
  }
  return n;
}

module.exports = async function ensurePatientCodeSchema(pool) {
  if (pool?.driver === 'postgres') {
    await pool
      .query('ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_code VARCHAR(32) NULL')
      .catch(() => {});
    try {
      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_tbl_patient_patient_code ON tbl_patient (patient_code)'
      );
    } catch (_) {
      /* index may already exist under another name */
    }
    return backfillMissingPatientCodes(pool);
  }

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
