'use strict';

/** Corporate billing companies for cashier invoices (tbl_billing_company). */
async function ensureBillingCompanySchema(pool) {
  if (!pool?.query) return;

  if (pool.driver === 'postgres') {
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_billing_company (
          id SERIAL PRIMARY KEY,
          facility_id INTEGER NOT NULL DEFAULT 1,
          name VARCHAR(220) NOT NULL,
          tax_id VARCHAR(80) NULL,
          billing_address TEXT NULL,
          phone VARCHAR(48) NULL,
          email VARCHAR(180) NULL,
          status SMALLINT NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`
      )
      .catch(() => {});
    await pool
      .query('CREATE INDEX IF NOT EXISTS idx_bcompany_fac ON tbl_billing_company (facility_id)')
      .catch(() => {});
  } else {
    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_billing_company (
          id INT NOT NULL AUTO_INCREMENT,
          facility_id INT NOT NULL,
          name VARCHAR(220) NOT NULL,
          tax_id VARCHAR(80) DEFAULT NULL,
          billing_address TEXT DEFAULT NULL,
          phone VARCHAR(48) DEFAULT NULL,
          email VARCHAR(180) DEFAULT NULL,
          status TINYINT NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_bcompany_fac (facility_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      )
      .catch(() => {});
  }

  await pool
    .query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS billing_company_id INT NULL')
    .catch(() => {});
}

module.exports = { ensureBillingCompanySchema };
