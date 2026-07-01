'use strict';

/** Cashier refund requests — supervisor approval workflow. */
async function ensureCashierRefundSchema(pool) {
  if (!pool?.query) return;

  if (pool.driver === 'postgres') {
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_cashier_refund_request (
          id SERIAL PRIMARY KEY,
          facility_id INTEGER NOT NULL DEFAULT 1,
          refund_ref VARCHAR(32) DEFAULT NULL,
          patient_id INTEGER NOT NULL,
          ticket_id INTEGER DEFAULT NULL,
          ticket_code VARCHAR(64) DEFAULT NULL,
          reason VARCHAR(255) DEFAULT NULL,
          amount DECIMAL(12,2) NOT NULL DEFAULT 0,
          refund_method VARCHAR(40) DEFAULT 'Cash',
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          source_module VARCHAR(40) DEFAULT 'manual',
          source_pk INTEGER DEFAULT NULL,
          created_by INTEGER DEFAULT NULL,
          approved_by INTEGER DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          approved_at TIMESTAMP DEFAULT NULL,
          notes TEXT DEFAULT NULL
        )`
      )
      .catch(() => {});
    await pool
      .query('CREATE INDEX IF NOT EXISTS idx_cashier_refund_status ON tbl_cashier_refund_request (status)')
      .catch(() => {});
    await pool
      .query('CREATE INDEX IF NOT EXISTS idx_cashier_refund_patient ON tbl_cashier_refund_request (patient_id)')
      .catch(() => {});
    await pool
      .query('CREATE INDEX IF NOT EXISTS idx_cashier_refund_created ON tbl_cashier_refund_request (created_at)')
      .catch(() => {});
    return;
  }

  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_cashier_refund_request (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
    )
    .catch(() => {});
}

module.exports = { ensureCashierRefundSchema };
