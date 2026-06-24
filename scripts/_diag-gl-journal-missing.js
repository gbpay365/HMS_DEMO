'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { journalPostLastError } = require('../lib/hmsFinJournalPost');

(async () => {
  const pool = createDbPool();
  console.log('driver', pool.driver);

  const [tickets] = await pool.query(
    `SELECT id, ticket_code, status, total_amount, paid_at
       FROM tbl_payment_ticket WHERE status='paid'
       ORDER BY paid_at DESC NULLS LAST LIMIT 5`
  );
  console.log('\nrecent paid tickets:', tickets);

  const [disb] = await pool.query(
    `SELECT id, txn_type, amount, narration, created_at
       FROM tbl_cashier_disbursement
       ORDER BY id DESC LIMIT 5`
  );
  console.log('\nrecent disbursements:', disb);

  const [journals] = await pool.query(
    `SELECT id, entry_date, reference, narration, source_type, source_id, status, journal_code
       FROM tbl_fin_journal_header
       ORDER BY id DESC LIMIT 10`
  );
  console.log('\nrecent journals:', journals);

  const [cashierTxns] = await pool.query(
    `SELECT id, txn_type, amount, source_module, source_pk, journal_header_id, created_at
       FROM tbl_cashier_txn ORDER BY id DESC LIMIT 10`
  );
  console.log('\nrecent cashier_txn:', cashierTxns);

  const [cols] = await pool.query(
    `SELECT column_name, data_type, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_name='tbl_fin_journal_line'
        AND column_name IN ('debit','credit','journal_id','tva_amount')`
  );
  console.log('\njournal_line column types:', cols);

  // Retry journal for latest consultation receipt
  const [bills] = await pool.query(
    `SELECT id, doc_number, source_pk, total_amount, payment_method
       FROM tbl_billing_document
      WHERE source_module='payment_ticket'
      ORDER BY id DESC LIMIT 3`
  );
  console.log('\nrecent billing docs:', bills);

  if (bills[0]) {
    const { postReceiptJournal } = require('../lib/cashierTxnWire');
    const r = await postReceiptJournal(pool, {
      facilityId: 1,
      billingDocumentId: bills[0].id,
      grandTotal: parseFloat(bills[0].total_amount),
      paymentMethod: bills[0].payment_method || 'Cash',
      createdBy: 1,
      docNumber: bills[0].doc_number,
      firstLineDescription: 'retry consultation',
      sourceModule: 'payment_ticket',
    });
    console.log('\nretry consultation journal:', r, 'lastError:', journalPostLastError());
  }

  if (disb[0]) {
    const { afterCommitCashierPipeline } = require('../lib/cashierTransactionHub');
    const r = await afterCommitCashierPipeline(pool, {
      txnId: cashierTxns.find((t) => t.source_module === 'cashier_disbursement' && String(t.source_pk) === String(disb[0].id))?.id || null,
      journalKind: disb[0].txn_type === 'payout' ? 'payout' : 'expense',
      facilityId: 1,
      expenseId: disb[0].id,
      disbursementId: disb[0].id,
      amount: parseFloat(disb[0].amount),
      paymentMethod: 'Cash',
      expenseCategory: 'general',
      narration: disb[0].narration,
      createdBy: 1,
      reference: `CD-${disb[0].id}`,
    });
    console.log('\nretry disbursement journal:', r, 'lastError:', journalPostLastError());
  }

  await pool.end?.();
})().catch((e) => {
  console.error('ERR', e.message, e.stack);
  process.exit(1);
});
