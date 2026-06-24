'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { postReceiptJournal } = require('../lib/cashierTxnWire');
const { afterCommitCashierPipeline } = require('../lib/cashierTransactionHub');

(async () => {
  const pool = createDbPool();
  await ensureFinAccountingSchema(pool, { facilityId: 1 });

  for (const billId of [60, 61, 62]) {
    const [[bill]] = await pool.query('SELECT * FROM tbl_billing_document WHERE id=?', [billId]);
    if (!bill) continue;
    const [[txn]] = await pool.query(
      'SELECT id FROM tbl_cashier_txn WHERE source_module=? AND source_pk=? LIMIT 1',
      ['payment_ticket', bill.source_pk]
    );
    const r = await postReceiptJournal(pool, {
      txnId: txn?.id || null,
      facilityId: 1,
      billingDocumentId: bill.id,
      grandTotal: parseFloat(bill.total_amount),
      paymentMethod: bill.payment_method || 'Cash',
      createdBy: bill.created_by || 1,
      docNumber: bill.doc_number,
      firstLineDescription: bill.doc_number,
    });
    console.log('bill', bill.doc_number, r);
  }

  for (const disbId of [6, 8]) {
    const [[d]] = await pool.query('SELECT * FROM tbl_cashier_disbursement WHERE id=?', [disbId]);
    if (!d) continue;
    const [[txn]] = await pool.query(
      'SELECT id, cashier_code, cashier_identity FROM tbl_cashier_txn WHERE source_module=? AND source_pk=? LIMIT 1',
      ['cashier_disbursement', d.id]
    );
    const r = await afterCommitCashierPipeline(pool, {
      txnId: txn?.id || null,
      journalKind: 'expense',
      facilityId: 1,
      expenseId: d.id,
      amount: parseFloat(d.amount),
      paymentMethod: d.payment_method || 'Cash',
      expenseCategory: d.category || 'general',
      narration: d.narration,
      createdBy: d.created_by || 1,
      cashierCode: txn?.cashier_code,
      cashierIdentity: txn?.cashier_identity,
      reference: `CD-${d.id}`,
    });
    console.log('disb', `CD-${d.id}`, r);
  }

  await pool.end?.();
})();
