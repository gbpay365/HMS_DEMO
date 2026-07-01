'use strict';

async function columnExists(pool, table, col) {
  try {
    if (pool.driver === 'postgres') {
      const [[r]] = await pool.query(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, col]
      );
      return !!(r && r.ok);
    }
    const [[r]] = await pool.query(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, col]
    );
    return !!(r && r.ok);
  } catch (_) {
    return false;
  }
}

async function addColumn(pool, table, col, def) {
  if (await columnExists(pool, table, col)) return;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

/** Invoice fields on payment tickets (LinkHMS-style billing). */
async function ensureCashierInvoiceSchema(pool) {
  if (!pool || !pool.query) return;

  const table = 'tbl_payment_ticket';

  await addColumn(pool, table, 'amount_paid', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addColumn(pool, table, 'claim_status', "VARCHAR(24) NOT NULL DEFAULT 'not_claimed'");
  await addColumn(pool, table, 'ticket_category', 'VARCHAR(24) DEFAULT NULL');
  await addColumn(pool, table, 'due_date', 'DATE DEFAULT NULL');
  await addColumn(pool, table, 'issue_date', 'DATE DEFAULT NULL');
  await addColumn(pool, table, 'discount_pct', 'DECIMAL(6,2) NOT NULL DEFAULT 0');
  await addColumn(pool, table, 'tax_pct', 'DECIMAL(6,2) NOT NULL DEFAULT 0');
  await addColumn(pool, table, 'bill_to_name', 'VARCHAR(200) DEFAULT NULL');
  await addColumn(pool, table, 'bill_to_contact', 'VARCHAR(200) DEFAULT NULL');
  await addColumn(pool, table, 'bill_to_company', 'TEXT DEFAULT NULL');
  await addColumn(pool, table, 'invoice_status', "VARCHAR(20) DEFAULT 'sent'");
  await addColumn(pool, table, 'invoice_number', 'VARCHAR(60) DEFAULT NULL');

  const { backfillMissingTicketInvoiceNumbers } = require('./paymentTicketInvoiceNumber');
  await backfillMissingTicketInvoiceNumbers(pool, 300).catch(() => {});

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

module.exports = { ensureCashierInvoiceSchema, columnExists };
