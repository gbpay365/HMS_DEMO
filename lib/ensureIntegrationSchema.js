'use strict';

async function ensureIntegrationSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_integration_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      direction VARCHAR(16) NOT NULL DEFAULT 'outbound',
      event_type VARCHAR(64) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      next_retry_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      KEY idx_status_retry (status, next_retry_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_integration_entity_link (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      source_system VARCHAR(32) NOT NULL DEFAULT 'ACCOUNT_CORE',
      entity_type VARCHAR(64) NOT NULL,
      external_id VARCHAR(128) NOT NULL,
      internal_id VARCHAR(128) NOT NULL,
      metadata_json LONGTEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_link (facility_id, source_system, entity_type, external_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_hms_payroll_dept_summary (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      year SMALLINT NOT NULL,
      month TINYINT NOT NULL,
      department_name VARCHAR(120) NOT NULL DEFAULT '',
      headcount INT NOT NULL DEFAULT 0,
      gross_payroll DECIMAL(18,2) NOT NULL DEFAULT 0,
      net_payroll DECIMAL(18,2) NOT NULL DEFAULT 0,
      employer_charges DECIMAL(18,2) NOT NULL DEFAULT 0,
      cnps_employee DECIMAL(18,2) NOT NULL DEFAULT 0,
      cnps_employer DECIMAL(18,2) NOT NULL DEFAULT 0,
      income_tax DECIMAL(18,2) NOT NULL DEFAULT 0,
      other_deductions DECIMAL(18,2) NOT NULL DEFAULT 0,
      core_period_id VARCHAR(64) NULL,
      synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_period_dept (facility_id, year, month, department_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  try {
    await pool.query(
      `ALTER TABLE tbl_employee ADD COLUMN external_core_sync_status VARCHAR(16) NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_employee ADD COLUMN external_core_employee_id VARCHAR(64) NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_employee ADD COLUMN external_core_sync_at DATETIME NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_hms_pay_profile ADD COLUMN pay_profile_source VARCHAR(32) NOT NULL DEFAULT 'local'`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_purchase_order ADD COLUMN external_core_sync_status VARCHAR(16) NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_purchase_order ADD COLUMN external_core_sync_at DATETIME NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_fin_journal_header ADD COLUMN external_core_sync_status VARCHAR(16) NULL`
    );
  } catch (_) { /* exists */ }
  try {
    await pool.query(
      `ALTER TABLE tbl_fin_journal_header ADD COLUMN external_core_sync_at DATETIME NULL`
    );
  } catch (_) { /* exists */ }
}

module.exports = { ensureIntegrationSchema };
