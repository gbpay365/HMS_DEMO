'use strict';

/**
 * Backfill GL journals (and optional cashier txn rows) for paid receipts
 * that were collected before wiring or when cashier identity was missing.
 *
 * Usage: node scripts/backfill-cashier-journal.js [--limit=50] [--dry-run]
 */
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');
const { postReceiptJournal } = require('../lib/cashierTxnWire');
const { recordReceiptInTransaction } = require('../lib/cashierTxnWire');
const { assignCashierToEmployee } = require('../lib/cashierIdentity');
const { ensureCashierTxnSchema } = require('../lib/ensureCashierTxnSchema');

function parseArgs() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
  return {
    limit: Math.min(500, Math.max(1, limit || 100)),
    dryRun: process.argv.includes('--dry-run'),
  };
}

(async () => {
  const { limit, dryRun } = parseArgs();
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  await ensureCashierTxnSchema(pool);

  const [rows] = await pool.query(
    `SELECT d.id, d.facility_id, d.patient_id, d.doc_number, d.total_amount, d.payment_method,
            d.source_module, d.source_pk, d.created_by, d.created_at
       FROM tbl_billing_document d
      WHERE d.doc_type IN ('receipt', 'invoice')
        AND COALESCE(d.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM tbl_fin_journal_header j
           WHERE j.source_type = 'billing_receipt' AND j.source_id = d.id
        )
      ORDER BY d.id ASC
      LIMIT ?`,
    [limit]
  );

  let posted = 0;
  let txnCreated = 0;
  let failed = 0;

  for (const bill of rows || []) {
    const amt = parseFloat(bill.total_amount) || 0;
    const bid = parseInt(bill.id, 10);
    const fid = parseInt(bill.facility_id, 10) || 1;
    const uid = parseInt(bill.created_by, 10) || 1;

    if (dryRun) {
      console.log(`[dry-run] would post journal for bill #${bid} ${bill.doc_number} ${amt}`);
      continue;
    }

    const [[existingTxn]] = await pool
      .query(
        `SELECT id FROM tbl_cashier_txn
          WHERE source_module = ? AND source_pk = ? LIMIT 1`,
        [bill.source_module || 'payment_ticket', bill.source_pk || bid]
      )
      .catch(() => [[null]]);

    let txnId = existingTxn?.id || null;
    if (!txnId && bill.source_module === 'payment_ticket' && bill.source_pk) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await assignCashierToEmployee(conn, uid, fid).catch(() => {});
        const txn = await recordReceiptInTransaction(conn, {
          facilityId: fid,
          userId: uid,
          sourceModule: 'payment_ticket',
          sourcePk: bill.source_pk,
          amount: amt,
          paymentMethod: bill.payment_method || 'Cash',
          billingDocumentId: bid,
          patientId: bill.patient_id,
          reference: bill.doc_number,
          narration: `Backfill receipt ${bill.doc_number}`,
        }).catch(() => null);
        await conn.commit();
        txnId = txn?.txnId || null;
        if (txnId) txnCreated += 1;
      } catch (e) {
        await conn.rollback().catch(() => {});
        console.warn(`txn backfill bill #${bid}:`, e.message);
      } finally {
        conn.release();
      }
    }

    const journal = await postReceiptJournal(pool, {
      txnId,
      facilityId: fid,
      billingDocumentId: bid,
      grandTotal: amt,
      paymentMethod: bill.payment_method || 'Cash',
      createdBy: uid,
      docNumber: bill.doc_number || '',
      firstLineDescription: bill.doc_number || '',
      sourceModule: bill.source_module || 'payment_ticket',
    });

    if (journal?.ok || journal?.duplicate) {
      posted += 1;
      console.log(`OK bill #${bid} ${bill.doc_number} → journal ${journal.journalHeaderId || 'dup'}`);
    } else {
      failed += 1;
      console.warn(`FAIL bill #${bid}:`, journal?.error || 'unknown');
    }
  }

  console.log(JSON.stringify({
    ok: true,
    scanned: (rows || []).length,
    posted,
    txnCreated,
    failed,
    dryRun,
  }, null, 2));

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
