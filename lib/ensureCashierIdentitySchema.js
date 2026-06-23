'use strict';

/** Cashier desk identity registry (code + label, e.g. CA01 → Cashier 01). */
async function ensureCashierIdentitySchema(pool) {
  if (!pool || !pool.query) return;

  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_cashier (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        cashier_code VARCHAR(12) NOT NULL,
        cashier_identity VARCHAR(80) NOT NULL,
        employee_id INTEGER DEFAULT NULL,
        status SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NULL,
        CONSTRAINT uq_cashier_code UNIQUE (facility_id, cashier_code)
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_employee
      ON tbl_cashier (employee_id)
      WHERE employee_id IS NOT NULL
    `).catch(() => {});
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_cashier (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      cashier_code VARCHAR(12) NOT NULL COMMENT 'Desk code e.g. CA01',
      cashier_identity VARCHAR(80) NOT NULL COMMENT 'Display identity e.g. Cashier 01',
      employee_id INT DEFAULT NULL COMMENT 'Assigned tbl_employee.id',
      status TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cashier_code (facility_id, cashier_code),
      UNIQUE KEY uq_cashier_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});
}

module.exports = { ensureCashierIdentitySchema };
