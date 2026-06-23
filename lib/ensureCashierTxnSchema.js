'use strict';

/** Cashier till ledger — opening/closing balance, debit/credit, cashier identity per txn. */
async function ensureCashierTxnSchema(pool) {
  if (!pool || !pool.query) return;

  if (pool.driver === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_cashier_txn (
        id BIGSERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL DEFAULT 1,
        cashier_id INTEGER NOT NULL,
        cashier_code VARCHAR(12) NOT NULL,
        cashier_identity VARCHAR(80) NOT NULL,
        employee_id INTEGER NOT NULL,
        opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
        debit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        credit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        closing_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
        txn_type VARCHAR(24) NOT NULL,
        payment_method VARCHAR(50) DEFAULT NULL,
        amount DECIMAL(15,2) NOT NULL,
        gl_debit_account VARCHAR(16) NOT NULL,
        gl_credit_account VARCHAR(16) NOT NULL,
        journal_header_id INTEGER DEFAULT NULL,
        source_module VARCHAR(48) NOT NULL,
        source_pk BIGINT NOT NULL,
        billing_document_id INTEGER DEFAULT NULL,
        patient_id INTEGER DEFAULT NULL,
        reference VARCHAR(64) DEFAULT NULL,
        narration VARCHAR(500) DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'posted',
        external_sync_status VARCHAR(20) DEFAULT 'pending',
        external_sync_at TIMESTAMP DEFAULT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_txn_source
      ON tbl_cashier_txn (source_module, source_pk)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cashier_txn_ledger
      ON tbl_cashier_txn (cashier_id, payment_method, id DESC)
    `).catch(() => {});
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_cashier_txn (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      cashier_id INT NOT NULL,
      cashier_code VARCHAR(12) NOT NULL,
      cashier_identity VARCHAR(80) NOT NULL,
      employee_id INT NOT NULL,
      opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
      debit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      credit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      closing_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
      txn_type VARCHAR(24) NOT NULL,
      payment_method VARCHAR(50) DEFAULT NULL,
      amount DECIMAL(15,2) NOT NULL,
      gl_debit_account VARCHAR(16) NOT NULL,
      gl_credit_account VARCHAR(16) NOT NULL,
      journal_header_id INT DEFAULT NULL,
      source_module VARCHAR(48) NOT NULL,
      source_pk BIGINT UNSIGNED NOT NULL,
      billing_document_id INT UNSIGNED DEFAULT NULL,
      patient_id INT DEFAULT NULL,
      reference VARCHAR(64) DEFAULT NULL,
      narration VARCHAR(500) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'posted',
      external_sync_status VARCHAR(20) DEFAULT 'pending',
      external_sync_at DATETIME DEFAULT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cashier_txn_source (source_module, source_pk),
      KEY idx_cashier_txn_ledger (cashier_id, payment_method, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});
}

module.exports = { ensureCashierTxnSchema };
