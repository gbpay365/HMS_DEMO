'use strict';

/**
 * License tables for solution subscription and serial activation.
 */
async function ensureLicenseSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_hms_solution_license (
      id INT AUTO_INCREMENT PRIMARY KEY,
      solution_key VARCHAR(64) NOT NULL,
      status ENUM('pending','active','expired','revoked') NOT NULL DEFAULT 'pending',
      request_code TEXT NULL,
      request_code_expires_at DATETIME NULL,
      serial_hash CHAR(64) NULL,
      activated_at DATETIME NULL,
      expires_at DATETIME NULL,
      requested_by INT NULL,
      activated_by INT NULL,
      contact_email VARCHAR(250) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_hms_sol_lic_key (solution_key),
      KEY idx_hms_sol_lic_status (status),
      KEY idx_hms_sol_lic_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const addCol = async (col, def) => {
    const [ex] = await pool.query(`SHOW COLUMNS FROM tbl_app_settings LIKE ?`, [col]).catch(() => [[]]);
    if (!ex || !ex.length) {
      await pool.query(`ALTER TABLE tbl_app_settings ADD COLUMN ${col} ${def}`).catch(() => {});
    }
  };

  await addCol(
    'license_installation_id',
    "VARCHAR(36) NULL COMMENT 'Unique installation id bound to serial numbers'"
  );
  await addCol(
    'license_contact_email',
    "VARCHAR(250) NULL COMMENT 'Default email for subscription request codes'"
  );
  await addCol(
    'license_server_client_key',
    "VARCHAR(64) NULL COMMENT 'API key for ZAIZENS license server sync'"
  );
  await addCol(
    'license_server_last_sync',
    "DATETIME NULL COMMENT 'Last successful license server heartbeat'"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_hms_license_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(64) NOT NULL,
      solution_key VARCHAR(64) NULL,
      actor_employee_id INT NULL,
      detail_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_hms_lic_audit_action (action),
      KEY idx_hms_lic_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  return true;
}

module.exports = { ensureLicenseSchema };
