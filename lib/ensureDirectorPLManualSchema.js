'use strict';

/**
 * Manual P&L cost lines for director monthly report (payroll + expenses)
 * until HMS payroll / accounts payable are fully integrated.
 */
async function ensureDirectorPLManualSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_director_pl_manual_prefs (
      facility_id INT NOT NULL DEFAULT 1,
      year SMALLINT NOT NULL,
      month TINYINT NOT NULL,
      use_hms_payroll TINYINT NOT NULL DEFAULT 0,
      use_hms_expenses TINYINT NOT NULL DEFAULT 1,
      notes VARCHAR(500) NULL,
      updated_by INT NULL,
      updated_at DATETIME NULL,
      PRIMARY KEY (facility_id, year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_director_pl_manual_line (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      facility_id INT NOT NULL DEFAULT 1,
      year SMALLINT NOT NULL,
      month TINYINT NOT NULL,
      line_type ENUM('payroll_dept','cogs','opex') NOT NULL,
      label VARCHAR(120) NOT NULL DEFAULT '',
      dept_name VARCHAR(120) NULL,
      amount_xaf DECIMAL(14,2) NOT NULL DEFAULT 0,
      notes VARCHAR(255) NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pl_manual_period (facility_id, year, month, line_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = ensureDirectorPLManualSchema;
