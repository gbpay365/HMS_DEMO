'use strict';

/** Invoice fields on payment tickets (LinkHMS-style billing). */
async function ensureCashierInvoiceSchema(pool) {
  await pool.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0').catch(() => {});
  await pool.query("ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS claim_status VARCHAR(24) NOT NULL DEFAULT 'not_claimed'").catch(() => {});
  await pool.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS ticket_category VARCHAR(24) DEFAULT NULL').catch(() => {});

  // Backfill amount_paid for already-paid tickets
  await pool.query(`
    UPDATE tbl_payment_ticket
    SET amount_paid = total_amount
    WHERE status = 'paid' AND COALESCE(amount_paid, 0) = 0
  `).catch(() => {});

  await pool.query(`
    UPDATE tbl_payment_ticket
    SET ticket_category = 'pharmacy'
    WHERE ticket_category IS NULL AND UPPER(TRIM(ticket_code)) LIKE 'PHA-%'
  `).catch(() => {});

  await pool.query(`
    UPDATE tbl_payment_ticket
    SET ticket_category = 'service'
    WHERE ticket_category IS NULL
  `).catch(() => {});
}

module.exports = { ensureCashierInvoiceSchema };
