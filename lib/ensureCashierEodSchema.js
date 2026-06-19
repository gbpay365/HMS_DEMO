'use strict';

/** End-of-day cashier reconciliation records. */
async function ensureCashierEodSchema(pool) {
  if (pool && pool.driver === 'postgres') return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_cashier_eod_reconciliation (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      business_date DATE NOT NULL,
      cashier_user_id INT NOT NULL DEFAULT 0 COMMENT '0 = all cashiers / facility close',
      status VARCHAR(20) NOT NULL DEFAULT 'submitted',
      opening_float DECIMAL(12,2) NOT NULL DEFAULT 0,
      system_totals_json JSON DEFAULT NULL,
      declared_totals_json JSON DEFAULT NULL,
      variance_json JSON DEFAULT NULL,
      report_snapshot_json JSON DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      submitted_by INT DEFAULT NULL,
      submitted_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cashier_eod (facility_id, business_date, cashier_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});
}

module.exports = { ensureCashierEodSchema };
