'use strict';

/**
 * Lab / radiology result corrections: audit trail + revision_pending flag on result rows.
 */
async function ensureDiagnosticCorrectionSchema(pool) {
  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_diagnostic_result_correction_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      module ENUM('laboratory','radiology') NOT NULL,
      lab_result_id INT NULL,
      radiology_result_id INT NULL,
      opd_order_item_id INT NULL,
      event_type VARCHAR(24) NOT NULL DEFAULT 'correct',
      superseded_findings MEDIUMTEXT NULL,
      superseded_conclusion VARCHAR(512) NULL,
      new_findings MEDIUMTEXT NULL,
      new_conclusion VARCHAR(512) NULL,
      reason VARCHAR(2000) NULL,
      performed_by INT NOT NULL,
      performed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY ix_diag_corr_oi (opd_order_item_id),
      KEY ix_diag_corr_lab (lab_result_id),
      KEY ix_diag_corr_rad (radiology_result_id),
      KEY ix_diag_corr_at (performed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool.query('ALTER TABLE tbl_lab_result ADD COLUMN revision_pending TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
  await pool.query('ALTER TABLE tbl_radiology_result ADD COLUMN revision_pending TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});

  // Allow standalone lab/rad corrections (no OPD order line) — older DBs had NOT NULL.
  await pool
   .query('ALTER TABLE tbl_diagnostic_result_correction_audit MODIFY COLUMN opd_order_item_id INT NULL')
   .catch(() => {});
}

/** Append-only audit for lab/radiology result corrections (who / when / old vs new). */
async function insertDiagnosticCorrectionAudit(pool, row) {
  await pool.query(
    `INSERT INTO tbl_diagnostic_result_correction_audit
      (module, lab_result_id, radiology_result_id, opd_order_item_id, event_type,
       superseded_findings, superseded_conclusion, new_findings, new_conclusion, reason, performed_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.module,
      row.lab_result_id || null,
      row.radiology_result_id || null,
      row.opd_order_item_id != null ? row.opd_order_item_id : null,
      row.event_type || 'correct',
      row.superseded_findings != null ? String(row.superseded_findings) : null,
      row.superseded_conclusion != null ? String(row.superseded_conclusion) : null,
      row.new_findings != null ? String(row.new_findings) : null,
      row.new_conclusion != null ? String(row.new_conclusion) : null,
      row.reason != null ? String(row.reason).slice(0, 2000) : null,
      row.performed_by
    ]
  );
}

module.exports = { ensureDiagnosticCorrectionSchema, insertDiagnosticCorrectionAudit };
