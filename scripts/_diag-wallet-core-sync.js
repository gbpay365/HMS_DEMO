'use strict';

const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGHOST ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();

  const [[counts]] = await c
    .query(
      `SELECT
         (SELECT COUNT(*)::int FROM tbl_billing_document WHERE LOWER(payment_method) = 'wallet') AS wallet_docs,
         (SELECT COUNT(*)::int FROM tbl_billing_document WHERE LOWER(payment_method) = 'cash') AS cash_docs`
    )
    .then((r) => [r.rows]);

  console.log('billing counts:', counts);

  const { rows } = await c.query(
    `SELECT h.id AS journal_id, h.reference, h.external_core_sync_status AS journal_core_sync,
            d.payment_method, d.doc_number, d.created_at, d.total_amount,
            t.id AS txn_id, t.external_sync_status AS cashier_core_sync
       FROM tbl_fin_journal_header h
       JOIN tbl_billing_document d ON d.id = h.source_id AND h.source_type = 'billing_receipt'
       LEFT JOIN tbl_cashier_txn t ON t.journal_header_id = h.id
      WHERE LOWER(d.payment_method) = 'wallet'
      ORDER BY h.id DESC
      LIMIT 12`
  );
  console.log('recent wallet journals:', JSON.stringify(rows, null, 2));

  if (rows.length) {
    const ids = rows.map((r) => r.journal_id).join(',');
    const { rows: lines } = await c.query(
      `SELECT journal_id, account_code, debit, credit, line_memo
         FROM tbl_fin_journal_line
        WHERE journal_id IN (${ids})
        ORDER BY journal_id, id`
    );
    console.log('wallet journal lines:', JSON.stringify(lines, null, 2));
  }

  const { rows: pending } = await c.query(
    `SELECT COUNT(*)::int AS pending_wallet
       FROM tbl_fin_journal_header h
       JOIN tbl_billing_document d ON d.id = h.source_id AND h.source_type = 'billing_receipt'
      WHERE LOWER(d.payment_method) = 'wallet'
        AND (h.external_core_sync_status IS NULL OR h.external_core_sync_status IN ('pending','failed'))`
  );
  console.log('pending wallet journal sync:', pending[0]);

  const { rows: cashLines } = await c.query(
    `SELECT h.id AS journal_id, d.payment_method, jl.account_code, jl.debit, jl.credit
       FROM tbl_fin_journal_header h
       JOIN tbl_billing_document d ON d.id = h.source_id AND h.source_type = 'billing_receipt'
       JOIN tbl_fin_journal_line jl ON jl.journal_id = h.id
      WHERE LOWER(d.payment_method) = 'cash'
      ORDER BY h.id DESC, jl.id
      LIMIT 9`
  );
  console.log('recent cash journal lines:', JSON.stringify(cashLines, null, 2));

  const { rows: syncStats } = await c.query(
    `SELECT LOWER(d.payment_method) AS payment_method,
            COUNT(*)::int AS journals,
            SUM(CASE WHEN h.external_core_sync_status = 'sent' THEN 1 ELSE 0 END)::int AS sent,
            SUM(CASE WHEN h.external_core_sync_status = 'failed' THEN 1 ELSE 0 END)::int AS failed,
            SUM(CASE WHEN h.external_core_sync_status IS NULL OR h.external_core_sync_status = 'pending' THEN 1 ELSE 0 END)::int AS pending
       FROM tbl_fin_journal_header h
       JOIN tbl_billing_document d ON d.id = h.source_id AND h.source_type = 'billing_receipt'
      GROUP BY LOWER(d.payment_method)
      ORDER BY journals DESC`
  );
  console.log('core sync by payment method:', JSON.stringify(syncStats, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
