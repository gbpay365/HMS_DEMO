'use strict';

const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(
    `SELECT LOWER(d.payment_method) AS pm,
            COUNT(*)::int AS journals,
            SUM(CASE WHEN t.external_sync_status = 'sent' THEN 1 ELSE 0 END)::int AS cashier_sent,
            SUM(CASE WHEN h.external_core_sync_status = 'sent' THEN 1 ELSE 0 END)::int AS journal_sent
       FROM tbl_fin_journal_header h
       JOIN tbl_billing_document d ON d.id = h.source_id AND h.source_type = 'billing_receipt'
       LEFT JOIN tbl_cashier_txn t ON t.journal_header_id = h.id
      GROUP BY 1
      ORDER BY journals DESC`
  );
  console.log(JSON.stringify(rows, null, 2));
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
