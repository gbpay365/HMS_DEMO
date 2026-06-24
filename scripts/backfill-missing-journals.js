'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { postReceiptJournal } = require('../lib/cashierTxnWire');
const { afterCommitCashierPipeline } = require('../lib/cashierTransactionHub');
const { journalPostLastError } = require('../lib/hmsFinJournalPost');

(async () => {
  const pool = createDbPool();
  await ensureFinAccountingSchema(pool, { facilityId: 1 });

  let posted = 0;
  let failed = 0;

  const [bills] = await pool.query(
    `SELECT d.id, d.facility_id, d.doc_number, d.total_amount, d.payment_method,
            d.source_module, d.created_by
       FROM tbl_billing_document d
      WHERE d.doc_type = 'receipt' AND COALESCE(d.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM tbl_fin_journal_header j
           WHERE j.source_type = 'billing_receipt' AND j.source_id = d.id
        )
      ORDER BY d.id ASC`
  );

  for (const bill of bills || []) {
    const [[txn]] = await pool.query(
      `SELECT id FROM tbl_cashier_txn
        WHERE source_module = 'payment_ticket' AND source_pk = ? LIMIT 1`,
      [bill.source_pk]
    ).catch(() => [[null]]);
    const r = await postReceiptJournal(pool, {
      txnId: txn?.id || null,
      facilityId: parseInt(bill.facility_id, 10) || 1,
      billingDocumentId: bill.id,
      grandTotal: parseFloat(bill.total_amount),
      paymentMethod: bill.payment_method || 'Cash',
      createdBy: parseInt(bill.created_by, 10) || 1,
      docNumber: bill.doc_number,
      firstLineDescription: bill.doc_number,
      sourceModule: bill.source_module || 'payment_ticket',
    });
    if (r?.ok || r?.duplicate) {
      posted++;
      console.log('receipt OK', bill.doc_number, r.journalHeaderId);
    } else {
      failed++;
      console.warn('receipt FAIL', bill.doc_number, r?.error || journalPostLastError());
    }
  }

  const [disb] = await pool.query(
    `SELECT d.id, d.facility_id, d.txn_type, d.category, d.amount, d.payment_method,
            d.narration, d.created_by
       FROM tbl_cashier_disbursement d
      WHERE NOT EXISTS (
          SELECT 1 FROM tbl_fin_journal_header j
           WHERE j.source_type IN ('cashier_disbursement','cashier_payout')
             AND j.source_id = d.id
        )
      ORDER BY d.id ASC`
  );

  for (const row of disb || []) {
    const [[txn]] = await pool.query(
      `SELECT id, cashier_code, cashier_identity FROM tbl_cashier_txn
        WHERE source_module = 'cashier_disbursement' AND source_pk = ? LIMIT 1`,
      [row.id]
    ).catch(() => [[null]]);
    const kind = row.txn_type === 'payout' ? 'payout' : 'expense';
    const r = await afterCommitCashierPipeline(pool, {
      txnId: txn?.id || null,
      journalKind: kind,
      facilityId: parseInt(row.facility_id, 10) || 1,
      expenseId: row.id,
      disbursementId: row.id,
      amount: parseFloat(row.amount),
      paymentMethod: row.payment_method || 'Cash',
      expenseCategory: row.category || 'general',
      narration: row.narration,
      createdBy: parseInt(row.created_by, 10) || 1,
      cashierCode: txn?.cashier_code,
      cashierIdentity: txn?.cashier_identity,
      reference: `CD-${row.id}`,
    });
    const journal = r?.journal;
    if (journal?.ok || journal?.duplicate) {
      posted++;
      console.log('disbursement OK', `CD-${row.id}`, journal.journalHeaderId);
    } else {
      failed++;
      console.warn('disbursement FAIL', `CD-${row.id}`, journalPostLastError());
    }
  }

  const [journals] = await pool.query(
    `SELECT id, reference, narration, source_type, entry_date, status
       FROM tbl_fin_journal_header ORDER BY id DESC LIMIT 15`
  );
  console.log(JSON.stringify({ posted, failed, recentJournals: journals }, null, 2));
  await pool.end?.();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
