'use strict';

/** Cashier desk cash expenses / petty payouts. */
async function ensureCashierDisbursementSchema(pool) {
  if (!pool || !pool.query) return;

  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_cashier_disbursement (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        txn_type VARCHAR(24) NOT NULL DEFAULT 'expense',
        category VARCHAR(48) NOT NULL DEFAULT 'general',
        amount DECIMAL(15,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
        narration VARCHAR(500) DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'posted',
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_cashier_disbursement (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      txn_type VARCHAR(24) NOT NULL DEFAULT 'expense',
      category VARCHAR(48) NOT NULL DEFAULT 'general',
      amount DECIMAL(15,2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
      narration VARCHAR(500) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'posted',
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});
}

module.exports = { ensureCashierDisbursementSchema };
