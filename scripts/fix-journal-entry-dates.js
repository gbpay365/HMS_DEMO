'use strict';

/** Repair journal entry_date from source documents (billing receipts, disbursements). */
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const [r1] = await pool.query(`
    UPDATE tbl_fin_journal_header h
    INNER JOIN tbl_billing_document b ON h.source_type = 'billing_receipt' AND h.source_id = b.id
       SET h.entry_date = DATE(b.created_at)
     WHERE h.entry_date <> DATE(b.created_at)
  `).catch(() => [{ affectedRows: 0 }]);

  const [r2] = await pool.query(`
    UPDATE tbl_fin_journal_header h
    INNER JOIN tbl_cashier_disbursement d ON h.source_type IN ('expense', 'cashier_payout') AND h.source_id = d.id
       SET h.entry_date = DATE(d.created_at)
     WHERE h.entry_date <> DATE(d.created_at)
  `).catch(() => [{ affectedRows: 0 }]);

  console.log(JSON.stringify({
    ok: true,
    billingReceiptsFixed: r1?.affectedRows ?? 0,
    disbursementsFixed: r2?.affectedRows ?? 0,
  }, null, 2));

  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
