'use strict';

const { skipMysqlSchemaOnPostgres } = require('./skipMysqlSchemaOnPostgres');

/**
 * Atomic per-facility, per-calendar-year invoice counter (fiscal invoice N°).
 * Format: INV-YYYY-00000001 (8-digit sequence, zero-padded).
 * Stored on tbl_billing_document.invoice_doc_number (receipt uses doc_number / RCT-*).
 */
async function ensureInvoiceSeqTable(db) {
  if (skipMysqlSchemaOnPostgres(db)) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tbl_invoice_seq (
      facility_id INT NOT NULL DEFAULT 1,
      yyear INT NOT NULL,
      last_no BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (facility_id, yyear)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
  await db.query(
    'ALTER TABLE tbl_billing_document ADD COLUMN invoice_doc_number VARCHAR(60) NULL'
  ).catch(() => {});
  await db.query(
    'ALTER TABLE tbl_billing_document ADD UNIQUE KEY uk_billing_invoice_number (invoice_doc_number)'
  ).catch(() => {});
}

async function bumpInvoiceSeq(db, fid, y) {
  if (db.driver === 'postgres') {
    await db.query(
      `INSERT INTO tbl_invoice_seq (facility_id, yyear, last_no) VALUES (?, ?, 1)
       ON CONFLICT (facility_id, yyear) DO UPDATE SET last_no = tbl_invoice_seq.last_no + 1`,
      [fid, y]
    );
  } else {
    await db.query(
      `INSERT INTO tbl_invoice_seq (facility_id, yyear, last_no) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE last_no = last_no + 1`,
      [fid, y]
    );
  }
  const [[row]] = await db.query(
    'SELECT last_no FROM tbl_invoice_seq WHERE facility_id = ? AND yyear = ? LIMIT 1',
    [fid, y]
  );
  return row;
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {number} [facilityId=1]
 * @returns {Promise<string>}
 */
async function nextInvoiceNumber(db, facilityId) {
  if (!skipMysqlSchemaOnPostgres(db)) {
    await ensureInvoiceSeqTable(db);
  }
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const y = new Date().getFullYear();
  const row = await bumpInvoiceSeq(db, fid, y);
  const n = row && row.last_no != null ? parseInt(String(row.last_no), 10) : 1;
  if (!Number.isFinite(n) || n < 1) {
    return `INV-${y}-${String(1).padStart(8, '0')}`;
  }
  return `INV-${y}-${String(n).padStart(8, '0')}`;
}

module.exports = { ensureInvoiceSeqTable, nextInvoiceNumber };
