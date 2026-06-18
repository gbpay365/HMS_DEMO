'use strict';

async function hasColumn(pool, table, col) {
  const [rows] = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, col]
    )
    .catch(() => [[]]);
  return !!(rows && rows[0]);
}

/** Align tbl_vital_sign with legacy schemas that require recorded_at / recorded_by. */
async function ensureVitalSignColumns(pool) {
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'recorded_at'))) {
    await pool
      .query('ALTER TABLE tbl_vital_sign ADD COLUMN recorded_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP')
      .catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'recorded_by'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN recorded_by INT NULL').catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'source_station'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN source_station VARCHAR(32) NULL').catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'doctor_signed_at'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN doctor_signed_at DATETIME NULL').catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'doctor_signed_by'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN doctor_signed_by INT NULL').catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'superseded_at'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN superseded_at DATETIME NULL').catch(() => {});
  }
  if (!(await hasColumn(pool, 'tbl_vital_sign', 'superseded_by'))) {
    await pool.query('ALTER TABLE tbl_vital_sign ADD COLUMN superseded_by INT NULL').catch(() => {});
  }

  await pool
    .query(
      `UPDATE tbl_vital_sign
          SET recorded_at = COALESCE(recorded_at, created_at, NOW())
        WHERE recorded_at IS NULL
           OR recorded_at = '0000-00-00 00:00:00'`
    )
    .catch(() => {});

  await pool
    .query(
      'ALTER TABLE tbl_vital_sign MODIFY COLUMN recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'
    )
    .catch(() => {});
}

module.exports = { ensureVitalSignColumns };
