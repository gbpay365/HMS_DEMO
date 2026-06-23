'use strict';

/** Smoke check: cashier txn table + hub + wire modules load. */
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const {
  ensureCashierTxnSchema,
  deriveServiceKey,
} = require('../lib/cashierTransactionHub');
const wire = require('../lib/cashierTxnWire');

(async () => {
  const pool = await createDbPool();
  await ensureCashierTxnSchema(pool);
  const key = deriveServiceKey([{ source_module: 'lab_order' }], { ticket_code: 'LAB-1' });
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM tbl_cashier_txn').catch(() => [[{ n: 0 }]]);
  console.log(JSON.stringify({
    ok: true,
    deriveServiceKey: key,
    txnCount: rows[0]?.n ?? rows[0]?.N ?? 0,
    wireExports: Object.keys(wire),
  }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
