require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  console.log('driver:', pool.driver);
  for (const table of ['tbl_billing_document', 'tbl_payment_ticket', 'tbl_patient_wallet_txn']) {
    const [cols] = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ?
       ORDER BY ordinal_position`,
      [table]
    );
    console.log('\n', table, ':', (cols || []).map((c) => c.column_name).join(', ') || '(missing)');
  }
  await pool.end?.();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
