'use strict';

const { nextInvoiceNumber } = require('./invoiceNumber');

async function ensureTicketInvoiceNumberColumn(pool) {
  if (!pool?.query) return;
  await pool
    .query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(60) NULL')
    .catch(() => {});
  if (pool.driver === 'postgres') {
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uk_payment_ticket_invoice_number
         ON tbl_payment_ticket (invoice_number)
         WHERE invoice_number IS NOT NULL AND TRIM(invoice_number) <> ''`
      )
      .catch(() => {});
  } else {
    await pool
      .query(
        'ALTER TABLE tbl_payment_ticket ADD UNIQUE KEY uk_payment_ticket_invoice_number (invoice_number)'
      )
      .catch(() => {});
  }
}

function hasInvoiceNumber(value) {
  return !!String(value || '').trim();
}

/**
 * Allocate and persist INV-YYYY-######## on a payment ticket when missing.
 * @returns {Promise<string|null>}
 */
async function assignInvoiceNumberIfMissing(db, ticketId, facilityId) {
  const tid = parseInt(String(ticketId || ''), 10) || 0;
  if (tid < 1 || !db?.query) return null;

  await ensureTicketInvoiceNumberColumn(db);

  const [[row]] = await db
    .query(
      'SELECT id, facility_id, invoice_number FROM tbl_payment_ticket WHERE id = ? LIMIT 1',
      [tid]
    )
    .catch(() => [[null]]);
  if (!row?.id) return null;
  if (hasInvoiceNumber(row.invoice_number)) return String(row.invoice_number).trim();

  const fid = parseInt(String(facilityId || row.facility_id || 1), 10) || 1;
  const invoiceNumber = await nextInvoiceNumber(db, fid);
  await db
    .query(
      `UPDATE tbl_payment_ticket
       SET invoice_number = ?
       WHERE id = ?
         AND (invoice_number IS NULL OR TRIM(COALESCE(invoice_number, '')) = '')`,
      [invoiceNumber, tid]
    )
    .catch(() => {});

  const [[updated]] = await db
    .query('SELECT invoice_number FROM tbl_payment_ticket WHERE id = ? LIMIT 1', [tid])
    .catch(() => [[null]]);
  return hasInvoiceNumber(updated?.invoice_number)
    ? String(updated.invoice_number).trim()
    : invoiceNumber;
}

/**
 * Resolve invoice number for billing document creation — reuse ticket number when set.
 */
async function resolveInvoiceNumberForTicket(db, ticketId, facilityId) {
  const assigned = await assignInvoiceNumberIfMissing(db, ticketId, facilityId);
  if (assigned) return assigned;
  return nextInvoiceNumber(db, facilityId);
}

/** Backfill tickets that pre-date automatic invoice numbers. */
async function backfillMissingTicketInvoiceNumbers(pool, limit = 250) {
  await ensureTicketInvoiceNumberColumn(pool);
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 250, 1), 1000);
  const [rows] = await pool
    .query(
      `SELECT id, facility_id FROM tbl_payment_ticket
       WHERE invoice_number IS NULL OR TRIM(COALESCE(invoice_number, '')) = ''
       ORDER BY id ASC
       LIMIT ?`,
      [lim]
    )
    .catch(() => [[]]);
  for (const row of rows || []) {
    await assignInvoiceNumberIfMissing(pool, row.id, row.facility_id).catch(() => {});
  }
  return (rows || []).length;
}

module.exports = {
  ensureTicketInvoiceNumberColumn,
  assignInvoiceNumberIfMissing,
  resolveInvoiceNumberForTicket,
  backfillMissingTicketInvoiceNumbers,
};
