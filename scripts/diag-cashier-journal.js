'use strict';
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { journalPostLastError } = require('../lib/hmsFinJournalPost');
const { syncReceiptJournalAfterCollect } = require('../lib/cashierTransactionHub');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const finOk = await finTablesOk(pool);
  const [txns] = await pool.query(
    `SELECT id, journal_header_id, amount, txn_type, cashier_code, billing_document_id,
            source_module, source_pk, gl_debit_account, gl_credit_account, created_at
       FROM tbl_cashier_txn ORDER BY id DESC LIMIT 5`
  ).catch(() => [[]]);
  const [bills] = await pool.query(
    `SELECT id, doc_number, total_amount, payment_method, source_module, source_pk, created_at
       FROM tbl_billing_document ORDER BY id DESC LIMIT 3`
  ).catch(() => [[]]);
  const [journals] = await pool.query(
    `SELECT id, source_type, source_id, reference, entry_date, status
       FROM tbl_fin_journal_header ORDER BY id DESC LIMIT 5`
  ).catch(() => [[]]);

  const pending = (txns || []).filter((t) => !t.journal_header_id);
  let retryResult = null;
  if (pending.length && pending[0].billing_document_id) {
    const t = pending[0];
    const [[bill]] = await pool.query(
      'SELECT * FROM tbl_billing_document WHERE id = ? LIMIT 1',
      [t.billing_document_id]
    );
    retryResult = await syncReceiptJournalAfterCollect(pool, {
      txnId: t.id,
      facilityId: 1,
      billingDocumentId: t.billing_document_id,
      grandTotal: parseFloat(t.amount) || parseFloat(bill?.total_amount) || 0,
      paymentMethod: bill?.payment_method || t.payment_method || 'Cash',
      createdBy: 1,
      docNumber: bill?.doc_number || '',
      firstLineDescription: bill?.doc_number || '',
      sourceModule: bill?.source_module || t.source_module,
    });
  }

  const [cashierTables] = await pool.query("SHOW TABLES LIKE 'tbl_cashier%'").catch(() => [[]]);
  const [cashierCount] = await pool.query('SELECT COUNT(*) AS n FROM tbl_cashier').catch(() => [[{ n: 0 }]]);
  const [acctCount] = await pool.query("SELECT COUNT(*) AS n FROM tbl_fin_account WHERE code IN ('552601','701601')").catch(() => [[{ n: 0 }]]);

  console.log(JSON.stringify({
    finTablesOk: finOk,
    cashierTables: cashierTables.map((r) => Object.values(r)[0]),
    cashierRegistryCount: cashierCount[0]?.n,
    keyAccounts: acctCount[0]?.n,
    lastJournalError: journalPostLastError(),
    recentTxns: txns,
    recentBills: bills,
    recentJournals: journals,
    pendingJournalLink: pending.length,
    retryOnLatest: retryResult,
    afterRetryError: journalPostLastError(),
  }, null, 2));

  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }));
  process.exit(1);
});
