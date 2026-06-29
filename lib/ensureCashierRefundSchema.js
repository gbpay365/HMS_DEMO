'use strict';

/** Cashier refund requests — supervisor approval workflow. */
async function ensureCashierRefundSchema(pool) {
  if (!pool || !pool.query) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_cashier_refund_request (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      refund_ref VARCHAR(32) DEFAULT NULL,
      patient_id INT NOT NULL,
      ticket_id INT DEFAULT NULL,
      ticket_code VARCHAR(64) DEFAULT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      refund_method VARCHAR(40) DEFAULT 'Cash',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      source_module VARCHAR(40) DEFAULT 'manual',
      source_pk INT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      approved_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      KEY idx_status (status),
      KEY idx_patient (patient_id),
      KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});
}

module.exports = { ensureCashierRefundSchema };
