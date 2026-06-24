'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { journalPostLastError } = require('../lib/hmsFinJournalPost');

(async () => {
  const pool = createDbPool();
  const code = process.argv[2] || 'CON-4596-MOZAA3CV';
  console.log('driver', pool.driver);
  console.log('finTablesOk', await finTablesOk(pool));
  const [[acctCnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
  console.log('active_coa_accounts', acctCnt?.c);

  let [[t]] = await pool.query(
    'SELECT id, ticket_code, status, total_amount, paid_at FROM tbl_payment_ticket WHERE ticket_code=? LIMIT 1',
    [code]
  );
  if (!t) {
    const [recent] = await pool.query(
      `SELECT id, ticket_code, status, total_amount, paid_at
         FROM tbl_payment_ticket
        WHERE ticket_code LIKE ? OR status='paid'
        ORDER BY paid_at DESC NULLS LAST, id DESC
        LIMIT 8`,
      [`%${code.split('-')[1] || '4596'}%`]
    );
    console.log('recent_tickets', recent);
    t = recent && recent[0];
  }
  console.log('ticket', t);
  if (!t) {
    await pool.end?.();
    return;
  }

  const [bd] = await pool.query(
    `SELECT id, doc_number, source_module, source_pk, total_amount, payment_method, created_at
       FROM tbl_billing_document
      WHERE source_module='payment_ticket' AND source_pk=?
      ORDER BY id DESC LIMIT 3`,
    [t.id]
  );
  console.log('billing_docs', bd);

  const [ct] = await pool.query(
    `SELECT id, journal_header_id, cashier_code, amount, status
       FROM tbl_cashier_txn
      WHERE source_module='payment_ticket' AND source_pk=?`,
    [t.id]
  );
  console.log('cashier_txn', ct);

  if (bd[0]) {
    const [cols] = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name='tbl_fin_journal_line' AND column_name IN ('debit','credit','journal_id')
        ORDER BY column_name`
    ).catch(() => [[]]);
    console.log('journal_line_cols', cols);
    const [jh] = await pool.query(
      `SELECT id, reference, source_type, source_id, status, journal_code, narration
         FROM tbl_fin_journal_header
        WHERE (source_type='billing_receipt' AND source_id=?)
           OR reference=?
        ORDER BY id DESC LIMIT 5`,
      [bd[0].id, bd[0].doc_number]
    );
    console.log('journals', jh);

    // Try journal post now
    const { postReceiptJournal } = require('../lib/cashierTxnWire');
    const result = await postReceiptJournal(pool, {
      txnId: ct[0]?.id || null,
      facilityId: 1,
      billingDocumentId: bd[0].id,
      grandTotal: parseFloat(bd[0].total_amount) || parseFloat(t.total_amount),
      paymentMethod: bd[0].payment_method || 'Cash',
      createdBy: 1,
      docNumber: bd[0].doc_number,
      firstLineDescription: code,
      sourceModule: 'payment_ticket',
    });
    console.log('retry_post_result', result);
    console.log('last_error', journalPostLastError());
  }

  await pool.end?.();
})().catch((e) => {
  console.error('ERR', e.message, e.stack);
  process.exit(1);
});
