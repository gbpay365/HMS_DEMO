'use strict';

const { skipMysqlSchemaOnPostgres } = require('./skipMysqlSchemaOnPostgres');

/**
 * PostgreSQL-safe seq + billing columns (call on pool, never inside a transaction).
 */
async function ensurePostgresReceiptInvoiceSeq(pool) {
  if (!skipMysqlSchemaOnPostgres(pool)) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_receipt_seq (
      facility_id INT NOT NULL DEFAULT 1,
      yyear INT NOT NULL,
      last_no BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (facility_id, yyear)
    )
  `).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tbl_invoice_seq (
      facility_id INT NOT NULL DEFAULT 1,
      yyear INT NOT NULL,
      last_no BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (facility_id, yyear)
    )
  `).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_billing_document ADD COLUMN IF NOT EXISTS invoice_doc_number VARCHAR(60) NULL'
  ).catch(() => {});
  await pool.query(
    'ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS paid_by INT DEFAULT NULL'
  ).catch(() => {});
}

/**
 * Atomic per-facility, per-calendar-year receipt counter.
 * Format: RCT-YYYY-00000001 (8-digit sequence, zero-padded).
 */
async function ensureReceiptSeqTable(db) {
  if (skipMysqlSchemaOnPostgres(db)) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tbl_receipt_seq (
      facility_id INT NOT NULL DEFAULT 1,
      yyear INT NOT NULL,
      last_no BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (facility_id, yyear)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
  await db.query(
    'ALTER TABLE tbl_billing_document ADD UNIQUE KEY uk_billing_doc_number (doc_number)'
  ).catch(() => {});
}

async function bumpReceiptSeq(db, fid, y) {
  if (db.driver === 'postgres') {
    await db.query(
      `INSERT INTO tbl_receipt_seq (facility_id, yyear, last_no) VALUES (?, ?, 1)
       ON CONFLICT (facility_id, yyear) DO UPDATE SET last_no = tbl_receipt_seq.last_no + 1`,
      [fid, y]
    );
  } else {
    await db.query(
      `INSERT INTO tbl_receipt_seq (facility_id, yyear, last_no) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE last_no = last_no + 1`,
      [fid, y]
    );
  }
  const [[row]] = await db.query(
    'SELECT last_no FROM tbl_receipt_seq WHERE facility_id = ? AND yyear = ? LIMIT 1',
    [fid, y]
  );
  return row;
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {number} [facilityId=1]
 * @returns {Promise<string>}
 */
async function nextReceiptNumber(db, facilityId) {
  if (!skipMysqlSchemaOnPostgres(db)) {
    await ensureReceiptSeqTable(db);
  }
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const y = new Date().getFullYear();
  const row = await bumpReceiptSeq(db, fid, y);
  const n = row && row.last_no != null ? parseInt(String(row.last_no), 10) : 1;
  if (!Number.isFinite(n) || n < 1) {
    return `RCT-${y}-${String(1).padStart(8, '0')}`;
  }
  return `RCT-${y}-${String(n).padStart(8, '0')}`;
}

module.exports = {
  ensureReceiptSeqTable,
  ensurePostgresReceiptInvoiceSeq,
  nextReceiptNumber,
};
