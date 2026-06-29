'use strict';
/**
 * Backfill GL journals for cashier disbursements missing a posted entry.
 * Usage: node scripts/backfill-cashier-disbursement-journals.js [--dry-run]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  });

  const { normalizeDisbursementType } = require('../lib/cashierDisbursementOptions');
  const {
    syncDisbursementExpenseJournal,
    syncPayoutJournalAfterCashier,
  } = require('../lib/cashierTransactionHub');
  const { ensureCashierTxnSchema } = require('../lib/ensureCashierTxnSchema');
  await ensureCashierTxnSchema(pool).catch(() => {});

  const [rows] = await pool.query(
    `SELECT d.id, d.facility_id, d.txn_type, d.category, d.amount, d.payment_method,
            d.narration, d.created_by, d.created_at,
            t.id AS cashier_txn_id, t.cashier_code, t.cashier_identity
       FROM tbl_cashier_disbursement d
       LEFT JOIN tbl_fin_journal_header j
         ON j.source_type = 'cashier_disbursement' AND j.source_id = d.id
        AND j.status = 'posted'
       LEFT JOIN tbl_cashier_txn t
         ON t.source_module = 'cashier_disbursement' AND t.source_pk = d.id
      WHERE j.id IS NULL
      ORDER BY d.id ASC`
  );

  console.log(`Found ${rows.length} disbursement(s) without posted journal.`);
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const { glKind } = normalizeDisbursementType(row.txn_type);
    const opts = {
      facilityId: row.facility_id || 1,
      disbursementId: row.id,
      expenseId: row.id,
      disbursementType: row.txn_type,
      amount: row.amount,
      paymentMethod: row.payment_method || 'Cash',
      expenseCategory: row.category || 'general',
      narration: row.narration || '',
      createdBy: row.created_by || 0,
      txnId: row.cashier_txn_id || null,
      cashierCode: row.cashier_code || '',
      cashierIdentity: row.cashier_identity || '',
      reference: `CD-${row.id}`,
      expenseDate: String(row.created_at || '').slice(0, 10),
    };

    if (dryRun) {
      console.log(`[dry-run] CD-${row.id} ${glKind} ${row.amount} ${row.txn_type}`);
      continue;
    }

    const r =
      glKind === 'payout'
        ? await syncPayoutJournalAfterCashier(pool, opts)
        : await syncDisbursementExpenseJournal(pool, opts);

    if (r.ok || r.duplicate) {
      ok++;
      console.log(`OK CD-${row.id} journal=${r.journalHeaderId || 'duplicate'}`);
    } else {
      fail++;
      const { journalPostLastError } = require('../lib/hmsFinJournalPost');
      console.error(`FAIL CD-${row.id}:`, journalPostLastError() || 'unknown');
    }
  }

  if (!dryRun) console.log(`Done: ${ok} posted, ${fail} failed.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
